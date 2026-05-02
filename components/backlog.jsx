"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import {
  TaskPriorityIcon,
  TaskStatusPill,
  TaskTypeIcon,
} from "@/components/ui/task-meta";
import { Menu } from "@/components/ui/menu";
import { EmptyState } from "@/components/ui/empty-state";
import { TagPill } from "@/components/ui/tag-pill";
import { Icon } from "@/components/icons";
import { CarryOverChip } from "@/components/ui/carryover-chip";
import { PaginationFooter } from "@/components/ui/pagination-footer";
import { formatEstimate, weightOf } from "@/lib/openproject/estimate";
import { PEOPLE } from "@/lib/data";
import { cn, findById, formatAbsDate } from "@/lib/utils";
import { buildChildIndex, rootsOf } from "@/lib/openproject/hierarchy";
import { assigneeMenuItems, statusMenuItems } from "@/lib/openproject/menu-items";

// Backlog row column layout. Each column has a deliberate width so the
// table reads cleanly on every screen width:
//   1. checkbox          18px
//   2. grip / chevron    18px
//   3. type icon         18px
//   4. title (key+title+tags)  240–480px, ellipses long titles
//   5. status pill       128px (fits "IN REVIEW")
//   6. priority icon     20px
//   7. points pill       48px
//   8. sprint name       110–180px
//   9. assignee avatar   28px
// Responsive grid template lives in globals.css under `.backlog-row` —
// on phones the row collapses to 5 columns (checkbox, expand, title,
// status, assignee) and the desktop-only cells get tagged with
// `.backlog-cell-md` so they `display: none` until ≥md.
const ROW_GRID = "backlog-row";
const HEADER_GRID = "backlog-row";
function Checkbox({ checked, onChange, label }) {
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.(!checked);
      }}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onChange?.(!checked);
        }
      }}
      className={cn(
        "inline-grid place-items-center w-4 h-4 rounded border-[1.5px] transition-colors cursor-pointer",
        checked
          ? "bg-accent border-accent text-on-accent"
          : "bg-surface-elevated border-border-strong hover:border-accent",
      )}
    >
      {checked && <Icon name="check" size={11} aria-hidden="true" />}
    </span>
  );
}

function BacklogRow({
  task,
  statuses,
  assignees,
  selected,
  focused = false,
  depth = 0,
  hasChildren = false,
  expanded = false,
  onToggle,
  onSelectChange,
  onClick,
  onStatusChange,
  onAssigneeChange,
  carryOver,
}) {
  const assigneeList = Array.isArray(assignees) ? assignees : [];
  const assignee =
    findById(assigneeList, task.assignee) ||
    (task.assignee
      ? { id: task.assignee, name: task.assigneeName || "Assignee" }
      : null);
  const [statusMenu, setStatusMenu] = useState(null);
  const [assignMenu, setAssignMenu] = useState(null);
  const editable = task.permissions?.update !== false;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled: !editable,
  });

  return (
    <div
      ref={setNodeRef}
      data-task-id={task.id}
      data-focused={focused ? "true" : undefined}
      {...attributes}
      {...(editable ? listeners : {})}
      className={cn(
        ROW_GRID,
        // pr-4 (not pr-3) so the assignee avatar has 16px of buffer between
        // its right edge and the .luxe-card border — corner-radius was
        // clipping a few pixels off when the row scrolled to its right end.
        "pl-3 pr-4 py-1.5 border-b border-border-soft cursor-pointer transition-colors hover:bg-surface-subtle",
        isDragging && "opacity-50 cursor-grabbing",
        task.statusIsClosed && "opacity-70",
        selected && "bg-accent-50/40",
        focused && !selected && "ring-2 ring-fg/50 ring-offset-1 ring-offset-surface-elevated",
      )}
      style={depth > 0 ? { paddingLeft: 12 + depth * 20 } : undefined}
      onClick={() => onClick(task.id)}
      aria-disabled={!editable || undefined}
    >
      <Checkbox
        checked={selected}
        onChange={(v) => onSelectChange?.(task.id, v)}
        label={`Select ${task.key}`}
      />
      {hasChildren ? (
        <span
          role="button"
          data-inline-tap
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={expanded ? "Collapse" : "Expand"}
          className="relative grid place-items-center w-4 h-4 rounded text-fg-subtle cursor-pointer hover:bg-surface-muted hover:text-fg before:content-[''] before:absolute before:-inset-2"
        >
          <Icon
            name={expanded ? "chev-down" : "chev-right"}
            size={12}
            aria-hidden="true"
          />
        </span>
      ) : (
        <span
          onClick={(e) => e.stopPropagation()}
          aria-hidden="true"
          className={cn(
            "text-border-strong cursor-grab opacity-50 hover:opacity-100 transition-opacity",
            !editable && "invisible",
          )}
        >
          <Icon name="grip" size={14} />
        </span>
      )}
      <span className="backlog-cell-md">
        <TaskTypeIcon task={task} size={14} />
      </span>
      <span className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-[11px] text-fg-subtle shrink-0">{task.key}</span>
        {carryOver && <CarryOverChip entry={carryOver} />}
        <span
          title={task.title}
          className={cn(
            "flex-1 min-w-0 truncate text-[13px]",
            task.statusIsClosed ? "text-fg-subtle line-through" : "text-fg",
          )}
        >
          {task.title}
        </span>
        {task.labels && task.labels.length > 0 && (
          <span className="hidden md:flex items-center gap-1 shrink-0">
            {task.labels.slice(0, 2).map((l) => (
              <TagPill key={l} name={l} size="xs" />
            ))}
            {task.labels.length > 2 && (
              <span className="text-[10px] text-fg-subtle font-medium">
                +{task.labels.length - 2}
              </span>
            )}
          </span>
        )}
      </span>
      <span
        onClick={(e) => {
          if (!editable) return;
          e.stopPropagation();
          setStatusMenu(e.currentTarget.getBoundingClientRect());
        }}
        className={cn(editable ? "cursor-pointer" : "cursor-default")}
        aria-disabled={!editable || undefined}
      >
        <TaskStatusPill task={task} />
      </span>
      <span className="backlog-cell-md justify-self-center">
        <TaskPriorityIcon task={task} size={14} />
      </span>
      <span
        title={`${task.points || 0} story points`}
        className="backlog-cell-md justify-self-center px-2 py-0.5 rounded-full bg-surface-muted text-[11px] font-medium text-fg-muted text-center min-w-9"
      >
        {formatEstimate(task) ?? "—"}
      </span>
      <span
        className="backlog-cell-md text-xs text-fg-subtle tabular-nums truncate"
        title={task.startDate || ""}
      >
        {formatAbsDate(task.startDate, "—")}
      </span>
      <span
        className="backlog-cell-md text-xs text-fg-subtle tabular-nums truncate"
        title={task.dueDate || ""}
      >
        {formatAbsDate(task.dueDate, "—")}
      </span>
      <span
        className="backlog-cell-md text-xs text-fg-subtle truncate"
        title={task.sprintName || ""}
      >
        {task.sprintName ? task.sprintName.split(" — ")[0] : "—"}
      </span>
      <span
        onClick={(e) => {
          if (!editable) return;
          e.stopPropagation();
          setAssignMenu(e.currentTarget.getBoundingClientRect());
        }}
        className={cn(
          editable ? "cursor-pointer" : "cursor-default",
          "justify-self-center",
        )}
        aria-disabled={!editable || undefined}
        title={assignee?.name || task.assigneeName || "Unassigned"}
      >
        <Avatar user={assignee} size="sm" />
      </span>

      {statusMenu && (
        <Menu
          anchorRect={statusMenu}
          onClose={() => setStatusMenu(null)}
          onSelect={(it) => onStatusChange(task.id, it.value)}
          items={statusMenuItems(statuses, task.statusId)}
        />
      )}
      {assignMenu && (
        <Menu
          anchorRect={assignMenu}
          onClose={() => setAssignMenu(null)}
          onSelect={(it) => onAssigneeChange(task.id, it.value)}
          searchable
          searchPlaceholder="Search people…"
          width={240}
          items={assigneeMenuItems(task.assignee, assigneeList)}
        />
      )}
    </div>
  );
}

// OP exposes three native version statuses (open / locked / closed). The
// pill lets users see at a glance which sprints are still editable, which
// are running but locked from edits, and which are archived.
const SPRINT_STATUS_STYLE = {
  open: {
    label: "Open",
    cls: "bg-status-todo-bg text-status-todo-fg",
    title: "Open — accepting changes",
  },
  locked: {
    label: "Locked",
    cls: "bg-status-progress-bg text-status-progress-fg",
    title: "Locked — running, no edits allowed",
  },
  closed: {
    label: "Closed",
    cls: "bg-surface-muted text-fg-subtle",
    title: "Closed — archived",
  },
};

function SprintStatusPill({ status }) {
  const meta = SPRINT_STATUS_STYLE[status];
  if (!meta) return null;
  return (
    <span
      className={`inline-flex items-center px-2 h-5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${meta.cls}`}
      title={meta.title}
    >
      {meta.label}
    </span>
  );
}

function BacklogTreeRow({
  task,
  depth,
  childIndex,
  expandedSet,
  toggle,
  selectedSet,
  focusedId,
  rowProps,
}) {
  const children = childIndex.get(String(task.nativeId)) || [];
  const isOpen = expandedSet.has(task.id);
  const carryOver =
    rowProps.carryoverByWpId?.[String(task.nativeId)] ||
    rowProps.carryoverByWpId?.[task.nativeId] ||
    null;
  return (
    <Fragment>
      <BacklogRow
        {...rowProps}
        task={task}
        selected={selectedSet.has(task.id)}
        focused={focusedId === task.id}
        depth={depth}
        hasChildren={children.length > 0}
        expanded={isOpen}
        onToggle={() => toggle(task.id)}
        carryOver={carryOver}
      />
      {isOpen &&
        children.map((c) => (
          <BacklogTreeRow
            key={c.id}
            task={c}
            depth={depth + 1}
            childIndex={childIndex}
            expandedSet={expandedSet}
            toggle={toggle}
            focusedId={focusedId}
            selectedSet={selectedSet}
            rowProps={rowProps}
          />
        ))}
    </Fragment>
  );
}

function BacklogSection({
  title,
  sub,
  tasks,
  sprint,
  isSprint,
  isOver,
  statuses,
  assignees,
  manageVersions,
  canCreate,
  selected,
  onSelectChange,
  onSelectAll,
  onTaskClick,
  onStatusChange,
  onAssigneeChange,
  onStartSprint,
  onCompleteSprint,
  onCreateSprint,
  onEditSprint,
  onDeleteSprint,
  onExportCsv,
  onSetVersionStatus,
  onCreate,
  velocity = null,
  estimateUnit = "pts",
  focusedId = null,
  carryoverByWpId,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [expandedSet, setExpandedSet] = useState(() => new Set());
  const [sprintMenu, setSprintMenu] = useState(null);
  // Build the kebab in three groups (lifecycle / management / destructive)
  // separated by dividers; each group only adds a leading divider when the
  // previous group was non-empty so we never render two in a row.
  const sprintMenuItems = (() => {
    const items = [];
    const pushDivider = () => {
      if (items.length > 0 && items[items.length - 1]?.divider !== true) {
        items.push({ divider: true });
      }
    };
    if (isSprint && sprint?.state === "planned" && onStartSprint) {
      items.push({ label: "Start sprint", value: "start", icon: "play" });
    }
    if (isSprint && sprint?.state === "active" && onCompleteSprint) {
      items.push({ label: "Complete sprint", value: "complete", icon: "check" });
    }
    if (isSprint && onSetVersionStatus) {
      // Lock / unlock / reopen — these flip the OP version status directly
      // (open ↔ locked, closed → open). They don't move work packages.
      if (sprint?.status === "open") {
        pushDivider();
        items.push({ label: "Lock sprint", value: "lock", icon: "pause" });
      } else if (sprint?.status === "locked") {
        pushDivider();
        items.push({ label: "Unlock sprint", value: "unlock", icon: "play" });
      } else if (sprint?.status === "closed") {
        pushDivider();
        items.push({ label: "Reopen sprint", value: "reopen", icon: "refresh" });
      }
    }
    if (isSprint && onEditSprint) {
      pushDivider();
      items.push({ label: "Edit sprint", value: "edit", icon: "edit" });
    }
    if (isSprint && onExportCsv) {
      items.push({ label: "Export to CSV", value: "export-csv", icon: "download" });
    }
    if (isSprint && onDeleteSprint) {
      pushDivider();
      items.push({ label: "Delete sprint", value: "delete", icon: "trash", danger: true });
    }
    return items;
  })();
  const canManage = manageVersions?.allowed && !manageVersions?.loading;
  // Per-section pagination. Default page size is 25 top-level WPs; bump
  // by another 25 each time the user clicks "Show more". Sub-tasks under
  // an expanded parent never count against the cap so a deep tree still
  // reads as one item.
  const PAGE_SIZE = 25;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const toggleExpand = (id) =>
    setExpandedSet((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const childIndex = useMemo(() => buildChildIndex(tasks), [tasks]);
  const roots = useMemo(() => rootsOf(tasks), [tasks]);

  const dropId = sprint ? sprint.id : "backlog";
  const { setNodeRef } = useDroppable({ id: dropId });

  // Count open vs. done by API truth — `statusIsClosed` comes from
  // `/statuses[*].isClosed`, populated by the mapper.
  const doneCount = tasks.filter((t) => t.statusIsClosed).length;
  const totalPts = tasks.reduce((sum, t) => sum + weightOf(t), 0);
  const unassigned = tasks.filter((t) => !t.assignee).length;
  const allSelected = tasks.length > 0 && tasks.every((t) => selected.has(t.id));
  const someSelected = tasks.some((t) => selected.has(t.id));

  const submitAdd = () => {
    if (newTitle.trim()) {
      onCreate({ title: newTitle.trim(), sprint: sprint ? sprint.id : null });
      setNewTitle("");
    }
    setAdding(false);
  };

  // Progress for the section header sliver — done WP / total WP. Kept
  // separate from the points-based progress in the cards so the bar
  // tracks "throughput" rather than effort estimates.
  const sectionPct =
    tasks.length > 0
      ? Math.round((doneCount / tasks.length) * 100)
      : 0;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "luxe-card mb-3 overflow-x-auto transition-colors",
        isOver &&
          "border-accent outline-1 outline-dashed outline-accent -outline-offset-4",
      )}
    >
      <div className="relative flex items-center gap-2 px-3.5 py-3 bg-surface-sunken border-b border-border-soft">
        {/* Progress sliver — bottom-aligned hairline accent that fills to
            match the section's done/total ratio. Reads as a quiet
            architectural pulse on the header divider. */}
        {tasks.length > 0 && (
          <span
            aria-hidden="true"
            className="absolute left-0 bottom-0 h-px bg-accent transition-[width] duration-500"
            style={{ width: `${sectionPct}%` }}
          />
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="grid place-items-center w-6 h-6 rounded text-fg-subtle hover:bg-surface-subtle hover:text-fg cursor-pointer"
          aria-label={collapsed ? "Expand section" : "Collapse section"}
        >
          <Icon
            name="chev-down"
            size={14}
            aria-hidden="true"
            className={cn("transition-transform", collapsed && "-rotate-90")}
          />
        </button>
        <div className="flex items-baseline gap-2 min-w-0">
          <span
            className={cn(
              "font-display font-semibold text-[15px] tracking-[-0.018em] truncate",
              sprint?.status === "closed" ? "text-fg-subtle line-through" : "text-fg",
            )}
          >
            {title}
          </span>
          {isSprint && sprint?.status && <SprintStatusPill status={sprint.status} />}
          {/* Total count for the version (parents + children, every status). */}
          <span
            className="inline-flex items-center px-2 h-5 rounded-full text-[10px] font-bold bg-surface-muted text-fg-muted shrink-0"
            title={`${tasks.length} ${tasks.length === 1 ? "issue" : "issues"} in this version (incl. sub-tasks). ${roots.length} top-level shown.`}
          >
            {tasks.length}
          </span>
          <span className="text-xs text-fg-subtle truncate">{sub}</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {unassigned > 0 && (
            <span
              className="inline-flex items-center gap-1 px-2 h-5 rounded-full text-[10px] font-bold bg-tag-backend-bg text-tag-backend-fg"
              title={`${unassigned} ${unassigned === 1 ? "task is" : "tasks are"} unassigned`}
            >
              <Icon name="flag" size={10} aria-hidden="true" />
              {unassigned} unassigned
            </span>
          )}
          <span
            className="inline-flex items-center px-2 h-5 rounded-full text-[10px] font-bold bg-status-todo-bg text-status-todo-fg"
            title="Open"
          >
            {tasks.length - doneCount}
          </span>
          <span
            className="inline-flex items-center px-2 h-5 rounded-full text-[10px] font-bold bg-status-done-bg text-status-done-fg"
            title="Closed"
          >
            {doneCount}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Capacity chip — committed vs trailing-3-sprint velocity. Only
              shown for plan-eligible sprints (active / planned, not closed),
              and only when there's a velocity to compare against. The
              chip flips amber once committed > 1.1 × velocity to flag
              over-commitment without screaming about a 1-pt overage. */}
          {isSprint && sprint?.status !== "closed" && velocity != null ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10.5px] font-semibold tabular-nums",
                totalPts > Math.ceil(velocity * 1.1)
                  ? "bg-pri-medium/15 text-pri-medium"
                  : "bg-surface-muted text-fg-muted",
              )}
              title={`${totalPts} committed · trailing avg of last 3 closed sprints is ${velocity} ${estimateUnit}. Adjust if your team size changed.`}
            >
              {totalPts}
              <span className="text-fg-faint">/</span>
              <span>~{velocity}</span>
              <span className="text-fg-faint font-normal">{estimateUnit}</span>
            </span>
          ) : (
            <span className="text-xs text-fg-subtle">{totalPts} {estimateUnit}</span>
          )}
          {/* Per-section sprint controls collapse into a single small kebab.
              Page-level "Create sprint" is rendered once at the page header
              so it doesn't duplicate per section. */}
          {isSprint && canManage && sprintMenuItems.length > 0 && (
            <button
              type="button"
              onClick={(e) => setSprintMenu(e.currentTarget.getBoundingClientRect())}
              aria-label="Sprint actions"
              aria-haspopup="menu"
              className="grid place-items-center w-6 h-6 rounded text-fg-subtle hover:bg-surface-subtle hover:text-fg cursor-pointer"
            >
              <Icon name="more-h" size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      {sprintMenu && (
        <Menu
          anchorRect={sprintMenu}
          align="right"
          width={180}
          onClose={() => setSprintMenu(null)}
          onSelect={(it) => {
            if (it.value === "start") onStartSprint?.(sprint);
            else if (it.value === "complete") onCompleteSprint?.(sprint);
            else if (it.value === "edit") onEditSprint?.(sprint);
            else if (it.value === "export-csv") onExportCsv?.(sprint);
            else if (it.value === "lock") onSetVersionStatus?.(sprint, "locked");
            else if (it.value === "unlock") onSetVersionStatus?.(sprint, "open");
            else if (it.value === "reopen") onSetVersionStatus?.(sprint, "open");
            else if (it.value === "delete") onDeleteSprint?.(sprint);
          }}
          items={sprintMenuItems}
        />
      )}
      {!collapsed && (
        <>
          {tasks.length > 0 && (
            <div
              className={`${HEADER_GRID} pl-3 pr-4 py-1.5 bg-surface-elevated border-b border-border-soft text-[10px] font-semibold uppercase tracking-wider text-fg-subtle`}
            >
              <Checkbox
                checked={allSelected}
                onChange={(v) => onSelectAll?.(tasks, v)}
                label={`Select all in ${title}`}
              />
              <span />
              <span className="backlog-cell-md" />
              <span>Title</span>
              <span>Status</span>
              <span className="backlog-cell-md justify-self-center">Pri</span>
              <span className="backlog-cell-md justify-self-center">Pts</span>
              <span className="backlog-cell-md">Start</span>
              <span className="backlog-cell-md">End</span>
              <span className="backlog-cell-md">Sprint</span>
              <span className="justify-self-center">Assignee</span>
            </div>
          )}
          {tasks.length === 0 && (
            <div className="text-center py-6 px-3 text-[13px] text-fg-subtle">
              {isSprint
                ? "Drag stories from the backlog to plan this sprint."
                : "Backlog is empty."}
            </div>
          )}
          {roots.slice(0, visibleCount).map((t) => (
            <BacklogTreeRow
              key={t.id}
              task={t}
              depth={0}
              childIndex={childIndex}
              expandedSet={expandedSet}
              toggle={toggleExpand}
              selectedSet={selected}
              focusedId={focusedId}
              rowProps={{
                statuses,
                assignees,
                onSelectChange,
                onClick: onTaskClick,
                onStatusChange,
                onAssigneeChange,
                carryoverByWpId,
              }}
            />
          ))}
          <PaginationFooter
            visible={Math.min(visibleCount, roots.length)}
            total={roots.length}
            pageSize={PAGE_SIZE}
            onShowMore={() => setVisibleCount((n) => n + PAGE_SIZE)}
            onShowAll={() => setVisibleCount(roots.length)}
            onShowLess={() => setVisibleCount(PAGE_SIZE)}
          />
          {canCreate ? (
            <div className="flex items-center gap-2 px-3 py-2 border-t border-border-soft">
              {adding ? (
                <>
                  <Icon name="plus" size={14} className="text-fg-subtle" aria-hidden="true" />
                  <input
                    autoFocus
                    placeholder="What needs to be done?"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitAdd();
                      if (e.key === "Escape") {
                        setAdding(false);
                        setNewTitle("");
                      }
                    }}
                    onBlur={submitAdd}
                    className="flex-1 bg-transparent border-0 outline-none text-[13px] text-fg placeholder:text-fg-faint"
                  />
                </>
              ) : (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => setAdding(true)}
                  onKeyDown={(e) =>
                    (e.key === "Enter" || e.key === " ") && setAdding(true)
                  }
                  className="inline-flex items-center gap-1.5 px-2 h-7 rounded text-xs font-medium text-fg-subtle hover:bg-surface-subtle hover:text-fg cursor-pointer"
                >
                  <Icon name="plus" size={12} aria-hidden="true" /> Create issue
                </span>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

// Sprints are paginated below in a fixed-size window: the page lands on
// the latest `SPRINT_PAGE_SIZE` sprints, and Previous/Next walk older or
// newer pages. When the caller pins a specific sprint (e.g. URL filter
// `?sprint=<id>`), only that sprint is rendered — no pagination needed.
const SPRINT_PAGE_SIZE = 2;

// Order sprints so the freshest ones render at the top: active first
// (anything currently running), then planned (upcoming), then closed —
// each tier sorted by start date descending so "Sprint 32" beats
// "Sprint 31". Sprints without a start date sink within their tier.
function sortSprintsByRecency(list) {
  const tier = (s) => (s.state === "active" ? 0 : s.state === "planned" ? 1 : 2);
  return [...list].sort((a, b) => {
    const dt = tier(a) - tier(b);
    if (dt !== 0) return dt;
    const aStart = a.start && a.start !== "—" ? a.start : "";
    const bStart = b.start && b.start !== "—" ? b.start : "";
    if (aStart && bStart) return bStart.localeCompare(aStart);
    if (aStart) return -1;
    if (bStart) return 1;
    return 0;
  });
}

export function Backlog({
  tasks,
  statuses,
  sprints,
  assignees,
  manageVersions = { allowed: true, loading: false },
  canCreate = true,
  currentUserId,
  pinnedSprintId = null,
  onTaskClick,
  onMoveTask,
  onStatusChange,
  onAssigneeChange,
  onStartSprint,
  onCompleteSprint,
  onCreateSprint,
  onEditSprint,
  onDeleteSprint,
  onExportCsv,
  onSetVersionStatus,
  onCreate,
  onBulkMoveSprint,
  onBulkAssign,
  onBulkSetType,
  onBulkAddLabel,
  onBulkDelete,
  types = [],
  categories = [],
  velocity = null,
  estimateUnit = "pts",
  carryover,
}) {
  const [overId, setOverId] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [moveMenu, setMoveMenu] = useState(null);
  const [typeMenu, setTypeMenu] = useState(null);
  const [labelMenu, setLabelMenu] = useState(null);
  const [assignMenu, setAssignMenu] = useState(null);
  const [sprintPageIndex, setSprintPageIndex] = useState(0);
  // Keyboard-nav focused row id. j / k / arrow up/down moves focus through
  // the visible rows in DOM order; Enter opens, x toggles selection. The
  // focused row paints a softer ring than the selected highlight so the
  // two states read distinctly.
  const [focusedId, setFocusedId] = useState(null);

  const toggleSelected = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      const target = e.target;
      const tag = target?.tagName;
      const typing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable === true;
      if (typing) return;
      if (document.querySelector('[role="dialog"]')) return;
      // Open menus (status / assignee / move / etc.) own the keyboard
      // while they're up — leave them alone.
      if (moveMenu || typeMenu || labelMenu || assignMenu) return;

      if (e.key === "Escape") {
        if (selected.size > 0) {
          setSelected(new Set());
          return;
        }
        if (focusedId) setFocusedId(null);
        return;
      }

      const rows = Array.from(
        document.querySelectorAll("[data-task-id]"),
      ).filter((el) => el.offsetParent !== null);
      if (rows.length === 0) return;
      const ids = rows.map((el) => el.getAttribute("data-task-id"));
      const idx = focusedId ? ids.indexOf(focusedId) : -1;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = ids[Math.min(ids.length - 1, idx < 0 ? 0 : idx + 1)];
        if (next) setFocusedId(next);
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const next = ids[Math.max(0, idx < 0 ? 0 : idx - 1)];
        if (next) setFocusedId(next);
        return;
      }
      if (e.key === "Enter" && focusedId) {
        e.preventDefault();
        onTaskClick?.(focusedId);
        return;
      }
      if ((e.key === " " || e.key === "x") && focusedId) {
        e.preventDefault();
        toggleSelected(focusedId);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [
    focusedId,
    selected.size,
    onTaskClick,
    toggleSelected,
    moveMenu,
    typeMenu,
    labelMenu,
    assignMenu,
  ]);

  // Scroll the focused row into view whenever focus moves so j / k can
  // walk past the viewport without losing the cursor.
  useEffect(() => {
    if (!focusedId) return;
    const el = document.querySelector(`[data-task-id="${CSS.escape(focusedId)}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [focusedId]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  // Versions are API-driven; no static fallback. If the API returns no
  // sprints (yet to load, or none in the project), we render nothing here
  // and only fall through to the unscheduled-tasks empty/section below.
  const sprintList = useMemo(
    () => sortSprintsByRecency(Array.isArray(sprints) ? sprints : []),
    [sprints],
  );
  // When the caller pins a sprint (filter on URL), we render only that
  // sprint and skip pagination. Otherwise we render a fixed-size window
  // of the sorted list, starting from the latest.
  const pinnedSprint = useMemo(
    () =>
      pinnedSprintId
        ? sprintList.find((s) => s.id === pinnedSprintId) || null
        : null,
    [pinnedSprintId, sprintList],
  );
  const sprintPageCount = Math.max(
    1,
    Math.ceil(sprintList.length / SPRINT_PAGE_SIZE),
  );
  const safeSprintPage = Math.min(sprintPageIndex, sprintPageCount - 1);
  const visibleSprints = useMemo(() => {
    if (pinnedSprint) return [pinnedSprint];
    const start = safeSprintPage * SPRINT_PAGE_SIZE;
    return sprintList.slice(start, start + SPRINT_PAGE_SIZE);
  }, [pinnedSprint, sprintList, safeSprintPage]);
  // Single pass over tasks: bucket by sprint id (or "" for unscheduled) so
  // the per-sprint render below is O(tasks) instead of O(sprints × tasks).
  const tasksBySprint = useMemo(() => {
    const m = new Map();
    for (const t of tasks) {
      const k = t.sprint || "";
      const arr = m.get(k);
      if (arr) arr.push(t);
      else m.set(k, [t]);
    }
    return m;
  }, [tasks]);
  const unscheduled = tasksBySprint.get("") || [];

  const onSelectChange = (id, v) =>
    setSelected((s) => {
      const n = new Set(s);
      if (v) n.add(id);
      else n.delete(id);
      return n;
    });
  const onSelectAll = (taskList, v) =>
    setSelected((s) => {
      const n = new Set(s);
      for (const t of taskList) {
        if (v) n.add(t.id);
        else n.delete(t.id);
      }
      return n;
    });
  const clearSelection = () => setSelected(new Set());

  const totalUnassigned = useMemo(
    () => tasks.filter((t) => !t.assignee).length,
    [tasks],
  );

  if (sprintList.length === 0 && tasks.length === 0) {
    return (
      <div className="py-10">
        <EmptyState
          title="No sprints yet"
          body="Create a sprint to plan upcoming work, or just start adding work packages — they'll appear in the backlog."
          action={
            manageVersions.allowed
              ? { label: "Create sprint", onClick: () => onCreateSprint?.() }
              : null
          }
        />
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragOver={(e) => setOverId(e.over?.id ?? null)}
      onDragEnd={(e) => {
        if (e.over && e.active) {
          const moved = tasks.find((t) => t.id === e.active.id);
          if (moved && moved.permissions?.update === false) {
            toast.error("You don't have permission to change this issue.");
          } else {
            const sprintId = e.over.id === "backlog" ? null : e.over.id;
            onMoveTask(e.active.id, sprintId);
          }
        }
        setOverId(null);
      }}
      onDragCancel={() => setOverId(null)}
    >
      <div className="px-2 py-2 pb-20">
        {totalUnassigned > 0 && (
          <div className="mx-1 mb-3 flex items-center gap-2 px-3 py-2 rounded-lg border border-tag-backend-bg bg-tag-backend-bg/40 text-[12px] text-tag-backend-fg">
            <Icon name="flag" size={12} aria-hidden="true" />
            <b>{totalUnassigned}</b>
            <span>
              {totalUnassigned === 1 ? "task is" : "tasks are"} unassigned across this project.
            </span>
          </div>
        )}

        {visibleSprints.map((sp) => {
          const sTasks = tasksBySprint.get(sp.id) || [];
          const hasDates =
            sp.start && sp.start !== "—" && sp.end && sp.end !== "—";
          const dateRange = hasDates ? `${sp.start} – ${sp.end}` : "No dates set";
          const sub =
            sp.state === "active" && sp.days != null && sp.dayIn != null
              ? `${dateRange}  •  Day ${sp.dayIn} of ${sp.days}`
              : dateRange;
          return (
            <BacklogSection
              key={sp.id}
              title={sp.name}
              sub={sub}
              tasks={sTasks}
              sprint={sp}
              isSprint
              isOver={overId === sp.id}
              statuses={statuses}
              assignees={assignees}
              manageVersions={manageVersions}
              canCreate={canCreate}
              velocity={velocity}
              estimateUnit={estimateUnit}
              focusedId={focusedId}
              selected={selected}
              onSelectChange={onSelectChange}
              onSelectAll={onSelectAll}
              onTaskClick={onTaskClick}
              onStatusChange={onStatusChange}
              onAssigneeChange={onAssigneeChange}
              onStartSprint={onStartSprint}
              onCompleteSprint={onCompleteSprint}
              onCreateSprint={onCreateSprint}
              onEditSprint={onEditSprint}
              onDeleteSprint={onDeleteSprint}
              onExportCsv={onExportCsv}
              onSetVersionStatus={onSetVersionStatus}
              onCreate={onCreate}
              carryoverByWpId={carryover?.byWpId}
            />
          );
        })}

        {!pinnedSprint && sprintList.length > SPRINT_PAGE_SIZE && (() => {
          const total = sprintList.length;
          const start = safeSprintPage * SPRINT_PAGE_SIZE;
          const end = Math.min(start + SPRINT_PAGE_SIZE, total);
          const canPrev = safeSprintPage > 0;
          const canNext = end < total;
          return (
            <div className="mx-1 mt-1 mb-3 flex items-center justify-between gap-2 px-3 sm:px-5 py-2 rounded-lg border border-border-soft bg-surface-sunken">
              <span className="text-[12px] text-fg-subtle">
                Showing {start + 1}–{end} of {total} sprints
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={!canPrev}
                  onClick={() => setSprintPageIndex((p) => Math.max(0, p - 1))}
                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-border bg-surface-elevated text-[12px] font-medium text-fg hover:bg-surface-subtle hover:border-border-strong cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Icon name="chev-left" size={11} aria-hidden="true" />
                  Previous
                </button>
                <button
                  type="button"
                  disabled={!canNext}
                  onClick={() =>
                    setSprintPageIndex((p) =>
                      Math.min(sprintPageCount - 1, p + 1),
                    )
                  }
                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-border bg-surface-elevated text-[12px] font-medium text-fg hover:bg-surface-subtle hover:border-border-strong cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                  <Icon name="chev-right" size={11} aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })()}

        {!pinnedSprint && unscheduled.length > 0 && (
        <BacklogSection
          title="Without sprint"
          sub={`${unscheduled.length} ${unscheduled.length === 1 ? "issue" : "issues"} not assigned to any version`}
          tasks={unscheduled}
          sprint={null}
          isSprint={false}
          isOver={overId === "backlog"}
          statuses={statuses}
          assignees={assignees}
          manageVersions={manageVersions}
          canCreate={canCreate}
          selected={selected}
          estimateUnit={estimateUnit}
          focusedId={focusedId}
          onSelectChange={onSelectChange}
          onSelectAll={onSelectAll}
          onTaskClick={onTaskClick}
          onStatusChange={onStatusChange}
          onAssigneeChange={onAssigneeChange}
          onCreateSprint={onCreateSprint}
          onCreate={onCreate}
          carryoverByWpId={carryover?.byWpId}
        />
        )}
      </div>

      {/* Bulk action bar — glass surface so it floats over the rows
          without obscuring the work behind it. */}
      {selected.size > 0 && (
        <div className="glass fixed left-1/2 -translate-x-1/2 bottom-6 z-100 flex items-center gap-2 flex-wrap justify-center px-4 py-2 rounded-xl text-fg shadow-lg animate-slide-up max-w-[calc(100vw-32px)]">
          <span className="text-[13px] font-semibold">{selected.size} selected</span>
          <span className="w-px h-5 bg-border" />
          <button
            type="button"
            onClick={(e) =>
              setMoveMenu(e.currentTarget.getBoundingClientRect())
            }
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[13px] font-medium hover:bg-surface-subtle cursor-pointer"
          >
            <Icon name="sprint" size={13} aria-hidden="true" />
            Move to…
          </button>
          <button
            type="button"
            onClick={(e) =>
              setAssignMenu(e.currentTarget.getBoundingClientRect())
            }
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[13px] font-medium hover:bg-surface-subtle cursor-pointer"
          >
            <Icon name="people" size={13} aria-hidden="true" />
            Assign…
          </button>
          {onBulkSetType && types.length > 0 && (
            <button
              type="button"
              onClick={(e) =>
                setTypeMenu(e.currentTarget.getBoundingClientRect())
              }
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[13px] font-medium hover:bg-surface-subtle cursor-pointer"
            >
              <Icon name="epic" size={13} aria-hidden="true" />
              Type…
            </button>
          )}
          {onBulkAddLabel && categories.length > 0 && (
            <button
              type="button"
              onClick={(e) =>
                setLabelMenu(e.currentTarget.getBoundingClientRect())
              }
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[13px] font-medium hover:bg-surface-subtle cursor-pointer"
            >
              <Icon name="tag" size={13} aria-hidden="true" />
              Label…
            </button>
          )}
          {currentUserId && (
            <button
              type="button"
              onClick={() => {
                onBulkAssign?.([...selected], currentUserId);
                clearSelection();
              }}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[13px] font-medium hover:bg-surface-subtle cursor-pointer"
            >
              Assign to me
            </button>
          )}
          {onBulkDelete && (
            <>
              <span className="w-px h-5 bg-border" />
              <button
                type="button"
                onClick={() => {
                  const ids = [...selected];
                  onBulkDelete(ids, () => clearSelection());
                }}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[13px] font-medium text-red-200 hover:bg-red-500/30 hover:text-white cursor-pointer"
                title="Delete selected work packages"
              >
                <Icon name="trash" size={13} aria-hidden="true" />
                Delete
              </button>
            </>
          )}
          <button
            type="button"
            onClick={clearSelection}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[13px] font-medium hover:bg-surface-subtle cursor-pointer"
            title="Clear selection"
          >
            <Icon name="x" size={13} aria-hidden="true" />
          </button>
          {moveMenu && (
            <Menu
              anchorRect={moveMenu}
              onClose={() => setMoveMenu(null)}
              onSelect={(it) => {
                onBulkMoveSprint?.([...selected], it.value);
                clearSelection();
              }}
              items={[
                { label: "Backlog", value: null, icon: "backlog" },
                { divider: true },
                ...sprintList.map((s) => ({
                  label:
                    s.name?.split(" — ")[0] +
                    (s.state === "active" ? " (active)" : ""),
                  value: s.id,
                })),
              ]}
            />
          )}
          {assignMenu && (
            <Menu
              anchorRect={assignMenu}
              onClose={() => setAssignMenu(null)}
              onSelect={(it) => {
                onBulkAssign?.([...selected], it.value);
                clearSelection();
              }}
              searchable
              searchPlaceholder="Search people…"
              width={240}
              items={[
                { label: "Unassigned", value: null },
                { divider: true },
                ...(Array.isArray(assignees) ? assignees : []).map((p) => ({
                  label: p.name,
                  value: p.id,
                  avatar: p,
                })),
              ]}
            />
          )}
          {typeMenu && (
            <Menu
              anchorRect={typeMenu}
              onClose={() => setTypeMenu(null)}
              onSelect={(it) => {
                onBulkSetType?.([...selected], it.value);
                clearSelection();
              }}
              width={200}
              items={types.map((t) => ({
                label: t.name,
                value: t.id,
                icon: "epic",
              }))}
            />
          )}
          {labelMenu && (
            <Menu
              anchorRect={labelMenu}
              onClose={() => setLabelMenu(null)}
              onSelect={(it) => {
                if (!it.value) return;
                onBulkAddLabel?.([...selected], it.value);
                clearSelection();
              }}
              width={220}
              items={
                categories.length > 0
                  ? categories.map((c) => ({
                      label: c.name,
                      value: c.name,
                      icon: "tag",
                    }))
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
        </div>
      )}
    </DndContext>
  );
}
