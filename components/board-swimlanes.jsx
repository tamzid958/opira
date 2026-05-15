"use client";

import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import {
  TaskPriorityIcon,
  TaskStatusPill,
  TaskTypeIcon,
} from "@/components/ui/task-meta";
import { TagPill } from "@/components/ui/tag-pill";
import { Menu } from "@/components/ui/menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icons";
import { formatEstimate } from "@/lib/openproject/estimate";
import { cn, findById } from "@/lib/utils";
import {
  buildChildIndex,
  rootsOf,
  collectDescendantTasks as collectAllDescendants,
} from "@/lib/openproject/hierarchy";
import { statusMenuItems } from "@/lib/openproject/menu-items";

// ─────────────────────────────────────────────────────────────────
// SectionHeader — the parent row at the top of every group. For
// real parents: chevron + type + key + status pill + title +
// trailing meta (count, assignee, points). For the orphan group:
// just label + count.

function SectionHeader({
  parent,
  count,
  collapsed,
  onToggleCollapse,
  onClickParent,
  fallbackLabel,
  assignees,
  estimateMode = "numeric",
}) {
  const parentAssignee = parent?.assignee
    ? findById(assignees, parent.assignee) || {
        id: parent.assignee,
        name: parent.assigneeName || "Assignee",
      }
    : null;

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 bg-surface-sunken border-b border-border-soft"
    >
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={collapsed ? "Expand group" : "Collapse group"}
        className="grid place-items-center w-5 h-5 rounded text-fg-subtle hover:bg-surface-subtle hover:text-fg cursor-pointer shrink-0"
      >
        <Icon
          name={collapsed ? "chev-right" : "chev-down"}
          size={12}
          aria-hidden="true"
        />
      </button>
      {parent ? (
        <>
          <TaskTypeIcon task={parent} size={14} />
          <button
            type="button"
            onClick={onClickParent}
            className="font-mono text-[11.5px] text-fg-muted shrink-0 hover:text-fg cursor-pointer"
            title="Open parent task"
          >
            {parent.key}
          </button>
          <TaskStatusPill task={parent} />
          <button
            type="button"
            onClick={onClickParent}
            className="flex-1 min-w-0 truncate text-left text-[13.5px] font-display font-semibold tracking-[-0.014em] text-fg hover:underline cursor-pointer"
            title={parent.title}
          >
            {parent.title}
          </button>
          <div className="flex items-center gap-3 shrink-0 text-[11.5px] text-fg-subtle">
            <span>
              {count} {count === 1 ? "sub-task" : "sub-tasks"}
            </span>
            {formatEstimate(parent, { mode: estimateMode }) != null && (
              <span
                className="hidden sm:inline tabular-nums"
                title={
                  parent.points != null &&
                  String(parent.points) !== formatEstimate(parent, { mode: estimateMode })
                    ? `${parent.points} story points`
                    : undefined
                }
              >
                {formatEstimate(parent, { mode: estimateMode })}
              </span>
            )}
            <Avatar user={parentAssignee} size="sm" />
          </div>
        </>
      ) : (
        <>
          <span className="text-[13.5px] font-display font-semibold tracking-[-0.014em] text-fg shrink-0">
            {fallbackLabel || "Other Issues"}
          </span>
          <span className="text-[11.5px] text-fg-subtle shrink-0">
            {count} {count === 1 ? "issue" : "issues"}
          </span>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Card — full kanban-style card. Click status pill to change
// status; click anywhere else to open the detail modal. Same
// `luxe-card` chrome as the rest of the app.

function Card({
  task,
  assignees,
  statuses,
  isDragging,
  dragRef,
  attributes,
  listeners,
  onClick,
  onStatusChange,
  recentlyUpdated = false,
  fadedByOverlay = false,
  estimateMode = "numeric",
}) {
  const assignee =
    findById(assignees, task.assignee) ||
    (task.assignee ? { id: task.assignee, name: task.assigneeName || "Assignee" } : null);
  const editable = task.permissions?.update !== false;
  const [statusMenu, setStatusMenu] = useState(null);

  return (
    <div
      ref={dragRef}
      {...attributes}
      {...listeners}
      onClick={() => onClick?.(task.id)}
      className={cn(
        "luxe-card group rounded-md px-3 pt-2.5 pb-2.5 select-none cursor-grab transition-opacity relative",
        // Stretch to the grid row's full height so every card in a
        // section ends at the same y, with the meta row pinned to
        // the bottom regardless of how many lines the title takes.
        "h-full flex flex-col gap-2 min-h-27.5",
        isDragging && "opacity-50 cursor-grabbing rotate-1",
        task.statusIsClosed && "opacity-70",
        recentlyUpdated && "ring-2 ring-accent-200 bg-accent-50/30",
        fadedByOverlay && !recentlyUpdated && "opacity-40",
      )}
    >
      {recentlyUpdated && (
        <span
          className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-accent ring-2 ring-surface-elevated"
          aria-label="Updated since last visit"
          title="Updated since last visit"
        />
      )}
      <div
        className="text-[13px] font-medium text-fg leading-snug line-clamp-2 wrap-break-word"
        title={task.title}
      >
        {task.title}
      </div>
      {task.labels && task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {task.labels.slice(0, 3).map((l) => (
            <TagPill key={l} name={l} size="xs" />
          ))}
          {task.labels.length > 3 && (
            <span className="text-[10px] text-fg-subtle font-medium">
              +{task.labels.length - 3}
            </span>
          )}
        </div>
      )}
      {/* Meta row — pinned to the bottom of the card via `mt-auto`
          + the parent's `flex flex-col`. Border-top keeps it
          visually separated from the title block above. */}
      <div className="mt-auto pt-2 flex items-center gap-2 text-[11px] text-fg-subtle border-t border-border-soft">
        <TaskTypeIcon task={task} size={12} />
        <span
          className={cn(
            "font-mono shrink-0",
            task.statusIsClosed && "line-through",
          )}
        >
          {task.key}
        </span>
        <span
          onClick={(e) => {
            if (!editable) return;
            e.stopPropagation();
            setStatusMenu(e.currentTarget.getBoundingClientRect());
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "shrink min-w-0",
            editable ? "cursor-pointer" : "cursor-default",
          )}
          title={task.statusName}
        >
          <TaskStatusPill task={task} />
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 shrink-0">
          <TaskPriorityIcon task={task} size={12} />
          {formatEstimate(task, { mode: estimateMode }) != null && (
            <span
              className="px-1.5 py-px rounded-full bg-surface-muted text-[10.5px] font-medium text-fg-muted tabular-nums"
              title={
                task.points != null &&
                String(task.points) !== formatEstimate(task, { mode: estimateMode })
                  ? `${task.points} story points`
                  : undefined
              }
            >
              {formatEstimate(task, { mode: estimateMode })}
            </span>
          )}
          <Avatar user={assignee} size="sm" />
        </span>
      </div>

      {statusMenu && (
        <Menu
          anchorRect={statusMenu}
          onClose={() => setStatusMenu(null)}
          onSelect={(it) => onStatusChange?.(task.id, it.value)}
          items={statusMenuItems(statuses, task.statusId)}
        />
      )}
    </div>
  );
}

function DraggableCard({
  task,
  assignees,
  statuses,
  onClick,
  onStatusChange,
  recentlyUpdated,
  fadedByOverlay,
  estimateMode = "numeric",
}) {
  const editable = task.permissions?.update !== false;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled: !editable,
  });
  return (
    <Card
      task={task}
      assignees={assignees}
      statuses={statuses}
      isDragging={isDragging}
      dragRef={setNodeRef}
      attributes={attributes}
      listeners={editable ? listeners : undefined}
      onClick={onClick}
      onStatusChange={onStatusChange}
      recentlyUpdated={recentlyUpdated}
      fadedByOverlay={fadedByOverlay}
      estimateMode={estimateMode}
    />
  );
}

// ─────────────────────────────────────────────────────────────────
// Section — one group: header row + a responsive card grid below.
// The whole section (including the empty-state when collapsed-but-
// dropped-on, or just the body when expanded) is a single drop zone
// keyed `parent:<nativeId>` so dragging a card anywhere inside
// re-parents it under that header.

function Section({
  parentId,
  isOver,
  children,
}) {
  const dropId = parentId == null ? "parent:none" : `parent:${parentId}`;
  const { setNodeRef } = useDroppable({ id: dropId });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "luxe-card overflow-hidden transition-colors",
        isOver && "outline-2 outline-accent -outline-offset-2",
      )}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main

export function BoardSwimlanes({
  tasks = [],
  statuses = [],
  assignees = [],
  onTaskClick,
  onMoveTask,
  onUpdate,
  updatedSince = null,
  estimateMode = "numeric",
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const sinceMs = updatedSince ? new Date(updatedSince).getTime() : null;
  const isRecent = (task) =>
    sinceMs != null &&
    task.updatedAt &&
    new Date(task.updatedAt).getTime() >= sinceMs;

  // Build the parent → children index, then split tasks into
  // groups. Each section shows ONLY direct children (one level
  // deep), so every parent that has at least one direct child
  // becomes its own section — including nested parents like a
  // Story sitting under an Epic. The walk emits sections in tree
  // order (root first, then its descendants) so the visual order
  // mirrors the hierarchy. Anything that's neither a section
  // header nor a card in some section's body collects into a
  // trailing "Other Issues" section.
  const childIndex = buildChildIndex(tasks, { sort: false });

  const { groups, otherCards } = (() => {
    const result = [];
    const seenHeader = new Set();

    const walk = (task) => {
      if (seenHeader.has(task.id)) return;
      const direct = childIndex.get(String(task.nativeId)) || [];
      if (direct.length === 0) return;
      seenHeader.add(task.id);
      result.push({ key: task.id, parent: task, cards: direct });
      for (const child of direct) walk(child);
    };

    for (const root of rootsOf(tasks)) walk(root);

    // A task is "placed" if it appears as either a section header
    // or a card in some section's body. Anything left over is an
    // orphan-or-leaf-without-shown-parent and lands in Other.
    const placedAsCard = new Set();
    for (const g of result) for (const c of g.cards) placedAsCard.add(c.id);

    const other = tasks.filter(
      (t) => !seenHeader.has(t.id) && !placedAsCard.has(t.id),
    );

    return { groups: result, otherCards: other };
  })();

  const [collapsed, setCollapsed] = useState(() => new Set());
  const toggle = (key) =>
    setCollapsed((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  const [activeId, setActiveId] = useState(null);
  const [overId, setOverId] = useState(null);

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  const handleDragEnd = (e) => {
    setActiveId(null);
    setOverId(null);
    if (!e.over || !e.active) return;
    const dropId = String(e.over.id || "");
    if (!dropId.startsWith("parent:")) return;

    const moved = tasks.find((t) => t.id === e.active.id);
    if (!moved) return;
    if (moved.permissions?.update === false) {
      toast.error("You don't have permission to change this issue.");
      return;
    }

    const newParent = dropId === "parent:none" ? null : dropId.slice("parent:".length);
    const currentParent = moved.epic ? String(moved.epic) : null;
    if (currentParent === newParent) return;

    // No-cycle guard.
    if (newParent != null) {
      if (String(moved.nativeId) === String(newParent)) return;
      const descendants = new Set(
        collectAllDescendants(moved.nativeId, childIndex).map((t) => String(t.nativeId)),
      );
      if (descendants.has(String(newParent))) {
        toast.error("Can't move a task under one of its own descendants.");
        return;
      }
    }

    onUpdate?.(moved.id, { parent: newParent });
    if (newParent == null) {
      toast.success(`${moved.key} unparented`);
    } else {
      const targetParent = tasks.find((t) => String(t.nativeId) === String(newParent));
      toast.success(`${moved.key} moved under ${targetParent?.key || "task"}`);
    }
  };

  if (tasks.length === 0) {
    return (
      <div className="luxe-card">
        <EmptyState
          title="Nothing in scope"
          body="No work packages match the current filters. Loosen the chips above, or pick a different sprint."
        />
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setActiveId(e.active?.id ?? null)}
      onDragOver={(e) => setOverId(e.over?.id ?? null)}
      onDragCancel={() => {
        setActiveId(null);
        setOverId(null);
      }}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col gap-4">
        {groups.map((g) => {
          const isCollapsed = collapsed.has(g.key);
          return (
            <Section
              key={g.key}
              parentId={g.parent.nativeId}
              isOver={overId === `parent:${g.parent.nativeId}`}
            >
              <SectionHeader
                parent={g.parent}
                count={g.cards.length}
                collapsed={isCollapsed}
                onToggleCollapse={() => toggle(g.key)}
                onClickParent={() => onTaskClick?.(g.parent.id)}
                assignees={assignees}
                estimateMode={estimateMode}
              />
              {!isCollapsed && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-3">
                  {g.cards.map((t) => (
                    <DraggableCard
                      key={t.id}
                      task={t}
                      assignees={assignees}
                      statuses={statuses}
                      onClick={onTaskClick}
                      onStatusChange={onMoveTask}
                      recentlyUpdated={isRecent(t)}
                      fadedByOverlay={sinceMs != null}
                      estimateMode={estimateMode}
                    />
                  ))}
                </div>
              )}
            </Section>
          );
        })}

        {otherCards.length > 0 && (
          <Section parentId={null} isOver={overId === "parent:none"}>
            <SectionHeader
              parent={null}
              count={otherCards.length}
              collapsed={collapsed.has("__other__")}
              onToggleCollapse={() => toggle("__other__")}
              fallbackLabel="Other Issues"
              estimateMode={estimateMode}
            />
            {!collapsed.has("__other__") && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-3">
                {otherCards.map((t) => (
                  <DraggableCard
                    key={t.id}
                    task={t}
                    assignees={assignees}
                    statuses={statuses}
                    onClick={onTaskClick}
                    onStatusChange={onMoveTask}
                    recentlyUpdated={isRecent(t)}
                    fadedByOverlay={sinceMs != null}
                    estimateMode={estimateMode}
                  />
                ))}
              </div>
            )}
          </Section>
        )}
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="luxe-card flex items-center gap-2 px-3 py-2 max-w-md shadow-lg">
            <TaskTypeIcon task={activeTask} size={14} />
            <span className="font-mono text-[11px] text-fg-faint shrink-0">
              {activeTask.key}
            </span>
            <span className="flex-1 truncate text-[13.5px] text-fg">
              {activeTask.title}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
