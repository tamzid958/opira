"use client";

import { useCallback, useImperativeHandle, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { TaskStatusPill } from "@/components/ui/task-meta";
import { Menu } from "@/components/ui/menu";
import { Icon, TypeIcon } from "@/components/icons";
import { useUpdateTask } from "@/lib/hooks/use-openproject";
import { buildChildIndex as buildSliceChildIndex } from "@/lib/openproject/hierarchy";
import { assigneeMenuItems, statusMenuItems } from "@/lib/openproject/menu-items";
import { weightOf } from "@/lib/openproject/estimate";
import { ratioOf } from "@/lib/openproject/task-state";
import { cn, findById } from "@/lib/utils";
import { ParentPicker } from "@/components/ui/parent-picker";

const buildChildIndex = (allTasks) =>
  buildSliceChildIndex(allTasks, { filterToSlice: false });

function SubtaskRow({
  task,
  depth,
  childIndex,
  statuses,
  assignees,
  sprints,
  projectId,
  onChange,
  onTaskClick,
}) {
  const updateTask = useUpdateTask(projectId);
  const children = childIndex.get(String(task.nativeId)) || [];
  const hasChildren = children.length > 0;
  const [expanded, setExpanded] = useState(false);
  const [statusMenu, setStatusMenu] = useState(null);
  const [assignMenu, setAssignMenu] = useState(null);
  const [sprintMenu, setSprintMenu] = useState(null);

  const isDone = !!task.statusIsClosed;
  const editable = task.permissions?.update !== false;
  const sprintList = Array.isArray(sprints) ? sprints : [];
  const taskSprintLabel = (() => {
    if (!task.sprint) return null;
    const sp = findById(sprintList, task.sprint);
    return sp?.name?.split(" — ")[0] || task.sprintName || "Sprint";
  })();

  const updateSub = (patch) => {
    updateTask.mutate({ id: task.id, patch });
  };

  return (
    <>
      <div
        className="grid grid-cols-[16px_18px_100px_minmax(0,1fr)_100px_minmax(80px,140px)_28px_28px] gap-2 items-center -mx-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-surface-subtle transition-colors"
        style={{ paddingLeft: 8 + depth * 20 }}
      >
        <span
          onClick={(e) => {
            if (!hasChildren) return;
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          aria-label={
            hasChildren ? (expanded ? "Collapse sub-tasks" : "Expand sub-tasks") : undefined
          }
          className={`grid place-items-center text-fg-subtle ${
            hasChildren ? "cursor-pointer" : "invisible"
          }`}
        >
          <Icon name={expanded ? "chev-down" : "chev-right"} size={12} aria-hidden="true" />
        </span>

        <span className="grid place-items-center" title={task.typeName || "Task"}>
          <TypeIcon name={task.typeName} color={task.typeColor} size={13} />
        </span>

        <span className="font-mono text-[11px] text-fg-subtle truncate">{task.key}</span>

        <span
          onClick={() => onTaskClick?.(task.id)}
          title={task.title}
          className={cn(
            "text-[13px] truncate",
            isDone ? "text-fg-subtle line-through" : "text-fg",
            onTaskClick ? "cursor-pointer" : "cursor-default",
          )}
        >
          {task.title}
        </span>

        <span
          onClick={(e) => {
            if (!editable) return;
            e.stopPropagation();
            setStatusMenu(e.currentTarget.getBoundingClientRect());
          }}
          className={editable ? "cursor-pointer" : "cursor-default"}
          aria-disabled={!editable || undefined}
        >
          <TaskStatusPill task={task} />
        </span>

        <span
          onClick={(e) => {
            if (!editable) return;
            e.stopPropagation();
            setSprintMenu(e.currentTarget.getBoundingClientRect());
          }}
          title={
            !editable
              ? "You don't have permission to change sprint"
              : taskSprintLabel || "Assign to sprint"
          }
          className={cn(
            "inline-flex items-center gap-1 px-2 h-6 rounded-md text-[11.5px] truncate min-w-0",
            editable ? "cursor-pointer" : "cursor-default",
            task.sprint
              ? "bg-accent-50 text-accent-700 hover:bg-accent-100"
              : "text-fg-faint border border-dashed border-border hover:border-border-strong hover:text-fg-subtle",
          )}
          aria-disabled={!editable || undefined}
        >
          <Icon name="sprint" size={11} aria-hidden="true" />
          <span className="truncate">{taskSprintLabel || "Backlog"}</span>
        </span>

        <span
          onClick={(e) => {
            if (!editable) return;
            e.stopPropagation();
            setAssignMenu(e.currentTarget.getBoundingClientRect());
          }}
          className={`${editable ? "cursor-pointer" : "cursor-default"} justify-self-center`}
          aria-disabled={!editable || undefined}
        >
          <Avatar
            user={
              (Array.isArray(assignees) ? assignees : []).find(
                (u) => String(u.id) === String(task.assignee),
              ) ||
              (task.assignee
                ? { id: task.assignee, name: task.assigneeName || "Assignee" }
                : null)
            }
            size="sm"
          />
        </span>

        <span
          onClick={() => onTaskClick?.(task.id)}
          aria-label={onTaskClick ? "Open work package" : undefined}
          className={`flex justify-end text-fg-faint ${
            onTaskClick ? "cursor-pointer" : "cursor-default"
          }`}
        >
          <Icon name="chev-right" size={12} aria-hidden="true" />
        </span>
      </div>

      {statusMenu && (
        <Menu
          anchorRect={statusMenu}
          onClose={() => setStatusMenu(null)}
          onSelect={(it) => {
            const target = findById(statuses, it.value);
            updateSub(
              target
                ? { statusId: target.id, statusName: target.name }
                : { statusId: it.value },
            );
            onChange?.("Sub-task status updated");
          }}
          items={statusMenuItems(statuses, task.statusId)}
        />
      )}
      {assignMenu && (
        <Menu
          anchorRect={assignMenu}
          onClose={() => setAssignMenu(null)}
          onSelect={(it) => {
            updateSub({ assignee: it.value });
            onChange?.("Sub-task assignee updated");
          }}
          items={assigneeMenuItems(task.assignee, assignees)}
          searchable
          searchPlaceholder="Search people…"
          width={240}
        />
      )}
      {sprintMenu && (
        <Menu
          anchorRect={sprintMenu}
          onClose={() => setSprintMenu(null)}
          onSelect={(it) => {
            updateSub({ sprint: it.value });
            const target = findById(sprintList, it.value);
            onChange?.(
              it.value
                ? `Moved to ${target?.name?.split(" — ")[0] || "sprint"}`
                : "Moved to backlog",
            );
          }}
          searchable
          searchPlaceholder="Search sprints…"
          width={240}
          items={[
            { label: "Backlog (no sprint)", value: null, active: !task.sprint },
            { divider: true },
            ...sprintList.map((s) => ({
              label:
                (s.name?.split(" — ")[0] || s.name || "Sprint") +
                (s.state === "active"
                  ? " (active)"
                  : s.status === "closed"
                  ? " (closed)"
                  : ""),
              value: s.id,
              active: String(s.id) === String(task.sprint),
            })),
          ]}
        />
      )}

      {expanded &&
        children.map((c) => (
          <SubtaskRow
            key={c.id}
            task={c}
            depth={depth + 1}
            childIndex={childIndex}
            statuses={statuses}
            assignees={assignees}
            sprints={sprints}
            projectId={projectId}
            onChange={onChange}
            onTaskClick={onTaskClick}
          />
        ))}
    </>
  );
}

const PAGE_SIZE = 10;

function BulkBarButton({ icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl hover:bg-surface-subtle cursor-pointer transition-colors group"
    >
      <Icon name={icon} size={14} aria-hidden="true" className="text-fg/70 group-hover:text-fg transition-colors" />
      <span className="text-[10px] font-medium leading-none text-fg/50 group-hover:text-fg/80 transition-colors">{label}</span>
    </button>
  );
}

export function SubtaskBreakdown({
  parent,
  projectId,
  statuses = [],
  assignees = [],
  sprints = [],
  types = [],
  canCreate = true,
  currentUserId,
  onChange,
  onTaskClick,
  allTasks = [],
  onBulkMoveSprint,
  onBulkAssign,
  onBulkSetType,
  onBulkSetParent,
  onBulkDelete,
  onOpenCreate,
  ref,
}) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkMoveMenu, setBulkMoveMenu] = useState(null);
  const [bulkAssignMenu, setBulkAssignMenu] = useState(null);
  const [bulkTypeMenu, setBulkTypeMenu] = useState(null);
  const [bulkParentAnchor, setBulkParentAnchor] = useState(null);

  const clearSelection = useCallback(() => setSelected(new Set()), []);
  const toggleSelected = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openCreate = useCallback(() => onOpenCreate?.(parent), [onOpenCreate, parent]);

  useImperativeHandle(ref, () => ({
    startAdd: openCreate,
  }));

  const childIndex = buildChildIndex(allTasks);
  const directChildren = childIndex.get(String(parent.nativeId)) || [];

  const totalPages = Math.max(1, Math.ceil(directChildren.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageChildren = directChildren.slice(pageStart, pageStart + PAGE_SIZE);
  const showPager = directChildren.length > PAGE_SIZE;

  const subtree = (() => {
    const out = [];
    const walk = (id) => {
      const list = childIndex.get(String(id)) || [];
      for (const t of list) {
        out.push(t);
        walk(t.nativeId);
      }
    };
    walk(parent.nativeId);
    return out;
  })();

  const totalCount = subtree.length;
  const doneCount = subtree.reduce((s, t) => s + ratioOf(t), 0);
  const totalPts = subtree.reduce((s, t) => s + weightOf(t), 0);
  const donePts = subtree.reduce((s, t) => s + weightOf(t) * ratioOf(t), 0);

  return (
    <section>
      <header className="flex items-center justify-between gap-2 mb-2">
        <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-fg">
          Sub-tasks
          {totalCount > 0 && (
            <span className="text-fg-subtle font-medium text-xs">
              {Math.round(doneCount)}/{totalCount} · {Math.round(donePts)}/{Math.round(totalPts)} pts
            </span>
          )}
        </span>
        {canCreate ? (
          <button
            type="button"
            onClick={openCreate}
            aria-label="Add sub-task"
            className="inline-flex items-center gap-1.5 h-6.5 px-2.5 rounded-md text-xs font-medium text-fg-muted hover:bg-surface-subtle hover:text-fg cursor-pointer"
          >
            <Icon name="plus" size={12} aria-hidden="true" /> Add sub-task
          </button>
        ) : null}
      </header>

      {totalCount > 0 && (
        <div className="h-1 bg-surface-muted rounded-full overflow-hidden mb-2.5">
          <div
            className="h-full bg-status-done rounded-full transition-[width] duration-300"
            style={{ width: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%` }}
          />
        </div>
      )}

      <div className="flex flex-col gap-px mt-1">
        {pageChildren.map((c) => (
          <div key={c.id} className="flex items-start gap-1.5">
            {directChildren.length > 1 && (
              <span
                role="checkbox"
                aria-checked={selected.has(c.id)}
                aria-label={`Select ${c.title}`}
                onClick={(e) => { e.stopPropagation(); toggleSelected(c.id); }}
                className={cn(
                  "mt-[13px] w-4 h-4 rounded flex-shrink-0 grid place-items-center border cursor-pointer transition-colors",
                  selected.has(c.id)
                    ? "bg-accent border-accent text-white"
                    : "border-border hover:border-accent",
                )}
              >
                {selected.has(c.id) && <Icon name="check" size={9} aria-hidden="true" />}
              </span>
            )}
            <div className="flex-1 min-w-0">
              <SubtaskRow
                task={c}
                depth={0}
                childIndex={childIndex}
                statuses={statuses}
                assignees={assignees}
                sprints={sprints}
                projectId={projectId}
                onChange={onChange}
                onTaskClick={onTaskClick}
              />
            </div>
          </div>
        ))}
      </div>

      {showPager && (
        <div className="flex items-center justify-between gap-2 mt-2 text-[11.5px] text-fg-subtle">
          <span>
            {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, directChildren.length)} of{" "}
            {directChildren.length}
          </span>
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              aria-label="Previous page"
              className="inline-flex items-center justify-center w-6 h-6 rounded-md text-fg-muted hover:bg-surface-subtle hover:text-fg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Icon name="chev-left" size={12} aria-hidden="true" />
            </button>
            <span className="px-1.5 tabular-nums">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              aria-label="Next page"
              className="inline-flex items-center justify-center w-6 h-6 rounded-md text-fg-muted hover:bg-surface-subtle hover:text-fg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Icon name="chev-right" size={12} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {directChildren.length === 0 && (
        <div className="text-center py-4 px-4 text-[13px] text-fg-subtle border border-dashed border-border rounded-lg mt-1">
          No sub-tasks yet. Break this down to track progress and split work across the team.
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="glass fixed left-1/2 -translate-x-1/2 bottom-6 z-100 flex items-center gap-1 px-2 py-1.5 rounded-2xl text-fg shadow-xl animate-slide-up border border-border/60 max-w-[calc(100vw-32px)]">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-accent/15 mr-1">
            <span className="text-[12px] font-bold tabular-nums text-accent">{selected.size}</span>
            <span className="text-[11px] text-fg/50 font-medium">selected</span>
          </div>

          {onBulkMoveSprint && (
            <BulkBarButton
              icon="sprint"
              label="Sprint"
              onClick={(e) => setBulkMoveMenu(e.currentTarget.getBoundingClientRect())}
            />
          )}
          {onBulkAssign && (
            <BulkBarButton
              icon="people"
              label="Assignee"
              onClick={(e) => setBulkAssignMenu(e.currentTarget.getBoundingClientRect())}
            />
          )}
          {onBulkSetParent && (
            <BulkBarButton
              icon="link"
              label="Parent"
              onClick={(e) => setBulkParentAnchor(e.currentTarget.getBoundingClientRect())}
            />
          )}
          {onBulkSetType && types.length > 0 && (
            <BulkBarButton
              icon="epic"
              label="Type"
              onClick={(e) => setBulkTypeMenu(e.currentTarget.getBoundingClientRect())}
            />
          )}
          {currentUserId && onBulkAssign && (
            <BulkBarButton
              icon="check"
              label="Assign me"
              onClick={() => {
                onBulkAssign([...selected], currentUserId);
                clearSelection();
              }}
            />
          )}
          {onBulkDelete && (
            <>
              <span className="w-px h-5 bg-border/60 mx-0.5" />
              <button
                type="button"
                onClick={() => {
                  onBulkDelete([...selected], clearSelection);
                }}
                className="inline-flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl text-red-400 hover:bg-red-500/15 hover:text-red-300 cursor-pointer transition-colors"
                title="Delete selected"
              >
                <Icon name="trash" size={14} aria-hidden="true" />
                <span className="text-[10px] font-medium leading-none">Delete</span>
              </button>
            </>
          )}

          <span className="w-px h-5 bg-border/60 mx-0.5" />
          <button
            type="button"
            onClick={clearSelection}
            className="inline-flex items-center justify-center w-7 h-7 rounded-xl text-fg/40 hover:bg-surface-subtle hover:text-fg cursor-pointer transition-colors"
            title="Clear selection"
          >
            <Icon name="x" size={13} aria-hidden="true" />
          </button>

          {bulkMoveMenu && (
            <Menu
              anchorRect={bulkMoveMenu}
              onClose={() => setBulkMoveMenu(null)}
              onSelect={(it) => {
                onBulkMoveSprint?.([...selected], it.value);
                clearSelection();
              }}
              items={[
                { label: "Without sprint", value: null, icon: "backlog" },
                { divider: true },
                ...(Array.isArray(sprints) ? sprints : []).map((s) => ({
                  label:
                    (s.name?.split(" — ")[0] || s.name || "Sprint") +
                    (s.state === "active" ? " (active)" : ""),
                  value: s.id,
                })),
              ]}
            />
          )}
          {bulkAssignMenu && (
            <Menu
              anchorRect={bulkAssignMenu}
              onClose={() => setBulkAssignMenu(null)}
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
          {bulkTypeMenu && (
            <Menu
              anchorRect={bulkTypeMenu}
              onClose={() => setBulkTypeMenu(null)}
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
          {bulkParentAnchor && onBulkSetParent && (
            <ParentPicker
              projectId={projectId}
              value={null}
              valueName={null}
              initialAnchorRect={bulkParentAnchor}
              onChange={(id, name) => {
                if (id) {
                  onBulkSetParent([...selected], id, name);
                  clearSelection();
                }
                setBulkParentAnchor(null);
              }}
              triggerClassName="sr-only"
            >
              {() => null}
            </ParentPicker>
          )}
        </div>
      )}
    </section>
  );
}
