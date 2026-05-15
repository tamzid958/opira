"use client";

import { useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { friendlyError } from "@/lib/api-client";
import { cn, findById, formatRelDate } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { CommentHtml } from "@/components/ui/comment-html";
import {
  TaskPriorityIcon,
  TaskStatusPill,
  TaskTypeIcon,
} from "@/components/ui/task-meta";
import { Menu } from "@/components/ui/menu";
import { LoadingPill } from "@/components/ui/loading-pill";
import { TagPill } from "@/components/ui/tag-pill";
import { DatePicker } from "@/components/ui/date-picker";
import { Icon } from "@/components/icons";
import { CarryOverChip } from "@/components/ui/carryover-chip";
import { SubtaskBreakdown } from "@/components/subtask-breakdown";
import { RelationsPanel } from "@/components/relations-panel";
import { ActivityItem } from "@/components/activity-item";
import { AttachmentsGrid } from "@/components/attachments-grid";
import { FileLinksPanel } from "@/components/file-links-panel";
import { GithubPanel } from "@/components/github-panel";
import { RevisionsPanel } from "@/components/revisions-panel";
import { WatcherButton } from "@/components/watcher-button";
import { TimeEntriesPanel } from "@/components/time-entries-panel";
import { RemindersPanel } from "@/components/reminders-panel";
import { ParentPicker } from "@/components/ui/parent-picker";
import { TShirtPicker } from "@/components/tshirt-picker";
import { EstimatePicker } from "@/components/estimate-picker";
import { PokerTab } from "@/components/poker-tab";
import {
  RichTextEditor,
  isHtmlEmpty,
} from "@/components/ui/rich-text-editor";
import { PEOPLE } from "@/lib/data";
import {
  useActivities,
  useCarryover,
  useCustomOptions,
  useAvailableAssignees,
  usePostComment,
  useUpdateComment,
  useWpFileLinks,
  useWpGithubPullRequests,
  useWpRevisions,
  useWpSchema,
} from "@/lib/hooks/use-openproject-detail";
import { usePublicConfig } from "@/components/config-provider";

// Reusable Tailwind class strings — keep the JSX readable.
const FIELD_BTN =
  "flex items-center gap-1.5 min-h-7 -mx-1.5 px-1.5 py-1 rounded-md border-2 border-transparent text-[13px] cursor-pointer transition-colors hover:bg-surface-subtle hover:border-border-soft";
const FIELD_LABEL = "text-xs text-fg-subtle self-center whitespace-nowrap";
const BTN_BASE =
  "inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-md border border-border bg-surface-elevated text-fg text-xs font-medium whitespace-nowrap transition-colors hover:bg-surface-subtle hover:border-border-strong";
const BTN_PRIMARY =
  "inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-md bg-accent text-on-accent text-xs font-semibold whitespace-nowrap transition-transform shadow-(--card-highlight) hover:-translate-y-px hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0";
const BTN_GHOST =
  "inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-md border border-transparent bg-transparent text-fg text-xs font-medium whitespace-nowrap transition-colors hover:bg-surface-subtle";

function InlineSelect({
  value,
  items,
  onChange,
  render,
  placeholder = "None",
  disabled = false,
  disabledMessage = "You don't have permission to do that.",
  searchable = false,
  searchPlaceholder,
  menuWidth,
  menuMaxHeight,
}) {
  const [open, setOpen] = useState(null);
  const isEmpty = !value;
  return (
    <>
      <div
        className={[
          FIELD_BTN,
          isEmpty ? "text-fg-faint" : "",
          disabled ? "opacity-60 cursor-default hover:bg-transparent hover:border-transparent" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={(e) => {
          if (disabled) return;
          setOpen(e.currentTarget.getBoundingClientRect());
        }}
        title={disabled ? disabledMessage : undefined}
        aria-disabled={disabled || undefined}
      >
        {render ? render(value) : value || placeholder}
      </div>
      {open && !disabled && (
        <Menu
          anchorRect={open}
          onClose={() => setOpen(null)}
          onSelect={(it) => onChange(it.value)}
          items={items}
          searchable={searchable}
          searchPlaceholder={searchPlaceholder}
          width={menuWidth || 200}
          maxHeight={menuMaxHeight}
        />
      )}
    </>
  );
}

// Single merged status control — the pill IS the dropdown trigger. Replaces
// the previous "banner + Change status select" duo that lived in the side.
function StatusSelect({ task, statuses, disabled, onUpdate, onChange }) {
  const [open, setOpen] = useState(null);
  const items = (statuses || [])
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((s) => ({
      label: s.name,
      value: s.id,
      swatch: s.color || (s.isClosed ? "var(--status-done)" : "var(--status-todo)"),
      active: String(s.id) === String(task.statusId),
    }));
  const handleSelect = (v) => {
    const target = findById(statuses, v);
    if (target) {
      onUpdate(task.id, { statusId: v, statusName: target.name });
      onChange?.(`Status → ${target.name}`);
    } else {
      onUpdate(task.id, { statusId: v });
      onChange?.(`Status → ${v}`);
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          if (disabled) return;
          setOpen(e.currentTarget.getBoundingClientRect());
        }}
        disabled={disabled}
        title={disabled ? "You don't have permission to change status." : "Change status"}
        aria-disabled={disabled || undefined}
        className="inline-flex items-center gap-1.5 cursor-pointer disabled:cursor-default disabled:opacity-60 group"
      >
        <TaskStatusPill task={task} />
        {!disabled && (
          <Icon
            name="chev-down"
            size={12}
            className="text-fg-subtle transition-transform group-hover:translate-y-px"
            aria-hidden="true"
          />
        )}
      </button>
      {open && !disabled && (
        <Menu
          anchorRect={open}
          onClose={() => setOpen(null)}
          onSelect={(it) => handleSelect(it.value)}
          items={items}
        />
      )}
    </>
  );
}

function MultiInlineSelect({
  values,
  items,
  onChange,
  render,
  placeholder = "None",
  disabled = false,
  disabledMessage = "You don't have permission to do that.",
}) {
  const [open, setOpen] = useState(null);
  const selected = new Set(values || []);
  const isEmpty = selected.size === 0;
  return (
    <>
      <div
        className={[
          FIELD_BTN,
          "flex-wrap gap-1",
          isEmpty ? "text-fg-faint" : "",
          disabled ? "opacity-60 cursor-default hover:bg-transparent hover:border-transparent" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={(e) => {
          if (disabled) return;
          setOpen(e.currentTarget.getBoundingClientRect());
        }}
        title={disabled ? disabledMessage : undefined}
        aria-disabled={disabled || undefined}
      >
        {render ? render(values) : isEmpty ? placeholder : [...selected].join(", ")}
      </div>
      {open && !disabled && (
        <Menu
          anchorRect={open}
          onClose={() => setOpen(null)}
          onSelect={(it) => {
            const next = new Set(selected);
            if (next.has(it.value)) next.delete(it.value);
            else next.add(it.value);
            onChange([...next]);
          }}
          items={items.map((it) => ({ ...it, active: selected.has(it.value) }))}
        />
      )}
    </>
  );
}

export function TaskDetail({
  taskId,
  tasks,
  projectName,
  projectId,
  currentUser,
  categories = [],
  statuses = [],
  priorities = [],
  types = [],
  sprints = [],
  epics = [],
  assignees = [],
  onClose,
  onUpdate,
  onChange,
  onSelectTask,
  onSubtaskBulkMoveSprint,
  onSubtaskBulkAssign,
  onSubtaskBulkSetType,
  onSubtaskBulkSetParent,
  onSubtaskBulkDelete,
}) {
  const task = tasks.find((t) => t.id === taskId);
  const wpId = task?.nativeId;

  const [tab, setTab] = useState("comments");
  const [devTab, setDevTab] = useState("files");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(task?.title ?? "");
  const [editingDesc, setEditingDesc] = useState(false);
  // Tiptap reads/writes HTML. OP returns a `descriptionHtml` rendered from
  // its stored markdown — feed that into the editor and the read-mode view
  // so we never have to disambiguate formats client-side.
  const [descVal, setDescVal] = useState(
    task?.descriptionHtml || task?.description || "",
  );
  const [commentPage, setCommentPage] = useState(1);
  // Right-sidebar tab state: "details" (existing fields) or "poker"
  // (the planning-poker room). Reset back to "details" when the user
  // navigates to a different task so they don't silently join a
  // different room. Render-time setState is React 19's recommended
  // way to reset state from a prop change without an Effect.
  const [sideTab, setSideTab] = useState("details");
  const [lastSideTaskId, setLastSideTaskId] = useState(taskId);
  if (taskId !== lastSideTaskId) {
    setLastSideTaskId(taskId);
    if (sideTab !== "details") setSideTab("details");
  }
  const subtaskRef = useRef(null);
  const attachmentsRef = useRef(null);

  const { control, handleSubmit, reset } = useForm({
    defaultValues: { comment: "" },
  });
  const commentText = useWatch({ control, name: "comment" }) || "";

  const activities = useActivities(wpId);
  // Counts fetched here drive the Development tab labels; TanStack dedupes
  // these against the same queries inside the panels (shared queryKey),
  // so the network cost is one round-trip per resource.
  const fileLinksQ = useWpFileLinks(wpId);
  const githubPrsQ = useWpGithubPullRequests(wpId);
  const revisionsQ = useWpRevisions(wpId);
  const fileLinksCount = fileLinksQ.data?.length || 0;
  const githubPrsCount = githubPrsQ.data?.length || 0;
  const revisionsCount = revisionsQ.data?.length || 0;
  const carryoverQ = useCarryover(projectId, !!projectId);
  const carryOver = wpId
    ? carryoverQ.data?.byWpId?.[String(wpId)] || null
    : null;
  const post = usePostComment(wpId);
  const editComment = useUpdateComment(wpId);
  const onEditComment = async (id, text) => {
    await editComment.mutateAsync({ id, text });
    onChange?.("Comment updated");
  };
  const schemaQ = useWpSchema(task?.schemaHref || null);

  // Story points field — set OPENPROJECT_STORY_POINTS_FIELD to either the
  // native numeric `storyPoints` or a custom-field key like `customField7`
  // for t-shirt sizing. Read from runtime config so the same build works
  // across environments.
  const { storyPointsField } = usePublicConfig();
  const spField = schemaQ.data?.fields?.[storyPointsField];
  const spIsCustomOption = spField?.type === "CustomOption";
  const spOptionsQ = useCustomOptions(spField?.allowedValuesHref, !!spField?.allowedValuesHref);
  // Some OP installs don't expose `allowedValues` via the schema link; the
  // schema route discovers options from existing WPs and surfaces them on
  // `spField.allowedValues` instead. Prefer the link-fetched list when it's
  // available (more authoritative), fall back to the discovered list.
  const spOptions = spOptionsQ.data || spField?.allowedValues || null;

  // Backing list for the @-mention picker in the description, comment
  // composer, and comment-edit editor. Scoped to project members only —
  // instance-wide users who aren't members shouldn't surface in the picker.
  const mentionUsersQ = useAvailableAssignees(projectId, !!projectId);
  const mentionUsers = mentionUsersQ.data || [];

  const [prevTaskId, setPrevTaskId] = useState(task?.id);
  if (task && task.id !== prevTaskId) {
    setPrevTaskId(task.id);
    setTitleVal(task.title);
    setDescVal(task.descriptionHtml || task.description || "");
  }

  if (!task) return null;

  const reporter = task.reporter
    ? (Array.isArray(assignees) ? assignees : []).find(
        (u) => String(u.id) === String(task.reporter),
      ) ||
      PEOPLE[task.reporter] ||
      (task.reporterName ? { id: task.reporter, name: task.reporterName } : null)
    : null;
  // Epic / parent breadcrumb is API-driven via the mapper's `epicName` +
  // `epic` (parent native id). No lookup against a static EPICS list.
  const epicNativeId = task.epic ? String(task.epic) : null;
  const epicLabel = task.epicName || null;

  const perm = task.permissions || {};
  const canEdit = perm.update !== false;
  const canAddComment = perm.addComment !== false;
  const canAddAttachment = perm.addAttachment !== false;
  const canLogTime = perm.logTime !== false;
  const canAddWatcher = perm.addWatcher !== false;
  const canRemoveWatcher = perm.removeWatcher !== false;

  const comments = (activities.data || [])
    .filter((a) => a.kind === "comment")
    .slice()
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
  const history = (activities.data || []).filter((a) => a.kind !== "comment");

  const COMMENTS_PAGE_SIZE = 10;
  const commentTotalPages = Math.max(1, Math.ceil(comments.length / COMMENTS_PAGE_SIZE));
  const commentSafePage = Math.min(commentPage, commentTotalPages);
  const commentPageStart = (commentSafePage - 1) * COMMENTS_PAGE_SIZE;
  const pagedComments = comments.slice(
    commentPageStart,
    commentPageStart + COMMENTS_PAGE_SIZE,
  );
  const showCommentPager = comments.length > COMMENTS_PAGE_SIZE;

  const onSubmitComment = handleSubmit(async (values) => {
    const html = values.comment;
    // Editor returns HTML; treat tag-only / whitespace-only docs as empty.
    if (isHtmlEmpty(html)) return;
    try {
      // OP's `comment.raw` field accepts HTML and renders it; we send the
      // editor output verbatim so formatting (lists, headings, code, links)
      // is preserved on the server.
      await post.mutateAsync(html);
      reset({ comment: "" });
      setCommentPage(1);
      onChange?.(`Comment added to ${task.key}`);
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't post your comment — please try again."));
    }
  });

  const handlePoints = (value, href) => {
    if (spIsCustomOption) {
      if (href) {
        // Client already resolved the option href.
        onUpdate(task.id, { points: value, pointsHref: href });
      } else {
        // No href yet (allowed values still loading, or clearing) — send
        // just `points` and let the tasks/[id] PATCH route resolve the
        // matching CustomOption href server-side. Sending {pointsHref: null}
        // here would otherwise short-circuit that branch and clear the
        // field instead of setting the chosen value.
        onUpdate(task.id, { points: value });
      }
    } else {
      onUpdate(task.id, { points: value == null ? null : Number(value) });
    }
    onChange?.("Points updated");
  };

  const currentUserMini = currentUser
    ? {
        id: currentUser.id,
        initials: currentUser.name
          ?.split(" ")
          .map((s) => s[0])
          .filter(Boolean)
          .slice(0, 2)
          .join("")
          .toUpperCase(),
        color: "var(--accent)",
        name: currentUser.name,
      }
    : null;

  return (
    <div
      className="fixed inset-0 z-100 grid place-items-center p-2 sm:p-6 scrim animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="
          bg-surface-elevated rounded-xl shadow-xl overflow-hidden animate-slide-up border border-border-soft
          grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] grid-rows-[56px_minmax(0,1fr)]
          w-[min(1100px,calc(100vw-16px))] sm:w-[min(1100px,calc(100vw-48px))]
          h-[min(740px,calc(100vh-16px))] sm:h-[min(740px,calc(100vh-48px))]
        "
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="xl:col-span-2 flex items-center gap-3 border-b border-border-soft px-3 sm:px-4">
          <div className="flex items-center gap-1.5 text-xs text-fg-subtle min-w-0 flex-1">
            <Icon name="folder" size={12} aria-hidden="true" />
            <span className="truncate text-fg-subtle">{projectName}</span>
            <span className="text-fg-faint">/</span>
            {epicLabel && epicNativeId ? (
              <button
                type="button"
                className="bg-transparent border-0 p-0 text-fg-subtle cursor-pointer hover:text-fg hover:underline truncate"
                onClick={() => onSelectTask?.(`wp-${epicNativeId}`)}
              >
                {epicLabel}
              </button>
            ) : (
              <span className="text-fg-subtle">Issues</span>
            )}
            <span className="text-fg-faint">/</span>
            <span className="flex items-center gap-1.5 text-fg whitespace-nowrap">
              <TaskTypeIcon task={task} size={12} /> {task.key}
              {carryOver && <CarryOverChip entry={carryOver} />}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <WatcherButton
              wpId={wpId}
              currentUserId={currentUser?.id}
              canAdd={canAddWatcher}
              canRemove={canRemoveWatcher}
            />
            <button
              type="button"
              className={BTN_GHOST}
              onClick={onClose}
              title="Close"
              aria-label="Close detail"
            >
              <Icon name="x" size={14} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* ── Main ──────────────────────────────────────────────────── */}
        <div className="overflow-y-auto px-4 sm:px-7 pt-4 sm:pt-6 pb-8 min-w-0">
          <div className="mb-3">
            <StatusSelect
              task={task}
              statuses={statuses}
              disabled={!canEdit}
              onUpdate={onUpdate}
              onChange={onChange}
            />
          </div>

          {editingTitle ? (
            <textarea
              autoFocus
              className="block w-full font-display text-[24px] font-semibold tracking-[-0.022em] leading-[1.25] text-fg bg-surface-elevated border-2 border-accent rounded-md px-2 py-1 mb-4 outline-none shadow-[0_0_0_3px_var(--accent-100)] resize-none"
              value={titleVal}
              rows={2}
              onChange={(e) => setTitleVal(e.target.value)}
              onBlur={() => {
                setEditingTitle(false);
                if (titleVal.trim() && titleVal !== task.title) {
                  onUpdate(task.id, { title: titleVal.trim() });
                  onChange?.("Title updated");
                } else {
                  setTitleVal(task.title);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.target.blur();
                }
                if (e.key === "Escape") {
                  setTitleVal(task.title);
                  setEditingTitle(false);
                }
              }}
            />
          ) : (
            <h2
              className={cn(
                "block w-full font-display text-[24px] font-semibold tracking-[-0.022em] leading-[1.25] text-fg",
                "border-2 border-transparent rounded-md px-2 py-1 -mx-2 mb-4",
                canEdit ? "cursor-text hover:bg-surface-subtle" : "cursor-default",
              )}
              onClick={() => canEdit && setEditingTitle(true)}
              title={canEdit ? "Click to edit title" : undefined}
              aria-disabled={!canEdit || undefined}
            >
              {task.title}
            </h2>
          )}

          {(canAddAttachment || canEdit) && (
            <div className="flex flex-wrap gap-1.5 mb-5">
              {canAddAttachment && (
                <button
                  type="button"
                  className={BTN_BASE}
                  onClick={() =>
                    attachmentsRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    })
                  }
                  aria-label="Attach files"
                >
                  <Icon name="paperclip" size={14} aria-hidden="true" />
                  Attach
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  className={BTN_BASE}
                  onClick={() => subtaskRef.current?.startAdd()}
                  aria-label="Add sub-task"
                >
                  <Icon name="plus" size={14} aria-hidden="true" />
                  Sub-task
                </button>
              )}
            </div>
          )}

          {/* Description */}
          <section className="mb-6">
            <header className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[13px] font-semibold text-fg">Description</span>
              {!editingDesc && canEdit && (
                <button
                  type="button"
                  className={BTN_GHOST}
                  onClick={() => setEditingDesc(true)}
                  aria-label="Edit description"
                >
                  <Icon name="edit" size={12} aria-hidden="true" /> Edit
                </button>
              )}
            </header>
            {editingDesc ? (
              <div>
                <RichTextEditor
                  value={descVal}
                  onChange={setDescVal}
                  placeholder="Describe the work — formatting is supported."
                  minHeight={160}
                  autoFocus
                  mentionUsers={mentionUsers}
                />
                <div className="flex justify-end gap-1.5 mt-2">
                  <button
                    type="button"
                    className={BTN_GHOST}
                    onClick={() => {
                      setDescVal(task.descriptionHtml || task.description || "");
                      setEditingDesc(false);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={BTN_PRIMARY}
                    onClick={() => {
                      // `description` carries the HTML for the server (it
                      // converts to markdown before PATCH); `descriptionHtml`
                      // mirrors the same value so the optimistic cache write
                      // keeps the read-mode view in sync until OP responds
                      // with its canonical re-rendered HTML.
                      onUpdate(task.id, {
                        description: descVal,
                        descriptionHtml: descVal,
                      });
                      setEditingDesc(false);
                      onChange?.("Description updated");
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : descVal ? (
              <div
                className="op-html prose-comment text-[13.5px] leading-relaxed text-fg border-2 border-transparent rounded-md px-2.5 py-2 -mx-2.5 hover:bg-surface-subtle cursor-text"
                onDoubleClick={() => canEdit && setEditingDesc(true)}
                title={canEdit ? "Double-click to edit" : undefined}
              >
                <CommentHtml html={descVal} />
              </div>
            ) : canEdit ? (
              <div
                className="text-sm text-fg-faint border-2 border-transparent rounded-md px-2.5 py-2 -mx-2.5 cursor-text hover:bg-surface-subtle"
                onClick={() => setEditingDesc(true)}
              >
                Click to add a description…
              </div>
            ) : (
              <div className="text-sm text-fg-faint px-2.5 py-2 -mx-2.5" aria-disabled="true">
                No description.
              </div>
            )}
          </section>

          {/* Sub-tasks */}
          <section className="mb-6">
            <SubtaskBreakdown
              ref={subtaskRef}
              parent={task}
              projectId={projectId}
              statuses={statuses}
              assignees={assignees}
              sprints={sprints}
              types={types}
              canCreate={canEdit}
              currentUserId={currentUser?.id}
              allTasks={tasks}
              onUpdate={onUpdate}
              onChange={onChange}
              onTaskClick={onSelectTask}
              onBulkMoveSprint={onSubtaskBulkMoveSprint}
              onBulkAssign={onSubtaskBulkAssign}
              onBulkSetType={onSubtaskBulkSetType}
              onBulkSetParent={onSubtaskBulkSetParent}
              onBulkDelete={onSubtaskBulkDelete}
            />
          </section>

          {/* Relations — blocks/relates/duplicates/precedes/etc. Parent and
              children are surfaced separately via Sub-tasks above; this
              panel covers the v3 `Relation` resource. */}
          <section className="mb-6">
            <RelationsPanel
              wpId={wpId}
              selfTaskId={task.id}
              canEdit={canEdit && (perm.addRelation !== false)}
              allTasks={tasks}
              onTaskClick={onSelectTask}
              onChange={onChange}
            />
          </section>

          {/* Attachments */}
          <section ref={attachmentsRef} className="mb-6 scroll-mt-4">
            <AttachmentsGrid wpId={wpId} canAdd={canAddAttachment} />
          </section>

          {/* Development — files / PRs / commits collapsed into one tabbed
              section so an empty instance doesn't show three stacked empty
              states. Counts on the labels signal where content lives. */}
          <section className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="text-[11px] font-semibold text-fg-subtle uppercase tracking-wider">
                Development
              </div>
              <div className="flex gap-0.5 border-b border-border-soft flex-1 -mb-px">
                {[
                  { id: "files", label: "Files", count: fileLinksCount },
                  { id: "prs", label: "Pull requests", count: githubPrsCount },
                  { id: "commits", label: "Commits", count: revisionsCount },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDevTab(t.id)}
                    className={cn(
                      "px-2.5 py-1.5 text-[12px] cursor-pointer border-b-2 -mb-px transition-colors",
                      devTab === t.id
                        ? "text-accent-700 border-accent font-semibold"
                        : "text-fg-subtle border-transparent hover:text-fg font-medium",
                    )}
                  >
                    {t.label}
                    {t.count > 0 ? (
                      <span className="ml-1 text-fg-subtle font-normal">· {t.count}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
            {devTab === "files" && <FileLinksPanel wpId={wpId} />}
            {devTab === "prs" && <GithubPanel wpId={wpId} />}
            {devTab === "commits" && <RevisionsPanel wpId={wpId} />}
          </section>

          {/* Activity tabs */}
          <section className="mt-7">
            <div className="flex gap-0.5 border-b border-border mb-3 -mb-px">
              {[
                { id: "comments", label: `Comments${comments.length > 0 ? ` · ${comments.length}` : ""}` },
                { id: "history", label: `History${history.length > 0 ? ` · ${history.length}` : ""}` },
                { id: "work", label: "Work log" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "px-3 py-2 text-[13px] cursor-pointer border-b-2 mb-[-1px] transition-colors",
                    tab === t.id
                      ? "text-accent-700 border-accent font-semibold"
                      : "text-fg-subtle border-transparent hover:text-fg font-medium",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "comments" && (
              <div className="pt-3">
                {!canAddComment ? (
                  <div className="text-xs text-fg-subtle text-center py-3" aria-live="polite">
                    You don&apos;t have permission to comment on this issue.
                  </div>
                ) : (
                  <form
                    onSubmit={onSubmitComment}
                    className="flex gap-2.5 mb-4"
                  >
                    <Avatar user={currentUserMini} />
                    <div className="flex-1 min-w-0">
                      <Controller
                        control={control}
                        name="comment"
                        render={({ field }) => (
                          <RichTextEditor
                            value={field.value || ""}
                            onChange={field.onChange}
                            placeholder="Add a comment…"
                            minHeight={64}
                            onSubmit={onSubmitComment}
                            mentionUsers={mentionUsers}
                          />
                        )}
                      />
                      <div className="flex items-center gap-1 mt-1.5 text-fg-subtle">
                        <span className="text-[10.5px] text-fg-faint">
                          ⌘+Enter to send
                        </span>
                        <div className="ml-auto flex gap-1.5">
                          <button
                            type="button"
                            className={BTN_GHOST}
                            onClick={() => reset({ comment: "" })}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className={BTN_PRIMARY}
                            disabled={isHtmlEmpty(commentText) || post.isPending}
                          >
                            {post.isPending ? "Posting…" : "Comment"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </form>
                )}

                {activities.isLoading && <LoadingPill label="loading comments" />}
                {!activities.isLoading && comments.length === 0 && (
                  <div className="text-[13px] text-fg-subtle text-center py-4">
                    No comments yet — start the conversation.
                  </div>
                )}
                {pagedComments.map((c) => (
                  <ActivityItem
                    key={c.id}
                    activity={c}
                    onEdit={onEditComment}
                    mentionUsers={mentionUsers}
                  />
                ))}

                {showCommentPager && (
                  <div className="flex items-center justify-between gap-2 mt-2 text-[11.5px] text-fg-subtle">
                    <span>
                      {commentPageStart + 1}–
                      {Math.min(commentPageStart + COMMENTS_PAGE_SIZE, comments.length)} of{" "}
                      {comments.length}
                    </span>
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setCommentPage((p) => Math.max(1, p - 1))}
                        disabled={commentSafePage <= 1}
                        aria-label="Previous page"
                        className="inline-flex items-center justify-center w-6 h-6 rounded-md text-fg-muted hover:bg-surface-subtle hover:text-fg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <Icon name="chev-left" size={12} aria-hidden="true" />
                      </button>
                      <span className="px-1.5 tabular-nums">
                        {commentSafePage} / {commentTotalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setCommentPage((p) => Math.min(commentTotalPages, p + 1))
                        }
                        disabled={commentSafePage >= commentTotalPages}
                        aria-label="Next page"
                        className="inline-flex items-center justify-center w-6 h-6 rounded-md text-fg-muted hover:bg-surface-subtle hover:text-fg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <Icon name="chev-right" size={12} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === "history" && (
              <div className="pt-3">
                {activities.isLoading && <LoadingPill label="loading history" />}
                {!activities.isLoading && history.length === 0 && (
                  <div className="text-[13px] text-fg-subtle text-center py-4">No history yet.</div>
                )}
                {history.map((h) => (
                  <ActivityItem key={h.id} activity={h} />
                ))}
              </div>
            )}

            {tab === "work" && (
              <div className="pt-3">
                <TimeEntriesPanel wpId={wpId} currentUserId={currentUser?.id} canLog={canLogTime} />
              </div>
            )}
          </section>
        </div>

        {/* ── Side panel ─────────────────────────────────────────────── */}
        <aside className="border-t xl:border-t-0 xl:border-l border-border-soft bg-surface-sunken overflow-y-auto px-4 pt-4 sm:pt-5 pb-6 min-w-0">
          {spIsCustomOption && Array.isArray(spOptions) && spOptions.length > 0 && canEdit && (
            <div className="flex gap-0.5 border-b border-border mb-4">
              {[
                { id: "details", label: "Details" },
                { id: "poker", label: "Poker" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSideTab(t.id)}
                  className={cn(
                    "px-3 py-1.5 text-[12.5px] cursor-pointer border-b-2 -mb-px transition-colors",
                    sideTab === t.id
                      ? "text-accent-700 border-accent font-semibold"
                      : "text-fg-subtle border-transparent hover:text-fg font-medium",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {sideTab === "poker" && (
            <PokerTab
              task={task}
              allowed={spOptions}
              canEdit={canEdit}
              onUpdate={onUpdate}
              onApplied={() => setSideTab("details")}
            />
          )}

          {sideTab === "details" && (
            <>
          {/* Reminders */}
          <div className="mb-5">
            <div className="text-[11px] font-semibold text-fg-subtle uppercase tracking-wider mb-1.5">
              Reminders
            </div>
            <RemindersPanel wpId={wpId} />
          </div>

          {/* Details */}
          <div className="mb-5">
            <div className="text-[11px] font-semibold text-fg-subtle uppercase tracking-wider mb-1.5">
              Details
            </div>
            <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5">
              <span className={FIELD_LABEL}>Type</span>
              <InlineSelect
                value={task.typeId}
                disabled={!canEdit || (types?.length ?? 0) === 0}
                items={(types || [])
                  .slice()
                  .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                  .map((t) => ({
                    label: t.name,
                    value: t.id,
                    active: String(t.id) === String(task.typeId),
                  }))}
                onChange={(v) => {
                  const target = (types || []).find(
                    (t) => String(t.id) === String(v),
                  );
                  if (!target) return;
                  onUpdate(task.id, {
                    typeId: target.id,
                    typeName: target.name,
                  });
                  onChange?.("Type updated");
                }}
                render={() => (
                  <>
                    <TaskTypeIcon task={task} size={14} />
                    <span className="truncate">{task.typeName || "—"}</span>
                  </>
                )}
              />

              <span className={FIELD_LABEL}>Assignee</span>
              <InlineSelect
                value={task.assignee}
                disabled={!canEdit}
                searchable
                searchPlaceholder="Search people…"
                menuWidth={240}
                menuMaxHeight={300}
                items={[
                  { label: "Unassigned", value: null, active: !task.assignee },
                  { divider: true },
                  ...(Array.isArray(assignees) ? assignees : []).map((p) => ({
                    label: p.name,
                    value: p.id,
                    avatar: p,
                    active: String(p.id) === String(task.assignee),
                  })),
                ]}
                onChange={(v) => {
                  onUpdate(task.id, { assignee: v });
                  onChange?.("Assignee updated");
                }}
                render={(v) => {
                  const u =
                    (Array.isArray(assignees) ? assignees : []).find(
                      (p) => String(p.id) === String(v),
                    ) ||
                    (v ? { id: v, name: task.assigneeName || "Assignee" } : null);
                  return u ? (
                    <>
                      <Avatar user={u} size="sm" />
                      <span className="truncate">{u.name}</span>
                    </>
                  ) : (
                    <span>Unassigned</span>
                  );
                }}
              />

              <span className={FIELD_LABEL}>Reporter</span>
              <div className={`${FIELD_BTN} cursor-default hover:bg-transparent hover:border-transparent`}>
                {reporter ? (
                  <>
                    <Avatar user={reporter} size="sm" />
                    <span className="truncate">{reporter.name}</span>
                  </>
                ) : (
                  <span className="text-fg-faint">{task.reporterName || "—"}</span>
                )}
              </div>

              <span className={FIELD_LABEL}>Priority</span>
              <InlineSelect
                value={task.priorityId}
                disabled={!canEdit}
                items={(priorities || [])
                  .slice()
                  .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                  .map((p) => ({
                    label: p.name,
                    value: p.id,
                    swatch: p.color || "var(--text-3)",
                    active: String(p.id) === String(task.priorityId),
                  }))}
                onChange={(v) => {
                  const target = findById(priorities, v);
                  if (target) {
                    onUpdate(task.id, {
                      priorityId: v,
                      priorityName: target.name,
                    });
                  } else {
                    onUpdate(task.id, { priorityId: v });
                  }
                  onChange?.("Priority updated");
                }}
                render={() => (
                  <>
                    <TaskPriorityIcon task={task} size={14} />
                    <span className="truncate">{task.priorityName || "—"}</span>
                  </>
                )}
              />

              <span className={FIELD_LABEL}>
                {spField === undefined && !schemaQ.isLoading
                  ? "Schedule"
                  : "Story points"}
              </span>
              <div
                className={`${FIELD_BTN} ${canEdit ? "" : "opacity-60 pointer-events-none"}`}
                aria-disabled={!canEdit || undefined}
              >
                {schemaQ.isLoading || (spIsCustomOption && spOptionsQ.isLoading && !spOptions) ? (
                  <LoadingPill label="loading field" />
                ) : (
                  <EstimatePicker
                    mode={
                      spIsCustomOption
                        ? "tshirt"
                        : spField?.type === "Float" || spField?.type === "Integer"
                        ? "numeric"
                        : "duration"
                    }
                    task={task}
                    allowed={spOptions}
                    disabled={!canEdit}
                    onChange={handlePoints}
                    onChangeDates={(dates) => {
                      onUpdate(task.id, dates);
                      onChange?.("Dates updated");
                    }}
                  />
                )}
              </div>

              <span className={FIELD_LABEL}>Sprint</span>
              <InlineSelect
                value={task.sprint}
                disabled={!canEdit}
                items={[
                  { label: "Without sprint", value: null, active: !task.sprint },
                  { divider: true },
                  ...(sprints || []).map((s) => ({
                    label: s.name,
                    value: s.id,
                    active: s.id === task.sprint,
                  })),
                ]}
                onChange={(v) => {
                  onUpdate(task.id, { sprint: v });
                  onChange?.("Sprint updated");
                }}
                render={(v) => {
                  if (!v) return <span>Without sprint</span>;
                  const found = (sprints || []).find((s) => s.id === v);
                  const name =
                    (found?.name || task.sprintName || "Sprint").split(" — ")[0] ||
                    "Sprint";
                  return (
                    <>
                      <Icon name="sprint" size={13} className="text-accent" aria-hidden="true" />
                      <span className="truncate">{name}</span>
                    </>
                  );
                }}
              />

              <span className={FIELD_LABEL}>Parent</span>
              <ParentPicker
                triggerClassName={[
                  FIELD_BTN,
                  !task.epic ? "text-fg-faint" : "",
                  !canEdit ? "opacity-60 cursor-default hover:bg-transparent hover:border-transparent" : "",
                ].filter(Boolean).join(" ")}
                value={task.epic ? String(task.epic) : null}
                valueName={task.epicName || null}
                projectId={projectId}
                excludeId={task.nativeId}
                disabled={!canEdit}
                onChange={(v, name) => {
                  onUpdate(task.id, { parent: v });
                  onChange?.(`Parent → ${name || "None"}`);
                }}
              />

              <span className={FIELD_LABEL}>Tag</span>
              {/* OP work packages have at most ONE category (`_links.category`
                  per the v3 spec), so this is a single-select. We still
                  call it "Tag" in the UI for consistency with the rest of
                  the app's naming. */}
              <InlineSelect
                value={task.categoryId || null}
                disabled={!canEdit}
                searchable={(categories?.length || 0) > 6}
                searchPlaceholder="Search tags…"
                items={[
                  { label: "None", value: null, active: !task.categoryId },
                  ...(categories || []).map((c) => ({
                    label: c.name,
                    value: c.id,
                    active: String(c.id) === String(task.categoryId),
                  })),
                ]}
                onChange={(id) => {
                  const cat = (categories || []).find(
                    (c) => String(c.id) === String(id),
                  );
                  // Optimistic: update labels + categoryName so the chip
                  // re-renders instantly, plus categoryId so the cache
                  // matches what the server will return.
                  onUpdate(task.id, {
                    categoryId: id,
                    categoryName: cat?.name || null,
                    labels: cat?.name ? [cat.name] : [],
                  });
                  onChange?.(id ? "Tag updated" : "Tag removed");
                }}
                render={(v) => {
                  if (!v) return <span className="text-fg-faint">None</span>;
                  const cat = (categories || []).find(
                    (c) => String(c.id) === String(v),
                  );
                  return <TagPill name={cat?.name || task.categoryName || "Tag"} />;
                }}
              />

              <span className={FIELD_LABEL}>Start date</span>
              <DatePicker
                value={task.startDate}
                disabled={!canEdit}
                onChange={(d) => {
                  onUpdate(task.id, { startDate: d });
                  onChange?.("Start date updated");
                }}
                placeholder="Set start date"
              />

              <span className={FIELD_LABEL}>Due date</span>
              <DatePicker
                value={task.dueDate}
                disabled={!canEdit}
                onChange={(d) => {
                  onUpdate(task.id, { dueDate: d });
                  onChange?.("Due date updated");
                }}
                placeholder="Set due date"
              />
            </div>
          </div>

          {/* Activity meta */}
          <div className="mb-2">
            <div className="text-[11px] font-semibold text-fg-subtle uppercase tracking-wider mb-1.5">
              Activity
            </div>
            <div className="text-xs text-fg-subtle leading-5">
              Created {task.createdAt ? formatRelDate(task.createdAt) : "—"}
              {reporter
                ? ` by ${reporter.name}`
                : task.reporterName
                ? ` by ${task.reporterName}`
                : ""}
            </div>
            <div className="text-xs text-fg-subtle leading-5">
              Updated {task.updatedAt ? formatRelDate(task.updatedAt) : "—"}
            </div>
          </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
