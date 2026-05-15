"use client";

import { useEffect, useState } from "react";
import { ParentPicker } from "@/components/ui/parent-picker";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Avatar } from "@/components/ui/avatar";
import { Menu } from "@/components/ui/menu";
import { TagPill } from "@/components/ui/tag-pill";
import { Icon, PriorityIcon, TypeIcon } from "@/components/icons";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { AiSuggestButton } from "@/components/ui/ai-suggest-button";
import { TShirtPicker } from "@/components/tshirt-picker";
import { PEOPLE } from "@/lib/data";
import { useCustomOptions, useWpSchema } from "@/lib/hooks/use-openproject-detail";
import { cn, findById } from "@/lib/utils";
import { usePublicConfig } from "@/components/config-provider";

const schema = z.object({
  type: z.string().min(1, "Pick a type"),
  title: z.string().trim().min(1, "Title is required").max(255, "Title too long"),
  description: z.string().optional().default(""),
  assignee: z.string().nullable().optional(),
  priority: z.string().min(1, "Pick a priority"),
  points: z.union([z.number(), z.string()]).nullable().optional(),
  pointsHref: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  sprint: z.string().nullable().optional(),
  epic: z.string().nullable().optional(),
  labels: z.array(z.string()).default([]),
  status: z.string().nullable().optional(),
});

// ── UX tokens ────────────────────────────────────────────────────────────
// One source of truth for the picker rows so visual rhythm is consistent
// across every attribute. The picker is borderless inside its row and gets
// its hover affordance from the surrounding row hover.
const ROW =
  "flex items-center gap-2 h-9 px-2 -mx-2 rounded-md hover:bg-surface-subtle transition-colors";
const ROW_LABEL =
  "inline-flex items-center gap-2 w-32 shrink-0 text-[12.5px] font-medium text-fg-muted";
const ROW_VALUE =
  "flex-1 inline-flex items-center gap-2 min-w-0 text-[13px] text-fg cursor-pointer text-left";
const ROW_PLACEHOLDER = "text-fg-faint font-normal";

const TITLE_INPUT =
  "w-full h-12 px-0 border-0 outline-none bg-transparent text-[20px] font-display font-bold text-fg placeholder:text-fg-faint focus:placeholder:text-fg-subtle";

// "Type" tab strip at the top — surfaces the most-likely-to-flip decision.
// When the OP types list hasn't loaded yet, render nothing rather than a
// hard-coded keyword guess.
function TypeStrip({ types, value, onChange }) {
  const list = (types || []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  if (list.length === 0) return null;
  return (
    <div
      className="flex items-center gap-1 flex-wrap"
      role="tablist"
      aria-label="Issue type"
    >
      {list.map((t) => {
        const active = String(t.id) === String(value);
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(String(t.id))}
            className={cn(
              "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[12px] font-medium transition-colors",
              active
                ? "bg-accent-50 border-accent-200 text-accent-700"
                : "bg-surface-elevated border-border text-fg-muted hover:bg-surface-subtle hover:border-border-strong",
            )}
          >
            <TypeIcon name={t.name} color={t.color} size={12} />
            {t.name}
          </button>
        );
      })}
    </div>
  );
}

// Compact Fibonacci button row for numeric story-point fields. Mirrors
// TShirtPicker's geometry so the two pickers feel consistent regardless of
// which estimation mode the project is on.
const FIB_SCALE = [1, 2, 3, 5, 8, 13, 21];

function NumericPointsPicker({ value, onChange }) {
  return (
    <div className="inline-flex gap-0.5">
      {FIB_SCALE.map((n) => {
        const active = value === n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={cn(
              "min-w-6 h-6 px-1.5 rounded text-[10.5px] font-semibold transition-colors cursor-pointer tabular-nums",
              active
                ? "bg-accent text-on-accent"
                : "bg-surface-muted text-fg-muted border border-transparent hover:bg-surface-subtle hover:border-border",
            )}
          >
            {n}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => onChange(null)}
        title="Clear"
        className="min-w-6 h-6 px-1.5 rounded text-[10.5px] font-semibold text-fg-subtle bg-transparent border border-transparent hover:bg-surface-subtle"
      >
        —
      </button>
    </div>
  );
}

export function CreateTask({
  onClose,
  onCreate,
  defaultSprint = null,
  defaultStatus = null,
  defaultParent = null,
  defaultParentName = null,
  projectName = "Project",
  projectId = null,
  categories = [],
  types = [],
  priorities = [],
  sprints = [],
  epics = [],
  assignees = [],
  tasks = [],
  currentUser = null,
}) {
  const [createMore, setCreateMore] = useState(false);
  const [assignMenu, setAssignMenu] = useState(null);
  const [priorityMenu, setPriorityMenu] = useState(null);
  const [sprintMenu, setSprintMenu] = useState(null);
  const [labelMenu, setLabelMenu] = useState(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { isSubmitting, errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      // Form values are unique OpenProject IDs (strings). The defaults pick
      // up the project's configured default type/priority via `isDefault`
      // once the lists arrive (see effect below).
      type: types?.[0]?.id ? String(types[0].id) : "",
      title: "",
      description: "",
      assignee: null,
      priority: "",
      points: null,
      sprint: defaultSprint,
      status: defaultStatus,
      epic: defaultParent,
      labels: [],
    },
  });

  const type = useWatch({ control, name: "type" });
  const assignee = useWatch({ control, name: "assignee" });
  const priority = useWatch({ control, name: "priority" });
  const watchedTitle = useWatch({ control, name: "title" });

  const points = useWatch({ control, name: "points" });
  const pointsHref = useWatch({ control, name: "pointsHref" });
  const sprint = useWatch({ control, name: "sprint" });

  // Once priorities load, hydrate the form's priority with the project's
  // configured default — `priority.isDefault` is the API truth.
  useEffect(() => {
    if (!priorities || priorities.length === 0) return;
    if (priority) return;
    const def = priorities.find((p) => p.isDefault) || priorities[0];
    if (def) setValue("priority", String(def.id));
  }, [priorities, priority, setValue]);

  // Hydrate sprint once the active sprint resolves (sprintsQ may still be
  // loading when the modal mounts). Only set if the user hasn't picked yet.
  useEffect(() => {
    if (!defaultSprint) return;
    if (sprint) return;
    setValue("sprint", defaultSprint);
  }, [defaultSprint, sprint, setValue]);
  const epicId = useWatch({ control, name: "epic" });
  const [parentName, setParentName] = useState(defaultParentName);

  // Derive a story-points schema from any task whose type matches — its
  // schemaHref tells us whether SP is a CustomOption (t-shirt sizes) or
  // numeric, and exposes the option list either via allowedValues or via
  // sample-WP discovery on the schema route. Falls back to any task, then
  // null (renders the legacy numeric picker).
  const schemaHref = (() => {
    const list = Array.isArray(tasks) ? tasks : [];
    return (
      list.find((t) => String(t.typeId) === String(type))?.schemaHref ||
      list[0]?.schemaHref ||
      null
    );
  })();
  const schemaQ = useWpSchema(schemaHref);
  const { storyPointsField, aiEnabled } = usePublicConfig();
  const spField = schemaQ.data?.fields?.[storyPointsField];
  const spIsCustomOption = spField?.type === "CustomOption";
  const spOptionsQ = useCustomOptions(
    spField?.allowedValuesHref,
    !!spField?.allowedValuesHref,
  );
  const spOptions = spOptionsQ.data || spField?.allowedValues || null;

  // Default size to the middle option once the t-shirt list loads.
  // Only fires when nothing is selected yet so a user's explicit clear is respected.
  useEffect(() => {
    if (!spIsCustomOption || !spOptions || spOptions.length === 0) return;
    if (pointsHref) return;
    const mid = spOptions[Math.floor((spOptions.length - 1) / 2)];
    if (mid) {
      setValue("pointsHref", mid.href || mid.id);
      setValue("points", mid.value ?? mid.label ?? null);
    }
  }, [spIsCustomOption, spOptions, pointsHref, setValue]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onSubmit = (values) => {
    const labelNames = values.labels || [];
    const categoryIds = categories
      .filter((c) => labelNames.includes(c.name))
      .map((c) => c.id);
    const sp = spIsCustomOption
      ? { pointsHref: values.pointsHref || null }
      : { points: values.points ?? null };
    onCreate({
      ...values,
      ...sp,
      categoryIds,
    });
    if (createMore) {
      reset({ ...values, title: "", description: "" });
    } else {
      onClose();
    }
  };

  const selectedAssignee = assignee
    ? findById(assignees, assignee) ||
      PEOPLE[assignee] ||
      { id: assignee, name: "Assignee" }
    : null;

  const selectedSprint = sprint
    ? sprints.find((s) => s.id === sprint)?.name || null
    : null;


  const labels = useWatch({ control, name: "labels" });
  const selectedTag = (labels || [])[0] || null;
  const startDate = useWatch({ control, name: "startDate" });
  const dueDate = useWatch({ control, name: "dueDate" });

  const pointsLabel = spIsCustomOption
    ? (spOptions || []).find(
        (o) => o.href === pointsHref || o.id === pointsHref,
      )?.value || null
    : points || null;

  const priorityRecord = findById(priorities, priority);
  const priorityLabel = priorityRecord?.name || "";

  return (
    <div
      className="fixed inset-0 z-100 grid place-items-center p-4 sm:p-6 scrim animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            handleSubmit(onSubmit)();
          }
        }}
        className="bg-surface-elevated rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[calc(100vh-32px)] animate-slide-up"
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <header className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-border-soft">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wider text-fg-faint mb-1.5">
              {projectName} · New work package
            </div>
            <TypeStrip
              types={types}
              value={type}
              onChange={(v) => setValue("type", v, { shouldValidate: true })}
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid place-items-center w-8 h-8 -mr-1 rounded-md text-fg-subtle hover:bg-surface-subtle hover:text-fg cursor-pointer"
          >
            <Icon name="x" size={14} aria-hidden="true" />
          </button>
        </header>

        {/* ── Body ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Title (hero) */}
          <input
            autoFocus
            placeholder="What needs to be done?"
            className={TITLE_INPUT}
            {...register("title")}
            aria-invalid={!!errors.title}
          />
          {errors.title && (
            <div className="text-pri-highest text-[12px] mt-1">{errors.title.message}</div>
          )}
          {aiEnabled && (
            <AiSuggestButton
              mode="title"
              label="Improve title"
              variant="insert"
              payload={{
                title: watchedTitle,
                parentTitle: parentName || undefined,
              }}
              onAccept={(t) => setValue("title", t, { shouldValidate: true })}
              disabled={!watchedTitle?.trim()}
            />
          )}

          {/* Description */}
          <div className="mt-3">
            <Controller
              control={control}
              name="description"
              render={({ field }) => {
                const parentEpic = epicId
                  ? (epics || []).find(
                      (e) =>
                        String(e.id) === String(epicId) ||
                        String(e.nativeId) === String(epicId)
                    )
                  : null;
                return (
                  <>
                    <RichTextEditor
                      value={field.value || ""}
                      onChange={field.onChange}
                      placeholder="Add context, acceptance criteria, or links… (optional)"
                      minHeight={140}
                    />
                    {aiEnabled && (
                      <AiSuggestButton
                        mode="description"
                        label="Suggest description"
                        payload={{
                          title: watchedTitle,
                          description: field.value || "",
                          parentTitle: parentEpic?.title || parentName || undefined,
                          parentDescription: parentEpic?.descriptionHtml || undefined,
                        }}
                        onAccept={(html) => field.onChange(html)}
                        disabled={!watchedTitle?.trim()}
                      />
                    )}
                  </>
                );
              }}
            />
          </div>

          {/* Details */}
          <div className="mt-5">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                Details
              </span>
              <span className="flex-1 h-px bg-border-soft" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0">
              {/* Assignee */}
              <div className={ROW}>
                <span className={ROW_LABEL}>
                  <Icon name="people" size={13} aria-hidden="true" />
                  Assignee
                </span>
                <button
                  type="button"
                  className={ROW_VALUE}
                  onClick={(e) =>
                    setAssignMenu(e.currentTarget.getBoundingClientRect())
                  }
                >
                  {selectedAssignee ? (
                    <>
                      <Avatar user={selectedAssignee} size="sm" />
                      <span className="truncate">{selectedAssignee.name}</span>
                    </>
                  ) : (
                    <span className={ROW_PLACEHOLDER}>Unassigned</span>
                  )}
                  <Icon
                    name="chev-down"
                    size={11}
                    className="ml-auto text-fg-subtle shrink-0"
                    aria-hidden="true"
                  />
                </button>
                {assignMenu && (
                  <Menu
                    anchorRect={assignMenu}
                    onClose={() => setAssignMenu(null)}
                    onSelect={(it) => setValue("assignee", it.value)}
                    searchable
                    searchPlaceholder="Search people…"
                    width={240}
                    items={[
                      { label: "Unassigned", value: null, active: !assignee },
                      ...(currentUser?.id
                        ? [
                            {
                              label: "Assign to me",
                              value: currentUser.id,
                              avatar: currentUser,
                            },
                          ]
                        : []),
                      { divider: true },
                      ...(Array.isArray(assignees) ? assignees : []).map((p) => ({
                        label: p.name,
                        value: p.id,
                        avatar: p,
                        active: String(p.id) === String(assignee),
                      })),
                    ]}
                  />
                )}
              </div>

              {/* Priority */}
              <div className={ROW}>
                <span className={ROW_LABEL}>
                  <Icon name="flag" size={13} aria-hidden="true" />
                  Priority
                </span>
                <button
                  type="button"
                  className={ROW_VALUE}
                  onClick={(e) =>
                    setPriorityMenu(e.currentTarget.getBoundingClientRect())
                  }
                >
                  <PriorityIcon
                    name={priorityRecord?.name}
                    color={priorityRecord?.color}
                    position={priorityRecord?.position}
                    totalPositions={(priorities || []).length}
                    size={13}
                  />
                  <span className="truncate">{priorityLabel || "Select"}</span>
                  <Icon
                    name="chev-down"
                    size={11}
                    className="ml-auto text-fg-subtle shrink-0"
                    aria-hidden="true"
                  />
                </button>
                {priorityMenu && (
                  <Menu
                    anchorRect={priorityMenu}
                    onClose={() => setPriorityMenu(null)}
                    onSelect={(it) => setValue("priority", it.value)}
                    items={(priorities || [])
                      .slice()
                      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                      .map((p) => ({
                        label: p.name,
                        value: String(p.id),
                        swatch: p.color || "var(--text-3)",
                        active: String(p.id) === String(priority),
                      }))}
                  />
                )}
              </div>

              {/* Duration mode: schema doesn't expose the configured points
                  field, so the project measures work in start/due dates.
                  Surface a paired date row instead of the points picker. */}
              {!schemaQ.isLoading && spField === undefined && (
                <div className={ROW}>
                  <span className={ROW_LABEL}>
                    <Icon name="calendar" size={13} aria-hidden="true" />
                    Schedule
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={startDate || ""}
                      onChange={(e) =>
                        setValue("startDate", e.target.value || null)
                      }
                      className="h-8 px-2 rounded-md border border-border bg-surface-elevated text-[13px] text-fg outline-none focus:border-accent"
                      aria-label="Start date"
                    />
                    <Icon
                      name="chev-right"
                      size={11}
                      className="text-fg-subtle"
                      aria-hidden="true"
                    />
                    <input
                      type="date"
                      value={dueDate || ""}
                      onChange={(e) =>
                        setValue("dueDate", e.target.value || null)
                      }
                      className="h-8 px-2 rounded-md border border-border bg-surface-elevated text-[13px] text-fg outline-none focus:border-accent"
                      aria-label="Due date"
                    />
                  </div>
                </div>
              )}

              {/* Story points — hidden when the project is on duration mode.
                  CustomOption schemas (t-shirt sizes) render as compact
                  inline buttons so the size is one click instead of a
                  click-then-pick. Numeric schemas reuse the same compact
                  button row over the standard Fibonacci scale. */}
              {!(spField === undefined && !schemaQ.isLoading) && (
              <div className={ROW}>
                <span className={ROW_LABEL}>
                  <Icon name="chart" size={13} aria-hidden="true" />
                  {spField?.name || "Points"}
                </span>
                <div className="flex-1 min-w-0">
                  {spIsCustomOption ? (
                    <TShirtPicker
                      value={pointsLabel}
                      allowed={spOptions || []}
                      onChange={(label, href) => {
                        setValue("pointsHref", href);
                        setValue("points", label);
                      }}
                    />
                  ) : (
                    <NumericPointsPicker
                      value={points}
                      onChange={(n) => setValue("points", n)}
                    />
                  )}
                </div>
              </div>
              )}

              {/* Sprint */}
              <div className={ROW}>
                <span className={ROW_LABEL}>
                  <Icon name="sprint" size={13} aria-hidden="true" />
                  Sprint
                </span>
                <button
                  type="button"
                  className={ROW_VALUE}
                  onClick={(e) =>
                    setSprintMenu(e.currentTarget.getBoundingClientRect())
                  }
                >
                  {selectedSprint ? (
                    <span className="truncate">{selectedSprint}</span>
                  ) : (
                    <span className={ROW_PLACEHOLDER}>Select</span>
                  )}
                  <Icon
                    name="chev-down"
                    size={11}
                    className="ml-auto text-fg-subtle shrink-0"
                    aria-hidden="true"
                  />
                </button>
                {sprintMenu && (
                  <Menu
                    anchorRect={sprintMenu}
                    onClose={() => setSprintMenu(null)}
                    onSelect={(it) => setValue("sprint", it.value)}
                    items={sprints.map((s) => ({
                      label: s.name,
                      value: s.id,
                      active: s.id === sprint,
                    }))}
                  />
                )}
              </div>

              {/* Parent */}
              <div className={ROW}>
                <span className={ROW_LABEL}>
                  <Icon name="epic" size={13} aria-hidden="true" />
                  Parent
                </span>
                <ParentPicker
                  triggerClassName={`${ROW_VALUE} ${!epicId ? ROW_PLACEHOLDER : ""}`}
                  value={epicId || null}
                  valueName={parentName}
                  projectId={projectId}
                  excludeId={null}
                  onChange={(id, name) => {
                    setValue("epic", id);
                    setParentName(name);
                  }}
                >
                  {({ displayName }) => (
                    <>
                      <span className="truncate">{displayName || <span className={ROW_PLACEHOLDER}>None</span>}</span>
                      <Icon name="chev-down" size={11} className="ml-auto text-fg-subtle shrink-0" aria-hidden="true" />
                    </>
                  )}
                </ParentPicker>
              </div>

              {/* Tag (single category) */}
              <div className={ROW}>
                <span className={ROW_LABEL}>
                  <Icon name="tag" size={13} aria-hidden="true" />
                  Tag
                </span>
                <Controller
                  control={control}
                  name="labels"
                  render={({ field }) => {
                    const sel = field.value?.[0] || null;
                    return (
                      <>
                        <button
                          type="button"
                          className={ROW_VALUE}
                          onClick={(e) =>
                            setLabelMenu(e.currentTarget.getBoundingClientRect())
                          }
                        >
                          {sel ? (
                            <TagPill name={sel} size="xs" />
                          ) : (
                            <span className={ROW_PLACEHOLDER}>None</span>
                          )}
                          <Icon
                            name="chev-down"
                            size={11}
                            className="ml-auto text-fg-subtle shrink-0"
                            aria-hidden="true"
                          />
                        </button>
                        {labelMenu && (
                          <Menu
                            anchorRect={labelMenu}
                            onClose={() => setLabelMenu(null)}
                            searchable={(categories?.length || 0) > 6}
                            searchPlaceholder="Search tags…"
                            onSelect={(it) =>
                              field.onChange(it.value ? [it.value] : [])
                            }
                            items={
                              categories.length > 0
                                ? [
                                    { label: "None", value: null, active: !sel },
                                    ...categories.map((c) => ({
                                      label: c.name,
                                      value: c.name,
                                      active: c.name === sel,
                                    })),
                                  ]
                                : [
                                    {
                                      label: "(no tags in this project)",
                                      value: null,
                                      disabled: true,
                                    },
                                  ]
                            }
                          />
                        )}
                      </>
                    );
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <footer className="flex items-center gap-3 px-5 py-3 border-t border-border bg-surface-subtle rounded-b-2xl">
          <label className="inline-flex items-center gap-2 text-[12.5px] text-fg-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={createMore}
              onChange={(e) => setCreateMore(e.target.checked)}
              className="accent-accent"
            />
            Create another
          </label>
          <span className="hidden sm:inline-flex items-center gap-1 ml-auto text-[11px] text-fg-faint">
            <kbd className="font-mono px-1.5 py-px rounded border border-border bg-surface-elevated text-fg-subtle">
              ⌘
            </kbd>
            <kbd className="font-mono px-1.5 py-px rounded border border-border bg-surface-elevated text-fg-subtle">
              ↵
            </kbd>
            to create
          </span>
          <div className="flex gap-2 sm:ml-3 ml-auto">
            <button
              type="button"
              className="inline-flex items-center h-8 px-3 rounded-md border border-border bg-surface-elevated text-fg text-[13px] font-medium hover:bg-surface-subtle hover:border-border-strong"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center h-8 px-3.5 rounded-md bg-accent text-on-accent text-[13px] font-semibold hover:bg-accent-600 disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Creating…" : "Create"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
