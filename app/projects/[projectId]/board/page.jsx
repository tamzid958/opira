"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Board } from "@/components/board";
import { BoardList } from "@/components/board-list";
import { BoardSwimlanes } from "@/components/board-swimlanes";
import { BoardTriageLane } from "@/components/board-triage-lane";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Icon } from "@/components/icons";
import { LoadingPill } from "@/components/ui/loading-pill";
import { Menu } from "@/components/ui/menu";
import {
  useAvailableAssignees,
  useCarryover,
  useCategories,
  useMe,
} from "@/lib/hooks/use-openproject-detail";
import {
  useApiStatus,
  useCreateTask,
  useDeleteTask,
  usePriorities,
  useSprints,
  useStatuses,
  useTasks,
  useTypes,
  useUpdateTask,
} from "@/lib/hooks/use-openproject";
import { resolveApiPatch } from "@/lib/openproject/resolve-patch";
import { useUrlParams } from "@/lib/hooks/use-modal-url";
import { useQueriesSettled } from "@/lib/hooks/use-queries-settled";
import { useSavedViews } from "@/lib/hooks/use-saved-views";
import { pickSprintByDate } from "@/lib/hooks/use-active-sprint";
import { friendlyError } from "@/lib/api-client";
import { findById } from "@/lib/utils";
import { useEstimateMode } from "@/lib/hooks/use-estimate-mode";
import { inferModeFromTasks } from "@/lib/openproject/estimate";

export default function BoardPage({ params: paramsPromise }) {
  const { projectId } = use(paramsPromise);
  const { params: urlParams, setParams } = useUrlParams();
  const sprintFilter = urlParams.get("s") || "all";
  const viewParam = urlParams.get("view");
  const view =
    viewParam === "list" || viewParam === "swimlanes" ? viewParam : "kanban";

  const filters = {
    q: urlParams.get("q") || "",
    assignee: urlParams.get("assignee") || "all",
    type: urlParams.get("type") || "all",
    label: urlParams.get("label") || "all",
    status: urlParams.get("status") || "all",
  };
  const setFilter = (k, v) => setParams({ [k]: v && v !== "all" ? v : null });

  // "Updated since" overlay — when on, every card updated after this
  // timestamp glows; everything else fades. Exposed as a URL param so
  // the link is shareable (?since=24h). The threshold is stamped via
  // effect (not render) since `Date.now()` is impure and would otherwise
  // jitter between renders.
  const sinceParam = urlParams.get("since");
  const [updatedSince, setUpdatedSince] = useState(null);
  // Effect (not memo) because `Date.now()` is impure — we want it captured
  // once per URL transition, not on every render. Disabling the lint here:
  // this is exactly the "sync React state with an external clock" use the
  // rule's docs allow as an exception.
  useEffect(() => {
    const offsetMs =
      sinceParam === "24h"
        ? 24 * 60 * 60 * 1000
        : sinceParam === "1w"
        ? 7 * 24 * 60 * 60 * 1000
        : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUpdatedSince(
      offsetMs == null ? null : new Date(Date.now() - offsetMs).toISOString(),
    );
  }, [sinceParam]);

  const savedViews = useSavedViews(projectId);
  const [viewsMenu, setViewsMenu] = useState(null);
  // `nameViewDraft` is null when the modal is closed and a string (the
  // in-progress name) when it's open. The captured filters at open-time
  // live in `nameViewFilters` so a later filter change before submit
  // doesn't quietly mutate what gets saved.
  const [nameViewDraft, setNameViewDraft] = useState(null);
  const [nameViewFilters, setNameViewFilters] = useState(null);
  const applyView = (v) => {
    const f = v?.filters || {};
    setParams({
      q: f.q || null,
      assignee: f.assignee && f.assignee !== "all" ? f.assignee : null,
      type: f.type && f.type !== "all" ? f.type : null,
      label: f.label && f.label !== "all" ? f.label : null,
      status: f.status && f.status !== "all" ? f.status : null,
      since: f.since || null,
    });
  };
  const openSaveViewModal = () => {
    setNameViewFilters(filters);
    setNameViewDraft("");
  };
  const closeSaveViewModal = () => {
    setNameViewDraft(null);
    setNameViewFilters(null);
  };
  const submitSaveView = () => {
    const name = (nameViewDraft || "").trim();
    if (!name) return;
    savedViews.save(name, nameViewFilters || filters);
    closeSaveViewModal();
  };

  const status = useApiStatus();
  const configured = status.data?.configured === true;
  const me = useMe();
  const myUserId = me.data?.user?.id || null;

  // Built-in saved-view presets — virtual entries that aren't persisted.
  // "My work" needs the current user id; we hide it until /me resolves.
  // "Standup" sets the same `since=24h` URL param the toolbar toggle uses
  // so it round-trips with the existing overlay logic.
  const presetViews = (() => {
    const list = [];
    if (myUserId) {
      list.push({
        id: "__preset:mine",
        name: "My work",
        filters: { assignee: String(myUserId) },
        preset: true,
      });
    }
    list.push({
      id: "__preset:standup",
      name: "Standup",
      filters: { since: "24h" },
      preset: true,
    });
    return list;
  })();
  const sprintsQ = useSprints(projectId, configured && !!projectId);
  const statusesQ = useStatuses(configured);
  const typesQ = useTypes(projectId, configured && !!projectId);
  const categoriesQ = useCategories(projectId, configured && !!projectId);
  const assigneesQ = useAvailableAssignees(projectId, configured && !!projectId);
  const carryoverQ = useCarryover(projectId, configured && !!projectId);
  const prioritiesQ = usePriorities(configured);
  const updateTaskMutation = useUpdateTask(projectId);
  const createTaskMutation = useCreateTask();
  const deleteTaskMutation = useDeleteTask(projectId);

  const sprintsList = useMemo(() => sprintsQ.data || [], [sprintsQ.data]);

  // Stale-sprint guard: if the URL points at a sprint the project no longer
  // has, reset to "all" so the chip + URL stop pointing at a ghost. Gated
  // on isSuccess so we don't reset during loading.
  useEffect(() => {
    if (!sprintsQ.isSuccess) return;
    if (!sprintFilter || sprintFilter === "all" || sprintFilter === "backlog") return;
    if (!sprintsList.some((s) => s.id === sprintFilter)) {
      setParams({ s: null });
    }
  }, [sprintsQ.isSuccess, sprintsList, sprintFilter, setParams]);

  // First-visit default: when no `?s=` is set, pick a sprint by date and
  // pin it to the URL. Stored per-project in localStorage so the user's
  // last-picked sprint sticks.
  useEffect(() => {
    if (!sprintsQ.isSuccess) return;
    if (urlParams.has("s")) return;
    let saved = null;
    try {
      saved = window.localStorage.getItem(`op:board-sprint:${projectId}`);
    } catch {
      // localStorage unavailable.
    }
    let pick = null;
    if (saved && (saved === "backlog" || sprintsList.some((s) => s.id === saved))) {
      pick = saved;
    } else {
      const dated = pickSprintByDate(sprintsList);
      pick = dated?.id || null;
    }
    if (pick) setParams({ s: pick });
  }, [sprintsQ.isSuccess, sprintsList, projectId, urlParams, setParams]);

  // Persist board sprint per-project so a hard refresh restores it.
  useEffect(() => {
    if (typeof window === "undefined" || !projectId) return;
    try {
      const key = `op:board-sprint:${projectId}`;
      if (sprintFilter && sprintFilter !== "all") {
        window.localStorage.setItem(key, sprintFilter);
      } else {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Ignore quota / privacy-mode errors.
    }
  }, [projectId, sprintFilter]);

  // Same per-project persistence for the view toggle (kanban / list).
  // Rehydration must run only ONCE per projectId mount, otherwise
  // toggling Kanban → drop `?view=` → effect refires → reads stale
  // localStorage → snaps right back to list. The ref tracks which
  // project we've already rehydrated for so subsequent URL changes
  // (search input, filter chips, toggle clicks) don't trigger a
  // re-read of saved state. The persist effect below still keeps
  // localStorage in sync when the user actively flips the toggle.
  const rehydratedViewFor = useRef(null);
  useEffect(() => {
    if (!projectId) return;
    if (rehydratedViewFor.current === projectId) return;
    rehydratedViewFor.current = projectId;
    if (urlParams.has("view")) return;
    let saved = null;
    try {
      saved = window.localStorage.getItem(`op:board-view:${projectId}`);
    } catch {
      // localStorage unavailable.
    }
    if (saved === "list" || saved === "swimlanes") setParams({ view: saved });
  }, [projectId, urlParams, setParams]);

  useEffect(() => {
    if (typeof window === "undefined" || !projectId) return;
    try {
      const key = `op:board-view:${projectId}`;
      if (view === "list" || view === "swimlanes") {
        window.localStorage.setItem(key, view);
      } else {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Ignore quota / privacy-mode errors.
    }
  }, [projectId, view]);

  const sprintScope =
    sprintFilter === "all" ? null : sprintFilter === "backlog" ? "backlog" : sprintFilter;
  const tasksQ = useTasks(projectId, sprintScope, configured && !!projectId);
  const tasks = useMemo(() => tasksQ.data || [], [tasksQ.data]);
  const estimateModeQ = useEstimateMode(projectId);
  const inferredMode = useMemo(() => inferModeFromTasks(tasks) || "numeric", [tasks]);
  const estimateMode = estimateModeQ.isLoading ? inferredMode : estimateModeQ.mode || "numeric";

  // Gate the page body on EVERY query the page reads — filter chips, sprint
  // selector, and the board itself all derive labels from these. Rendering
  // before they settle leaks placeholder text ("Type", "Pick a sprint",
  // "(no tags)") that gets swapped out a tick later. One loader, then a
  // fully-formed page.
  const { ready: pageReady, error: pageError } = useQueriesSettled(
    tasksQ,
    sprintsQ,
    statusesQ,
    typesQ,
    categoriesQ,
    assigneesQ,
  );

  // Apply chip + search filters client-side. The sprint filter is already
  // applied server-side via `?sprint=`; everything else is local.
  const filteredTasks = tasks.filter((t) => {
    if (filters.assignee !== "all" && t.assignee !== filters.assignee) return false;
    if (filters.type !== "all" && String(t.typeId) !== String(filters.type)) return false;
    if (filters.label !== "all" && !(t.labels || []).includes(filters.label)) return false;
    if (filters.status !== "all" && String(t.statusId) !== String(filters.status)) return false;
    if (filters.q) {
      const q = filters.q.toLowerCase();
      if (!t.title.toLowerCase().includes(q) && !t.key.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const activeSprint = (() => {
    if (sprintFilter && sprintFilter !== "all" && sprintFilter !== "backlog") {
      const match = sprintsList.find((s) => s.id === sprintFilter);
      if (match) return match;
    }
    return pickSprintByDate(sprintsList);
  })();

  const [sprintMenu, setSprintMenu] = useState(null);
  const [filterMenu, setFilterMenu] = useState(null);
  // Separate slot for the "+ Filter" picker. If we reused `filterMenu`,
  // Menu's onSelect→onClose pair would clobber the next state set in the
  // same tick — onClose fires after onSelect and would reset to null,
  // hiding the value picker we just tried to open.
  const [addFilterMenu, setAddFilterMenu] = useState(null);

  const labelOptions = (categoriesQ.data || []).map((c) => ({
    label: c.name,
    value: c.name,
    active: filters.label === c.name,
  }));
  const hasActiveFilters =
    filters.assignee !== "all" ||
    filters.type !== "all" ||
    filters.label !== "all" ||
    filters.status !== "all" ||
    filters.q;

  const sprintLabel =
    sprintFilter === "all"
      ? "All sprints"
      : sprintFilter === "backlog"
      ? "Backlog only"
      : sprintsList.find((s) => s.id === sprintFilter)?.name?.split(" — ")[0] || "Sprint";

  const pageTitle = activeSprint
    ? `${activeSprint.name.split(" — ")[0]} board`
    : "Board";

  const moveTaskByStatusId = (id, statusId) => {
    const t = tasks.find((x) => x.id === id);
    const target = findById(statusesQ.data, statusId);
    updateTaskMutation.mutate(
      {
        id,
        patch: { statusId, statusName: target?.name },
      },
      {
        onSuccess: () => {
          if (t && target) toast.success(`${t.key} → ${target.name}`);
        },
        onError: (err) => {
          toast.error(friendlyError(err, "Couldn't move this issue"));
        },
      },
    );
  };

  // Generic patch passthrough used by the list view for re-parenting
  // (drag a row under another parent) and any other field-level patch
  // a row might issue. Mappers convert `parent` to the HAL link.
  const updateTask = (id, patch) => {
    updateTaskMutation.mutate({ id, patch });
  };

  // Resolve a UI-shaped patch (assignee/sprint/type/labels/etc.) into the
  // shape the API expects. Resolves bucket-named type/priority hits to their
  // OpenProject ids so the route handler doesn't have to guess.
  const resolvePatch = (patch) =>
    resolveApiPatch(patch, {
      statuses: statusesQ.data,
      priorities: prioritiesQ.data,
      types: typesQ.data,
    });

  // Bulk update: accept a flat patch (applied to every id) OR a function
  // that takes the task and returns a per-task patch. Returns a Promise
  // that resolves once every per-id mutation has settled. Failures are
  // bubbled up so the Board can toast a single rollup error.
  const onBulkUpdate = async (ids, patchOrFn) => {
    const targets = ids
      .map((id) => tasks.find((t) => t.id === id))
      .filter(Boolean);
    if (targets.length === 0) return;
    const errors = [];
    await Promise.all(
      targets.map(
        (task) =>
          new Promise((resolve) => {
            const raw =
              typeof patchOrFn === "function" ? patchOrFn(task) : patchOrFn;
            if (!raw) return resolve();
            updateTaskMutation.mutate(
              { id: task.id, patch: resolvePatch(raw) },
              {
                onSuccess: () => resolve(),
                onError: (err) => {
                  errors.push(err);
                  resolve();
                },
              },
            );
          }),
      ),
    );
    if (errors.length) {
      const first = errors[0];
      throw new Error(
        friendlyError(first, `Couldn't update ${errors.length} of ${targets.length} issues`),
      );
    }
  };

  // Bulk delete: same fan-out + rollup error pattern as bulk update.
  const onBulkDelete = async (ids) => {
    const errors = [];
    await Promise.all(
      ids.map(
        (id) =>
          new Promise((resolve) => {
            deleteTaskMutation.mutate(id, {
              onSuccess: () => resolve(),
              onError: (err) => {
                errors.push(err);
                resolve();
              },
            });
          }),
      ),
    );
    if (errors.length) {
      const first = errors[0];
      throw new Error(
        friendlyError(first, `Couldn't delete ${errors.length} of ${ids.length} issues`),
      );
    }
  };

  // Inline column create: minimum-viable issue from a single title input.
  // Pulls defaults from the active sprint + the column's status; type and
  // priority fall back to the project's default buckets so the user only
  // has to type the title. Returns a Promise so the inline form can clear
  // / re-focus once the create lands.
  const onInlineCreate = (statusId, title) =>
    new Promise((resolve, reject) => {
      const target = (statusesQ.data || []).find(
        (s) => String(s.id) === String(statusId),
      );
      // Pick the OpenProject-configured default type and priority. The API
      // exposes `isDefault` on both resources — that's the truth.
      const defaultType = (typesQ.data || []).find((t) => t.isDefault);
      const defaultPriority = (prioritiesQ.data || []).find((p) => p.isDefault);
      createTaskMutation.mutate(
        {
          projectId,
          title,
          description: "",
          typeId: defaultType?.id || (typesQ.data || [])[0]?.id || null,
          statusId,
          priorityId: defaultPriority?.id || null,
          assignee: null,
          sprint: activeSprint?.id || null,
        },
        {
          onSuccess: (created) => {
            toast.success(
              `Created ${created?.key || "issue"} in ${target?.name || "column"}`,
            );
            resolve(created);
          },
          onError: (err) => {
            toast.error(friendlyError(err, "Couldn't create issue"));
            reject(err);
          },
        },
      );
    });

  // ── Filter-bar metadata ────────────────────────────────────────────────

  const chipMeta = (kind) => {
    switch (kind) {
      case "assignee": {
        const v = filters.assignee;
        return {
          icon: "people",
          addLabel: "Assignee",
          activeLabel:
            v === "all"
              ? "Assignee"
              : findById(assigneesQ.data, v)?.name || "Assignee",
        };
      }
      case "type": {
        const v = filters.type;
        return {
          icon: "epic",
          addLabel: "Type",
          activeLabel:
            v === "all"
              ? "Type"
              : findById(typesQ.data, v)?.name || v,
        };
      }
      case "label": {
        const v = filters.label;
        return {
          icon: "tag",
          addLabel: "Tag",
          activeLabel: v === "all" ? "Tag" : v,
        };
      }
      case "status": {
        const v = filters.status;
        return {
          icon: "check",
          addLabel: "Status",
          activeLabel:
            v === "all"
              ? "Status"
              : findById(statusesQ.data, v)?.name || "Status",
        };
      }
      default:
        return { icon: "filter", addLabel: kind, activeLabel: kind };
    }
  };

  const allFilterKinds = ["assignee", "type", "label", "status"];
  const activeFilterKinds = allFilterKinds.filter(
    (k) => filters[k] && filters[k] !== "all",
  );
  const availableFilterKinds = allFilterKinds.filter(
    (k) => filters[k] === "all" || !filters[k],
  );

  // While loading, render a stable shell — generic title, no chips, no
  // sprint selector — so nothing in the chrome morphs from placeholder to
  // real value as queries land.
  if (!pageReady) {
    return (
      <>
        <div className="bg-surface-elevated border-b border-border px-3 sm:px-6 pt-3.5 pb-3 shrink-0">
          <h1 className="font-display text-[24px] font-semibold tracking-[-0.022em] text-fg m-0">
            Board
          </h1>
        </div>
        <div className="flex-1 grid place-items-center">
          <LoadingPill label="loading board" />
        </div>
      </>
    );
  }

  if (pageError) {
    return (
      <>
        <div className="bg-surface-elevated border-b border-border px-3 sm:px-6 pt-3.5 pb-3 shrink-0">
          <h1 className="font-display text-[24px] font-semibold tracking-[-0.022em] text-fg m-0">
            Board
          </h1>
        </div>
        <div className="flex-1 p-6 text-pri-highest">
          {String(pageError.message)}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="bg-surface-elevated border-b border-border px-3 sm:px-6 pt-3.5 pb-3 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-display text-[24px] font-semibold tracking-[-0.022em] text-fg m-0">
            {pageTitle}
          </h1>
          {activeSprint?.days && activeSprint?.dayIn != null && (
            <span className="inline-flex items-center gap-1.5 text-[13px] text-fg-subtle">
              <Icon name="clock" size={13} aria-hidden="true" />
              Day {activeSprint.dayIn} of {activeSprint.days} ·{" "}
              {Math.max(0, activeSprint.days - activeSprint.dayIn)} days left
            </span>
          )}
          <div className="md:ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) =>
                setSprintMenu({ rect: e.currentTarget.getBoundingClientRect() })
              }
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-surface-elevated text-[13px] font-medium text-fg hover:bg-surface-subtle hover:border-border-strong transition-colors"
              title="Switch the sprint shown on the board"
            >
              <Icon name="sprint" size={13} aria-hidden="true" />
              <span className="truncate max-w-40">{sprintLabel}</span>
              <Icon name="chev-down" size={12} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter bar — same chip pattern as Backlog so the two views feel
          consistent. Search + assignee + type + tag chips, all driven by
          URL search params so links are shareable. */}
      <div className="bg-surface-elevated border-b border-border px-3 sm:px-6 py-3 flex items-center gap-2 touch-toolbar shrink-0">
        <div className="relative">
          <Icon
            name="search"
            size={13}
            className="absolute left-2 top-2 text-fg-faint pointer-events-none"
            aria-hidden="true"
          />
          <input
            placeholder="Search…"
            value={filters.q}
            onChange={(e) => setFilter("q", e.target.value)}
            className="h-7 pl-7 pr-2 rounded-md border border-border bg-surface-elevated text-xs text-fg outline-none transition-colors focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-100)] w-[140px] sm:w-[200px]"
          />
        </div>
        {/* Active-only chips: render a chip iff its filter is set, so a
            fresh board shows zero chips. Even when a kind is "redundant"
            for the current view (e.g. status in kanban), if the user has
            it set we keep the chip visible so it can be cleared. */}
        {activeFilterKinds.map((kind) => {
          const meta = chipMeta(kind);
          return (
            <button
              key={kind}
              type="button"
              onClick={(e) =>
                setFilterMenu({
                  kind,
                  rect: e.currentTarget.getBoundingClientRect(),
                })
              }
              className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1.5 rounded-full border text-xs font-medium cursor-pointer transition-colors bg-accent-50 border-accent-200 text-accent-700"
              title={`${meta.addLabel}: ${meta.activeLabel}`}
            >
              <Icon name={meta.icon} size={12} aria-hidden="true" />
              <span className="max-w-32 truncate">{meta.activeLabel}</span>
              <span
                role="button"
                aria-label={`Clear ${meta.addLabel} filter`}
                onClick={(e) => {
                  e.stopPropagation();
                  setFilter(kind, null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    setFilter(kind, null);
                  }
                }}
                tabIndex={0}
                className="ml-0.5 grid place-items-center w-4 h-4 rounded-full hover:bg-accent-100 cursor-pointer"
              >
                <Icon name="x" size={10} aria-hidden="true" />
              </span>
            </button>
          );
        })}
        {availableFilterKinds.length > 0 && (
          <button
            type="button"
            onClick={(e) =>
              setAddFilterMenu({
                rect: e.currentTarget.getBoundingClientRect(),
              })
            }
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-dashed border-border bg-transparent text-xs font-medium text-fg-muted hover:border-border-strong hover:bg-surface-subtle hover:text-fg cursor-pointer transition-colors"
            title="Add a filter"
          >
            <Icon name="plus" size={12} aria-hidden="true" />
            Filter
          </button>
        )}
        {hasActiveFilters && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 h-6.5 px-2.5 rounded-md border border-transparent bg-transparent text-xs text-fg-muted hover:bg-surface-subtle"
            onClick={() =>
              setParams({
                q: null,
                assignee: null,
                type: null,
                label: null,
                status: null,
              })
            }
          >
            Clear filters
          </button>
        )}
        <button
          type="button"
          onClick={(e) =>
            setViewsMenu({ rect: e.currentTarget.getBoundingClientRect() })
          }
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-surface-elevated text-xs font-medium text-fg-muted hover:bg-surface-subtle hover:border-border-strong cursor-pointer"
          title="Saved views"
        >
          <Icon name="star" size={13} aria-hidden="true" />
          Views
          {savedViews.views.length > 0 && (
            <span className="inline-flex items-center px-1.5 h-4 rounded-full text-[10px] font-bold tabular-nums bg-surface-muted text-fg-muted">
              {savedViews.views.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() =>
            setParams({
              since: sinceParam === "24h" ? null : "24h",
            })
          }
          className={[
            "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium cursor-pointer transition-colors",
            sinceParam
              ? "bg-accent-50 border-accent-200 text-accent-700"
              : "bg-surface-elevated border-border text-fg-muted hover:bg-surface-subtle hover:border-border-strong",
          ].join(" ")}
          title={
            sinceParam
              ? "Hide what's changed in the last 24h"
              : "Highlight cards updated in the last 24h"
          }
        >
          <Icon name="clock" size={13} aria-hidden="true" />
          Recent
        </button>
        <div className="md:ml-auto inline-flex h-7 rounded-md border border-border-soft bg-surface-elevated p-0.5 overflow-hidden">
          {[
            { id: "kanban", label: "Kanban", icon: "board" },
            { id: "list", label: "List", icon: "list" },
            { id: "swimlanes", label: "Swimlanes", icon: "people" },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setParams({ view: opt.id === "kanban" ? null : opt.id })}
              className={[
                "inline-flex items-center gap-1.5 h-6 px-2.5 rounded text-[12px] font-medium cursor-pointer transition-colors",
                view === opt.id
                  ? "bg-surface-subtle text-fg"
                  : "bg-transparent text-fg-muted hover:text-fg",
              ].join(" ")}
              aria-pressed={view === opt.id}
              title={`Switch to ${opt.label.toLowerCase()} view`}
            >
              <Icon name={opt.icon} size={12} aria-hidden="true" />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {addFilterMenu && (
        <Menu
          anchorRect={addFilterMenu.rect}
          width={200}
          onClose={() => setAddFilterMenu(null)}
          onSelect={(it) =>
            setFilterMenu({ kind: it.value, rect: addFilterMenu.rect })
          }
          items={availableFilterKinds.map((k) => {
            const meta = chipMeta(k);
            return { label: meta.addLabel, value: k, icon: meta.icon };
          })}
        />
      )}

      {filterMenu?.kind === "assignee" && (
        <Menu
          anchorRect={filterMenu.rect}
          onClose={() => setFilterMenu(null)}
          searchable
          searchPlaceholder="Search people…"
          width={240}
          maxHeight={300}
          onSelect={(it) => setFilter("assignee", it.value)}
          items={[
            { label: "All assignees", value: "all", active: filters.assignee === "all" },
            { divider: true },
            ...(assigneesQ.data || []).map((p) => ({
              label: p.name,
              value: p.id,
              avatar: p,
              active: String(p.id) === String(filters.assignee),
            })),
          ]}
        />
      )}
      {filterMenu?.kind === "type" && (
        <Menu
          anchorRect={filterMenu.rect}
          onClose={() => setFilterMenu(null)}
          onSelect={(it) => setFilter("type", it.value)}
          items={[
            { label: "All types", value: "all", active: filters.type === "all" },
            { divider: true },
            ...(typesQ.data || []).map((t) => ({
              label: t.name,
              value: t.id,
              active: String(filters.type) === String(t.id),
            })),
          ]}
        />
      )}
      {filterMenu?.kind === "label" && (
        <Menu
          anchorRect={filterMenu.rect}
          onClose={() => setFilterMenu(null)}
          onSelect={(it) => setFilter("label", it.value)}
          items={[
            { label: "All tags", value: "all", active: filters.label === "all" },
            { divider: true },
            ...(labelOptions.length > 0
              ? labelOptions
              : [{ label: "(no tags in this project)", value: "all", disabled: true }]),
          ]}
        />
      )}
      {filterMenu?.kind === "status" && (
        <Menu
          anchorRect={filterMenu.rect}
          onClose={() => setFilterMenu(null)}
          onSelect={(it) => setFilter("status", it.value)}
          items={[
            { label: "All statuses", value: "all", active: filters.status === "all" },
            { divider: true },
            ...(statusesQ.data || []).map((s) => ({
              label: s.name,
              value: String(s.id),
              active: String(s.id) === String(filters.status),
            })),
          ]}
        />
      )}

      {viewsMenu && (
        <Menu
          anchorRect={viewsMenu.rect}
          align="right"
          width={240}
          onClose={() => setViewsMenu(null)}
          onSelect={(it) => {
            if (it.value === "__save") openSaveViewModal();
            else if (typeof it.value === "string" && it.value.startsWith("__del:")) {
              savedViews.remove(it.value.slice(6));
            } else if (
              typeof it.value === "string" &&
              it.value.startsWith("__preset:")
            ) {
              const target = presetViews.find((v) => v.id === it.value);
              if (target) applyView(target);
            } else {
              const target = savedViews.views.find((v) => v.id === it.value);
              if (target) applyView(target);
            }
          }}
          items={[
            {
              label: hasActiveFilters
                ? "Save current view…"
                : "Save current view (no filters)",
              value: "__save",
              icon: "plus",
              disabled: !hasActiveFilters,
            },
            ...(presetViews.length > 0
              ? [
                  { divider: true },
                  { section: "Presets" },
                  ...presetViews.map((v) => ({
                    label: v.name,
                    value: v.id,
                    icon: v.id === "__preset:mine" ? "people" : "clock",
                  })),
                ]
              : []),
            ...(savedViews.views.length > 0
              ? [{ divider: true }, { section: "Saved" }]
              : []),
            ...savedViews.views.map((v) => ({
              label: v.name,
              value: v.id,
              icon: "star",
              hint: "Apply",
            })),
            ...(savedViews.views.length > 0
              ? [
                  { divider: true },
                  ...savedViews.views.map((v) => ({
                    label: `Delete "${v.name}"`,
                    value: `__del:${v.id}`,
                    icon: "trash",
                    danger: true,
                  })),
                ]
              : []),
          ]}
        />
      )}

      {nameViewDraft !== null && (
        <ConfirmModal
          title="Save view"
          description="Pin the current filters as a named view you can re-apply later from the Views menu."
          confirmLabel="Save view"
          cancelLabel="Cancel"
          onClose={closeSaveViewModal}
          onConfirm={submitSaveView}
        >
          <label
            htmlFor="board-save-view-name"
            className="block text-[12px] font-medium text-fg-subtle mb-1.5"
          >
            View name
          </label>
          <input
            id="board-save-view-name"
            type="text"
            autoFocus
            value={nameViewDraft}
            onChange={(e) => setNameViewDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitSaveView();
              }
            }}
            placeholder="e.g. My open bugs"
            maxLength={60}
            className="w-full h-9 px-3 rounded-md border border-border bg-surface-elevated text-fg text-[13px] placeholder:text-fg-subtle focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </ConfirmModal>
      )}

      {sprintMenu && (
        <Menu
          anchorRect={sprintMenu.rect}
          onClose={() => setSprintMenu(null)}
          onSelect={(it) => setParams({ s: it.value === "all" ? null : it.value })}
          items={[
            { label: "All sprints", value: "all", active: sprintFilter === "all" },
            {
              label: "Backlog only",
              value: "backlog",
              active: sprintFilter === "backlog",
            },
            { divider: true },
            ...sprintsList.map((s) => ({
              label: s.name?.split(" — ")[0] || s.name,
              value: s.id,
              active: sprintFilter === s.id,
            })),
          ]}
        />
      )}

      {view === "kanban" && (
        <BoardTriageLane
          tasks={filteredTasks}
          assignees={assigneesQ.data || []}
          onTaskClick={(id) => setParams({ wp: id })}
        />
      )}

      <div
        className={`flex-1 px-3 sm:px-6 py-3 sm:py-4 ${
          view === "kanban" ? "overflow-hidden" : "overflow-auto"
        }`}
      >
        {view === "list" ? (
          <BoardList
            tasks={filteredTasks}
            statuses={statusesQ.data || []}
            onTaskClick={(id) => setParams({ wp: id })}
            onMoveTask={moveTaskByStatusId}
            onUpdate={updateTask}
            updatedSince={updatedSince}
            estimateMode={estimateMode}
          />
        ) : view === "swimlanes" ? (
          <BoardSwimlanes
            tasks={filteredTasks}
            statuses={statusesQ.data || []}
            assignees={assigneesQ.data || []}
            onTaskClick={(id) => setParams({ wp: id })}
            onUpdate={updateTask}
            updatedSince={updatedSince}
            estimateMode={estimateMode}
          />
        ) : (
          <Board
            tasks={filteredTasks}
            statuses={statusesQ.data || []}
            assignees={assigneesQ.data || []}
            sprints={sprintsList}
            types={typesQ.data || []}
            categories={categoriesQ.data || []}
            carryover={carryoverQ.data || null}
            updatedSince={updatedSince}
            showBacklogDropzone={
              sprintFilter !== "all" && sprintFilter !== "backlog"
            }
            onTaskClick={(id) => setParams({ wp: id })}
            onMoveTask={moveTaskByStatusId}
            onInlineCreate={onInlineCreate}
            onBulkUpdate={onBulkUpdate}
            onBulkDelete={onBulkDelete}
            onCreateInColumn={(statusId) => {
              setParams({
                create: "1",
                createSprint: activeSprint?.id || null,
                createStatus: statusId || null,
              });
            }}
          />
        )}
      </div>
    </>
  );
}
