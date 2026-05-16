"use client";

import { use, useState } from "react";
import { toast } from "sonner";
import { Backlog } from "@/components/backlog";
import { CreateSprintModal } from "@/components/create-sprint";
import { EditSprintModal } from "@/components/edit-sprint-modal";
import { SprintModal } from "@/components/sprint-modal";
import { CompleteSprintModal } from "@/components/complete-sprint-modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Icon } from "@/components/icons";
import { LoadingPill } from "@/components/ui/loading-pill";
import { Menu } from "@/components/ui/menu";
import {
  useApiStatus,
  useDeleteTask,
  useProjects,
  useSprints,
  useStatuses,
  useTasks,
  useTypes,
  useUpdateTask,
  usePriorities,
} from "@/lib/hooks/use-openproject";
import {
  useAvailableAssignees,
  useCarryover,
  useCategories,
  useCreateVersion,
  useDeleteVersion,
  useMe,
  useUpdateVersion,
} from "@/lib/hooks/use-openproject-detail";
import { usePermissionWithLoading } from "@/lib/hooks/use-permissions";
import { PERM } from "@/lib/openproject/permission-keys";
import { resolveApiPatch, runBatched } from "@/lib/openproject/resolve-patch";
import { buildClosedStatusIdSet } from "@/lib/openproject/task-state";
import {
  inferModeFromTasks,
  unitFor,
  weightOf,
} from "@/lib/openproject/estimate";
import { useEstimateMode } from "@/lib/hooks/use-estimate-mode";
import { useUrlParams } from "@/lib/hooks/use-modal-url";
import { useQueriesSettled } from "@/lib/hooks/use-queries-settled";
import { fetchJson, friendlyError } from "@/lib/api-client";
import { findById } from "@/lib/utils";

const OVERDUE_SPRINT_BANNER_LIMIT = 2;

const DEFAULT_FILTERS = {
  q: "",
  epic: "all",
  type: "all",
  label: "all",
  sprint: "all",
  assignee: "all",
};

export default function BacklogPage({ params: paramsPromise }) {
  const { projectId } = use(paramsPromise);
  const { params: urlParams, setParams } = useUrlParams();
  const filters = {
    q: urlParams.get("q") || "",
    epic: urlParams.get("epic") || "all",
    type: urlParams.get("type") || "all",
    label: urlParams.get("label") || "all",
    sprint: urlParams.get("sprint") || "all",
    assignee: urlParams.get("assignee") || "all",
    // `where` carries virtual presets that don't map to a single field
    // (e.g. "unestimated", "noEpic", "mineOpen"). The row predicate
    // below interprets it; the Views menu sets / clears it.
    where: urlParams.get("where") || null,
  };

  const status = useApiStatus();
  const configured = status.data?.configured === true;
  const me = useMe();
  const projectsQ = useProjects(configured);
  const tasksQ = useTasks(projectId, null, configured && !!projectId);
  const sprintsQ = useSprints(projectId, configured && !!projectId);
  const statusesQ = useStatuses(configured);
  const typesQ = useTypes(projectId, configured && !!projectId);
  const prioritiesQ = usePriorities(configured);
  const categoriesQ = useCategories(projectId, configured && !!projectId);
  const assigneesQ = useAvailableAssignees(projectId, configured && !!projectId);
  const carryoverQ = useCarryover(projectId, configured && !!projectId);
  const updateTaskMutation = useUpdateTask(projectId);
  const deleteTaskMutation = useDeleteTask(projectId);
  const createVersionMutation = useCreateVersion(projectId);
  const deleteVersionMutation = useDeleteVersion(projectId);
  const updateVersionMutation = useUpdateVersion(projectId);
  const manageVersions = usePermissionWithLoading(projectId, PERM.MANAGE_VERSIONS);

  const tasks = tasksQ.data || [];
  const sprintsList = sprintsQ.data || [];
  const statuses = statusesQ.data || [];
  const closedStatusIds = buildClosedStatusIdSet(statuses);

  // Trailing velocity — average done-points across the last 3 closed
  // sprints, used to flag over-commitment on planned/active sprint
  // headers. Returns null when there's no closed history yet (fresh
  // projects) or no done points to average; the UI hides the chip in
  // that case rather than showing a misleading "0 pts" target.
  // Schema-anchored estimation mode (t-shirt / numeric / duration). The
  // hook reads the project's OP schema; we fall back to the data-derived
  // signal only while the schema is loading or when the endpoint is
  // unreadable. This is the same authority the reporting routes use.
  const estimateModeQ = useEstimateMode(projectId);
  const estimateMode = estimateModeQ.isLoading
    ? inferModeFromTasks(tasks) || "numeric"
    : estimateModeQ.mode || "numeric";
  const estimateUnit = unitFor(estimateMode);
  const velocity = (() => {
    if (!sprintsList.length || !tasks.length) return null;
    const closed = sprintsList
      .filter((s) => s.status === "closed")
      .sort((a, b) => String(b.end || "").localeCompare(String(a.end || "")))
      .slice(0, 3);
    if (closed.length === 0) return null;
    let totalDone = 0;
    const wOpts = { mode: estimateMode };
    for (const sp of closed) {
      for (const t of tasks) {
        if (String(t.sprint) !== String(sp.id)) continue;
        if (!closedStatusIds.has(String(t.statusId))) continue;
        totalDone += weightOf(t, wOpts);
      }
    }
    if (totalDone <= 0) return null;
    return Math.round(totalDone / closed.length);
  })();

  // Sprints whose end date is in the past but are still open/locked. Surfaced
  // as a one-click "Complete sprint" / "Adjust dates" banner above the body.
  const overdueSprints = (() => {
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const todayIso = new Date(now).toISOString().slice(0, 10);
    const out = [];
    for (const s of sprintsList) {
      if (s.status !== "open" && s.status !== "locked") continue;
      if (!s.end || s.end === "—" || s.end >= todayIso) continue;
      const endedDays = Math.max(
        0,
        Math.round((now - new Date(s.end).getTime()) / (24 * 60 * 60 * 1000)),
      );
      out.push({ ...s, endedDays });
    }
    return out;
  })();

  // Hold the page chrome until every query the body reads has settled. The
  // filter chips, sprint picker, and per-row pickers all derive labels
  // from these — partial state shows raw "Type"/"Tag"/"Sprint" placeholders
  // for a tick and then swaps to real values, which reads as flicker.
  const { ready: pageReady, error: pageError } = useQueriesSettled(
    tasksQ,
    sprintsQ,
    statusesQ,
    typesQ,
    prioritiesQ,
    categoriesQ,
    assigneesQ,
  );
  // An "epic" is a parent in the OpenProject hierarchy — derived from
  // `_links.children`, never from the type name. Top-level parents
  // (no parent of their own) are the canonical epic candidates.
  const epicsList = tasks
    .filter((t) => t.hasChildren && !t.epic)
    .map((t) => ({
      id: String(t.nativeId),
      nativeId: String(t.nativeId),
      key: t.key,
      title: t.title,
      name: t.title,
      color: "var(--accent)",
    }));
  const myUserId = me.data?.user?.id || null;
  const filteredTasks = tasks.filter((t) => {
    if (filters.assignee !== "all" && t.assignee !== filters.assignee) return false;
    if (filters.epic !== "all" && t.epic !== filters.epic) return false;
    if (filters.type !== "all" && String(t.typeId) !== String(filters.type)) return false;
    if (filters.label !== "all" && !(t.labels || []).includes(filters.label)) return false;
    if (filters.sprint === "backlog" && t.sprint) return false;
    if (filters.sprint !== "all" && filters.sprint !== "backlog" && t.sprint !== filters.sprint)
      return false;
    if (filters.q) {
      const q = filters.q.toLowerCase();
      if (!t.title.toLowerCase().includes(q) && !t.key.toLowerCase().includes(q)) return false;
    }
    // Virtual presets — applied last so they compose with the
    // explicit filter dimensions above.
    if (filters.where === "unestimated") {
      // "Estimated" depends on the project's mode: a duration project
      // counts a WP with start+due dates as estimated even without
      // story points. weightOf with the project mode handles both.
      if (weightOf(t, { mode: estimateMode }) > 0) return false;
      if (closedStatusIds.has(String(t.statusId))) return false;
    } else if (filters.where === "noEpic") {
      if (t.epic) return false;
      if (t.hasChildren) return false;
    } else if (filters.where === "mineOpen") {
      if (!myUserId || String(t.assignee) !== String(myUserId)) return false;
      if (closedStatusIds.has(String(t.statusId))) return false;
    }
    return true;
  });

  const setFilter = (k, v) => setParams({ [k]: v && v !== "all" ? v : null });

  const updateTaskAsync = (id, patch) =>
    updateTaskMutation.mutateAsync({
      id,
      patch: resolveApiPatch(patch, {
        statuses: statusesQ.data,
        priorities: prioritiesQ.data,
        types: typesQ.data,
      }),
    });

  const updateTask = (id, patch) =>
    updateTaskMutation.mutate({
      id,
      patch: resolveApiPatch(patch, {
        statuses: statusesQ.data,
        priorities: prioritiesQ.data,
        types: typesQ.data,
      }),
    });

  const moveTaskByStatusId = (id, statusId) => {
    const t = tasks.find((x) => x.id === id);
    const target = findById(statusesQ.data, statusId);
    updateTaskMutation.mutate({
      id,
      patch: { statusId, statusName: target?.name },
    });
    if (t && target) toast.success(`${t.key} → ${target.name}`);
  };

  const moveTaskSprint = (id, sprintId) => {
    const t = tasks.find((x) => x.id === id);
    updateTask(id, { sprint: sprintId });
    const sprintName = sprintId
      ? sprintsList.find((s) => s.id === sprintId)?.name?.split(" — ")[0] || "Sprint"
      : "Backlog";
    if (t) toast.success(`${t.key} moved to ${sprintName}`);
  };

  // Page-local modal state — sprint actions live here, not in the layout.
  // Stored as ids so a re-fetch of sprintsQ shows fresh data on re-open.
  const [startSprintId, setStartSprintId] = useState(null);
  const [completeSprintId, setCompleteSprintId] = useState(null);
  const [createSprintOpen, setCreateSprintOpen] = useState(false);
  const [editSprintId, setEditSprintId] = useState(null);
  const [deleteSprintId, setDeleteSprintId] = useState(null);
  const [deletingSprint, setDeletingSprint] = useState(false);
  const [bulkDeleteFor, setBulkDeleteFor] = useState(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [filterMenu, setFilterMenu] = useState(null);
  // Separate slot for the "+ Filter" picker. Reusing `filterMenu` would
  // race Menu's onSelect→onClose pair (onClose fires after onSelect and
  // resets the slot to null, hiding the value picker we just opened).
  const [addFilterMenu, setAddFilterMenu] = useState(null);
  const [viewsMenu, setViewsMenu] = useState(null);
  const [overdueExpanded, setOverdueExpanded] = useState(false);

  const startSprintFor = startSprintId ? sprintsList.find((s) => s.id === startSprintId) : null;
  const completeSprintFor = completeSprintId
    ? sprintsList.find((s) => s.id === completeSprintId)
    : null;
  const editSprintFor = editSprintId ? sprintsList.find((s) => s.id === editSprintId) : null;
  const deleteSprintFor = deleteSprintId
    ? sprintsList.find((s) => s.id === deleteSprintId)
    : null;

  // Auto-clear the modal id if the underlying sprint disappears (deleted in OP).
  // Done as render-time setState so React doesn't double-commit; the
  // condition becomes false after the first reset, so this won't loop.
  if (startSprintId && !sprintsList.some((s) => s.id === startSprintId)) {
    setStartSprintId(null);
  }
  if (completeSprintId && !sprintsList.some((s) => s.id === completeSprintId)) {
    setCompleteSprintId(null);
  }
  if (editSprintId && !sprintsList.some((s) => s.id === editSprintId)) {
    setEditSprintId(null);
  }
  if (deleteSprintId && !sprintsList.some((s) => s.id === deleteSprintId)) {
    setDeleteSprintId(null);
  }

  const createSprint = async (cfg) => {
    try {
      await createVersionMutation.mutateAsync({
        name: cfg.name,
        description: cfg.goal,
        startDate: cfg.start,
        endDate: cfg.end,
      });
      toast.success(`Sprint created · ${cfg.name}`);
      setCreateSprintOpen(false);
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't create sprint — please try again."));
      throw e;
    }
  };

  // ── Lock / unlock / reopen sprint ─────────────────────────────────
  // Flips the OP version status directly (open ↔ locked, closed → open)
  // without touching its dates or work packages.
  const setVersionStatus = async (sprint, nextStatus) => {
    if (!sprint?.id || !nextStatus) return;
    const verb =
      nextStatus === "locked"
        ? "Locking"
        : sprint.status === "closed"
        ? "Reopening"
        : "Unlocking";
    const pending = toast.loading(
      `${verb} ${sprint.name?.split(" — ")[0] || "sprint"}…`,
    );
    try {
      await updateVersionMutation.mutateAsync({ id: sprint.id, status: nextStatus });
      toast.dismiss(pending);
      toast.success(
        nextStatus === "locked"
          ? "Sprint locked"
          : sprint.status === "closed"
          ? "Sprint reopened"
          : "Sprint unlocked",
      );
    } catch (e) {
      toast.dismiss(pending);
      toast.error(friendlyError(e, "Couldn't change sprint status — please try again."));
    }
  };

  // ── Export work packages to CSV ───────────────────────────────────
  // Flattens the kebab-clicked sprint's tasks into a CSV (one row per
  // work package) and triggers a browser download. Filename is
  // "<project name> - <sprint name>.csv".
  const onExportCsv = (sprint) => {
    const sprintId = sprint?.id;
    const sprintName = sprint?.name?.split(" — ")[0] || "sprint";
    const sprintTasks = tasks.filter((t) => t.sprint === sprintId);
    if (sprintTasks.length === 0) {
      toast.message(`${sprintName} has no work packages to export.`);
      return;
    }

    const project = (projectsQ.data || []).find((p) => p.id === projectId);
    const projectName = project?.name || "project";

    const epicTitleById = new Map(
      tasks
        .filter((t) => t.nativeId != null)
        .map((t) => [String(t.nativeId), t.title]),
    );

    const columns = [
      ["Key", (t) => t.key || ""],
      ["Title", (t) => t.title || ""],
      ["Type", (t) => t.typeName || ""],
      ["Status", (t) => t.statusName || ""],
      ["Priority", (t) => t.priorityName || ""],
      ["Story Points", (t) => (t.points != null ? String(t.points) : "")],
      ["Assignee", (t) => t.assigneeName || ""],
      ["Reporter", (t) => t.reporterName || ""],
      ["Sprint", (t) => t.sprintName || ""],
      [
        "Parent",
        (t) =>
          t.epic && epicTitleById.has(String(t.epic))
            ? epicTitleById.get(String(t.epic))
            : t.epicName || "",
      ],
      ["Tag", (t) => t.categoryName || ""],
      ["Start Date", (t) => t.startDate || ""],
      ["Due Date", (t) => t.dueDate || ""],
      [
        "% Done",
        (t) => (t.percentageDone != null ? String(t.percentageDone) : ""),
      ],
      ["Description", (t) => t.description || ""],
      ["Created", (t) => t.createdAt || ""],
      ["Updated", (t) => t.updatedAt || ""],
    ];

    const escape = (v) => {
      const s = String(v ?? "");
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = columns.map(([h]) => escape(h)).join(",");
    const rows = sprintTasks.map((t) =>
      columns.map(([, get]) => escape(get(t))).join(","),
    );
    // BOM so Excel reads UTF-8 correctly.
    const csv = "﻿" + [header, ...rows].join("\r\n");

    const sanitize = (s) =>
      s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
    const filename = `${sanitize(projectName)} - ${sanitize(sprintName)}.csv`;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(
      `Exported ${sprintTasks.length} ${sprintTasks.length === 1 ? "task" : "tasks"} from ${sprintName}`,
    );
  };

  const labelOptions = (categoriesQ.data || []).map((c) => ({
    label: c.name,
    value: c.name,
    active: filters.label === c.name,
  }));

  const hasActiveFilters =
    filters.epic !== "all" ||
    filters.type !== "all" ||
    filters.label !== "all" ||
    filters.sprint !== "all" ||
    filters.assignee !== "all" ||
    filters.q;

  // ── Filter-bar metadata ────────────────────────────────────────────────
  // Backlog has a single layout (no view switch), so every kind is always
  // relevant — the "+ Filter" picker offers everything that isn't already
  // set. Active chips render with an inline X to clear without going
  // through the global "Clear filters" button.
  const chipMeta = (kind) => {
    switch (kind) {
      case "epic": {
        const v = filters.epic;
        return {
          icon: "epic",
          addLabel: "Epic",
          activeLabel:
            v === "all"
              ? "Epic"
              : epicsList.find((e) => e.id === v)?.title || "Epic",
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
      case "sprint": {
        const v = filters.sprint;
        return {
          icon: "sprint",
          addLabel: "Sprint",
          activeLabel:
            v === "all"
              ? "Sprint"
              : v === "backlog"
              ? "Backlog only"
              : sprintsList.find((s) => s.id === v)?.name?.split(" — ")[0] ||
                "Sprint",
        };
      }
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
      default:
        return { icon: "filter", addLabel: kind, activeLabel: kind };
    }
  };

  const ALL_FILTER_KINDS = ["epic", "type", "label", "sprint", "assignee"];
  const activeFilterKinds = ALL_FILTER_KINDS.filter(
    (k) => filters[k] && filters[k] !== "all",
  );
  const availableFilterKinds = ALL_FILTER_KINDS.filter(
    (k) => filters[k] === "all" || !filters[k],
  );

  if (!pageReady) {
    return (
      <>
        <div className="bg-surface-elevated border-b border-border-soft px-3 sm:px-6 pt-3.5 pb-3 shrink-0">
          <h1 className="font-display text-[24px] font-semibold tracking-[-0.022em] text-fg m-0">
            Backlog
          </h1>
        </div>
        <div className="flex-1 grid place-items-center">
          <LoadingPill label="loading backlog" />
        </div>
      </>
    );
  }

  if (pageError) {
    return (
      <>
        <div className="bg-surface-elevated border-b border-border-soft px-3 sm:px-6 pt-3.5 pb-3 shrink-0">
          <h1 className="font-display text-[24px] font-semibold tracking-[-0.022em] text-fg m-0">
            Backlog
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
      <div className="bg-surface-elevated border-b border-border-soft px-3 sm:px-6 pt-3.5 pb-3 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-display text-[24px] font-semibold tracking-[-0.022em] text-fg m-0">
            Backlog
          </h1>
        </div>
      </div>

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
            className="w-35 sm:w-50 h-7 pl-7 pr-2 rounded-md border border-border bg-surface-elevated text-xs text-fg outline-none transition-colors focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-100)]"
          />
        </div>
        {/* Active-only chips: render only when the filter is set, each
            with its own X to clear. A fresh backlog shows zero chips. */}
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
        <button
          type="button"
          onClick={(e) =>
            setViewsMenu({ rect: e.currentTarget.getBoundingClientRect() })
          }
          className={[
            "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium cursor-pointer transition-colors",
            filters.where
              ? "bg-accent-50 border-accent-200 text-accent-700"
              : "bg-surface-elevated border-border text-fg-muted hover:bg-surface-subtle hover:border-border-strong",
          ].join(" ")}
          title="Saved views and presets"
        >
          <Icon name="star" size={13} aria-hidden="true" />
          {filters.where === "unestimated"
            ? "Unestimated"
            : filters.where === "noEpic"
            ? "No epic"
            : filters.where === "mineOpen"
            ? "My open"
            : "Views"}
        </button>
        {(hasActiveFilters || filters.where) && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 h-6.5 px-2.5 rounded-md border border-transparent bg-transparent text-xs text-fg-muted hover:bg-surface-subtle"
            onClick={() =>
              setParams({
                q: null,
                epic: null,
                type: null,
                label: null,
                sprint: null,
                assignee: null,
                where: null,
              })
            }
          >
            Clear filters
          </button>
        )}
        <div className="md:flex-1" />
        {manageVersions.allowed && (
          <button
            type="button"
            onClick={() => setCreateSprintOpen(true)}
            disabled={manageVersions.loading}
            className="inline-flex items-center gap-1.5 h-6.5 px-2.5 rounded-md border border-border bg-surface-elevated text-xs text-fg font-medium transition-colors hover:bg-surface-subtle hover:border-border-strong disabled:opacity-50"
            title={manageVersions.loading ? "Checking permissions…" : "Create sprint"}
          >
            <Icon name="sprint" size={13} aria-hidden="true" />
            Create sprint
          </button>
        )}
        <button
          type="button"
          className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md bg-accent text-on-accent text-xs font-semibold transition-transform hover:-translate-y-px hover:bg-accent-600 shadow-(--card-highlight)"
          onClick={() => setParams({ create: "1" })}
        >
          <Icon name="plus" size={13} aria-hidden="true" /> Create
        </button>
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

      {viewsMenu && (
        <Menu
          anchorRect={viewsMenu.rect}
          align="right"
          width={240}
          onClose={() => setViewsMenu(null)}
          onSelect={(it) => {
            // Selecting the same preset twice clears it.
            const next = filters.where === it.value ? null : it.value;
            setParams({ where: next });
          }}
          items={[
            { section: "Presets" },
            {
              label: "Unestimated",
              value: "unestimated",
              icon: "epic",
              active: filters.where === "unestimated",
            },
            {
              label: "No epic",
              value: "noEpic",
              icon: "epic",
              active: filters.where === "noEpic",
            },
            ...(myUserId
              ? [
                  {
                    label: "My open",
                    value: "mineOpen",
                    icon: "people",
                    active: filters.where === "mineOpen",
                  },
                ]
              : []),
          ]}
        />
      )}

      {filterMenu?.kind === "epic" && (
        <Menu
          anchorRect={filterMenu.rect}
          onClose={() => setFilterMenu(null)}
          onSelect={(it) => setFilter("epic", it.value)}
          items={[
            { label: "All epics", value: "all", active: filters.epic === "all" },
            { divider: true },
            ...epicsList.map((e) => ({
              label: e.title,
              value: e.id,
              swatch: e.color,
              active: filters.epic === e.id,
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
      {filterMenu?.kind === "sprint" && (
        <Menu
          anchorRect={filterMenu.rect}
          onClose={() => setFilterMenu(null)}
          onSelect={(it) => setFilter("sprint", it.value)}
          items={[
            { label: "All sprints (default)", value: "all", active: filters.sprint === "all" },
            { label: "Backlog only", value: "backlog", active: filters.sprint === "backlog" },
            { divider: true },
            ...sprintsList.map((s) => ({
              label: s.name,
              value: s.id,
              active: filters.sprint === s.id,
            })),
          ]}
        />
      )}
      {filterMenu?.kind === "assignee" && (
        <Menu
          anchorRect={filterMenu.rect}
          onClose={() => setFilterMenu(null)}
          searchable
          searchPlaceholder="Search people…"
          width={240}
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

      {manageVersions.allowed && overdueSprints.length > 0 && (
        <div className="px-3 sm:px-6 pt-3">
          {(overdueExpanded ? overdueSprints : overdueSprints.slice(0, OVERDUE_SPRINT_BANNER_LIMIT)).map((sp) => {
              const endedDays = sp.endedDays;
              return (
                <div
                  key={sp.id}
                  className="flex items-center gap-2 px-3 py-2 mb-2 rounded-lg border border-pri-high/40 bg-pri-high/10 text-[12px] text-fg"
                >
                  <Icon name="clock" size={13} aria-hidden="true" />
                  <span>
                    Sprint <b>{sp.name?.split(" — ")[0] || sp.name}</b> ended {endedDays === 0 ? "today" : `${endedDays} day${endedDays === 1 ? "" : "s"} ago`} but is still {sp.status === "locked" ? "locked" : "open"}.
                  </span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCompleteSprintId(sp.id)}
                      className="inline-flex items-center gap-1 h-6.5 px-2.5 rounded-md border border-border bg-surface-elevated text-xs font-medium hover:bg-surface-subtle hover:border-border-strong cursor-pointer"
                    >
                      <Icon name="check" size={11} aria-hidden="true" />
                      Complete sprint…
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditSprintId(sp.id)}
                      className="inline-flex items-center h-6.5 px-2 rounded-md text-xs text-fg-subtle hover:text-fg cursor-pointer"
                    >
                      Adjust dates
                    </button>
                  </div>
                </div>
              );
            })}
            {overdueSprints.length > OVERDUE_SPRINT_BANNER_LIMIT && (
              <div className="mb-2 flex justify-center">
                <button
                  type="button"
                  onClick={() => setOverdueExpanded((v) => !v)}
                  className="inline-flex items-center gap-1 h-6.5 px-2.5 rounded-md text-xs text-fg-subtle hover:text-fg cursor-pointer"
                >
                  {overdueExpanded
                    ? "Show less"
                    : `Show ${overdueSprints.length - OVERDUE_SPRINT_BANNER_LIMIT} more overdue sprint${overdueSprints.length - OVERDUE_SPRINT_BANNER_LIMIT === 1 ? "" : "s"}`}
                </button>
              </div>
            )}
          </div>
        )}

      <div className="flex-1 px-3 sm:px-6 py-3 sm:py-4 overflow-auto">
        <Backlog
            tasks={filteredTasks}
            statuses={statusesQ.data || []}
            sprints={sprintsList}
            assignees={assigneesQ.data || []}
            types={typesQ.data || []}
            categories={categoriesQ.data || []}
            velocity={velocity}
            estimateUnit={estimateUnit}
            estimateMode={estimateMode}
            manageVersions={manageVersions}
            currentUserId={me.data?.user?.id}
            pinnedSprintId={
              filters.sprint !== "all" && filters.sprint !== "backlog"
                ? filters.sprint
                : null
            }
            carryover={carryoverQ.data || null}
            onTaskClick={(id) => setParams({ wp: id })}
            onMoveTask={moveTaskSprint}
            onStatusChange={moveTaskByStatusId}
            onAssigneeChange={(id, a) => {
              updateTask(id, { assignee: a });
              toast.success("Assignee updated");
            }}
            onStartSprint={(sp) => setStartSprintId(sp?.id || null)}
            onCompleteSprint={(sp) => setCompleteSprintId(sp?.id || null)}
            onCreateSprint={() => setCreateSprintOpen(true)}
            onEditSprint={(sp) => setEditSprintId(sp?.id || null)}
            onDeleteSprint={(sp) => setDeleteSprintId(sp?.id || null)}
            onExportCsv={onExportCsv}
            onSetVersionStatus={setVersionStatus}
            onBulkMoveSprint={async (ids, sprintId) => {
              const target = sprintId
                ? sprintsList.find((s) => s.id === sprintId)?.name?.split(" — ")[0] || "sprint"
                : "backlog";
              const pending = toast.loading(
                `Moving ${ids.length} ${ids.length === 1 ? "issue" : "issues"} to ${target}…`,
              );
              const { ok, gone, failed } = await runBatched(
                ids,
                updateTaskAsync,
                () => ({ sprint: sprintId }),
              );
              toast.dismiss(pending);
              if (failed > 0) {
                toast.error(
                  `Moved ${ok + gone} of ${ids.length}. ${failed} failed — see OpenProject.`,
                );
              } else {
                toast.success(
                  `Moved ${ok + gone} ${ok + gone === 1 ? "issue" : "issues"} to ${target}`,
                );
              }
            }}
            onBulkAssign={async (ids, assigneeId) => {
              const verb = assigneeId ? "Assigning" : "Unassigning";
              const pending = toast.loading(
                `${verb} ${ids.length} ${ids.length === 1 ? "issue" : "issues"}…`,
              );
              const { ok, gone, failed } = await runBatched(
                ids,
                updateTaskAsync,
                () => ({ assignee: assigneeId }),
              );
              toast.dismiss(pending);
              if (failed > 0) {
                toast.error(
                  `Updated ${ok + gone} of ${ids.length}. ${failed} failed — see OpenProject.`,
                );
              } else {
                toast.success(
                  assigneeId
                    ? `Assigned ${ok + gone} ${ok + gone === 1 ? "issue" : "issues"}`
                    : `Unassigned ${ok + gone} ${ok + gone === 1 ? "issue" : "issues"}`,
                );
              }
            }}
            onBulkSetType={async (ids, typeId) => {
              const typeName =
                findById(typesQ.data, typeId)?.name || typeId;
              const pending = toast.loading(
                `Updating type for ${ids.length} ${ids.length === 1 ? "issue" : "issues"}…`,
              );
              const { ok, gone, failed } = await runBatched(
                ids,
                updateTaskAsync,
                () => ({ typeId }),
              );
              toast.dismiss(pending);
              if (failed > 0) {
                toast.error(
                  `Updated ${ok + gone} of ${ids.length}. ${failed} failed — see OpenProject.`,
                );
              } else {
                toast.success(
                  `${ok + gone} ${ok + gone === 1 ? "issue" : "issues"} → ${typeName}`,
                );
              }
            }}
            onBulkAddLabel={async (ids, labelName) => {
              if (!labelName) return;
              // Skip ids that already carry the tag — runBatched doesn't
              // know how to no-op, so a null patchFor return would still
              // fire a PATCH. Pre-filter to only the rows that need it.
              const targets = ids.filter((id) => {
                const t = tasks.find((x) => x.id === id);
                const existing = Array.isArray(t?.labels) ? t.labels : [];
                return !existing.includes(labelName);
              });
              if (targets.length === 0) {
                toast.message(`All selected issues already tagged · ${labelName}`);
                return;
              }
              const pending = toast.loading(
                `Tagging ${targets.length} ${targets.length === 1 ? "issue" : "issues"}…`,
              );
              const { ok, gone, failed } = await runBatched(
                targets,
                updateTaskAsync,
                (id) => {
                  const t = tasks.find((x) => x.id === id);
                  const existing = Array.isArray(t?.labels) ? t.labels : [];
                  return { labels: [...existing, labelName] };
                },
              );
              toast.dismiss(pending);
              if (failed > 0) {
                toast.error(
                  `Tagged ${ok + gone} of ${targets.length}. ${failed} failed — see OpenProject.`,
                );
              } else {
                toast.success(
                  `Tagged ${ok + gone} ${ok + gone === 1 ? "issue" : "issues"} · ${labelName}`,
                );
              }
            }}
            onBulkDelete={(ids, clearSelection) => {
              if (!ids?.length) return;
              setBulkDeleteFor({ ids, clearSelection });
            }}
            onBulkSetParent={async (ids, parentId, parentName) => {
              const pending = toast.loading(
                `Setting parent for ${ids.length} ${ids.length === 1 ? "issue" : "issues"}…`,
              );
              const { ok, gone, failed } = await runBatched(
                ids,
                updateTaskAsync,
                () => ({ parent: parentId }),
              );
              toast.dismiss(pending);
              if (failed > 0) {
                toast.error(
                  `Updated ${ok + gone} of ${ids.length}. ${failed} failed — see OpenProject.`,
                );
              } else {
                toast.success(
                  `${ok + gone} ${ok + gone === 1 ? "issue" : "issues"} → ${parentName || `#${parentId}`}`,
                );
              }
            }}
            projectId={projectId}
            onCreate={(sprintId) => setParams({ create: "1", createSprint: sprintId || null })}
            onUpdateDescription={(id, html) => updateTask(id, { description: html, descriptionHtml: html })}
          />
      </div>

      {startSprintFor && (
        <SprintModal
          sprint={startSprintFor}
          tasks={tasks}
          projectId={projectId}
          onClose={() => setStartSprintId(null)}
          onStarted={() => setStartSprintId(null)}
        />
      )}
      {completeSprintFor && (
        <CompleteSprintModal
          sprint={completeSprintFor}
          tasks={tasks}
          sprints={sprintsList}
          statuses={statusesQ.data || []}
          projectId={projectId}
          onClose={() => setCompleteSprintId(null)}
        />
      )}
      {createSprintOpen && (
        <CreateSprintModal
          onClose={() => setCreateSprintOpen(false)}
          onCreate={createSprint}
        />
      )}
      {editSprintFor && (
        <EditSprintModal
          sprint={editSprintFor}
          projectId={projectId}
          onClose={() => setEditSprintId(null)}
        />
      )}
      {deleteSprintFor && (() => {
        const inSprintLocal = tasks.filter((t) => t.sprint === deleteSprintFor.id);
        return (
          <ConfirmModal
            title={`Delete ${deleteSprintFor.name?.split(" — ")[0] || "sprint"}?`}
            description={
              inSprintLocal.length > 0
                ? `This will permanently delete the sprint and all ${inSprintLocal.length} ${
                    inSprintLocal.length === 1 ? "task" : "tasks"
                  } inside it. This can't be undone.`
                : "This will permanently delete the sprint and any tasks attached to it. This can't be undone."
            }
            confirmLabel="Delete sprint"
            destructive
            busy={deletingSprint}
            onClose={() => !deletingSprint && setDeleteSprintId(null)}
            onConfirm={async () => {
              setDeletingSprint(true);
              try {
                let list = [];
                try {
                  const scoped = await fetchJson(
                    `/api/openproject/tasks?project=${encodeURIComponent(
                      projectId,
                    )}&sprint=${encodeURIComponent(deleteSprintFor.id)}`,
                  );
                  if (Array.isArray(scoped)) list = scoped;
                } catch {
                  // If the list fetch fails, still attempt to delete the
                  // version — OP will tell us if it can't.
                }
                let deleted = 0;
                let alreadyGone = 0;
                let failed = 0;
                const BATCH = 8;
                for (let i = 0; i < list.length; i += BATCH) {
                  const slice = list.slice(i, i + BATCH);
                  await Promise.all(
                    slice.map(async (t) => {
                      try {
                        await deleteTaskMutation.mutateAsync(t.id);
                        deleted += 1;
                      } catch (err) {
                        if (err?.status === 404) alreadyGone += 1;
                        else failed += 1;
                      }
                    }),
                  );
                }
                if (failed > 0) {
                  toast.error(
                    `Couldn't delete ${failed} ${
                      failed === 1 ? "task" : "tasks"
                    } in this sprint — fix in OpenProject and retry.`,
                  );
                  return;
                }
                try {
                  await deleteVersionMutation.mutateAsync(deleteSprintFor.id);
                } catch (err) {
                  if (err?.status !== 404) throw err;
                }
                const removed = deleted + alreadyGone;
                toast.success(
                  removed > 0
                    ? `Sprint and ${removed} ${removed === 1 ? "task" : "tasks"} deleted`
                    : "Sprint deleted",
                );
                setDeleteSprintId(null);
              } catch (e) {
                toast.error(friendlyError(e, "Couldn't delete sprint — please try again."));
              } finally {
                setDeletingSprint(false);
              }
            }}
          />
        );
      })()}

      {bulkDeleteFor && (
        <ConfirmModal
          title={`Delete ${bulkDeleteFor.ids.length} work ${
            bulkDeleteFor.ids.length === 1 ? "package" : "packages"
          }?`}
          description="This permanently removes the selected work packages and any sub-tasks attached to them. This can't be undone."
          confirmLabel={`Delete ${bulkDeleteFor.ids.length}`}
          destructive
          busy={bulkDeleting}
          onClose={() => !bulkDeleting && setBulkDeleteFor(null)}
          onConfirm={async () => {
            const { ids, clearSelection } = bulkDeleteFor;
            setBulkDeleting(true);
            const pending = toast.loading(
              `Deleting ${ids.length} work ${ids.length === 1 ? "package" : "packages"}…`,
            );
            let deleted = 0;
            let alreadyGone = 0;
            let failed = 0;
            const BATCH = 8;
            for (let i = 0; i < ids.length; i += BATCH) {
              const slice = ids.slice(i, i + BATCH);
              await Promise.all(
                slice.map(async (id) => {
                  try {
                    await deleteTaskMutation.mutateAsync(id);
                    deleted += 1;
                  } catch (err) {
                    if (err?.status === 404) alreadyGone += 1;
                    else failed += 1;
                  }
                }),
              );
            }
            toast.dismiss(pending);
            const ok = deleted + alreadyGone;
            if (failed > 0) {
              toast.error(
                `Deleted ${ok} of ${ids.length}. ${failed} failed — check OpenProject permissions.`,
              );
            } else {
              toast.success(
                `${ok} work ${ok === 1 ? "package" : "packages"} deleted`,
              );
            }
            clearSelection?.();
            setBulkDeleteFor(null);
            setBulkDeleting(false);
          }}
        />
      )}

    </>
  );
}
