"use client";

import { Fragment, useMemo, useState } from "react";
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
import { Eyebrow } from "@/components/ui/eyebrow";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";
import {
  buildChildIndex,
  rootsOf,
  collectDescendantIds as collectDescendants,
} from "@/lib/openproject/hierarchy";
import { statusMenuItems } from "@/lib/openproject/menu-items";
import { formatEstimate } from "@/lib/openproject/estimate";

// ─────────────────────────────────────────────────────────────────
// Row — one task line. `isHeader` styles parents slightly heavier so
// they read as section starts; everything else is identical so the
// rhythm stays uniform top-to-bottom.

function Row({
  task,
  depth,
  isHeader,
  hasChildren,
  expanded,
  onToggle,
  onClick,
  onStatusChange,
  statuses,
  recentlyUpdated = false,
  fadedByOverlay = false,
}) {
  const [statusMenu, setStatusMenu] = useState(null);
  const editable = task.permissions?.update !== false;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled: !editable,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...(editable ? listeners : {})}
      onClick={() => onClick?.(task.id)}
      className={cn(
        "group relative flex items-center gap-2.5 px-3 py-2 border-b border-border-soft cursor-pointer transition-colors hover:bg-surface-subtle/60",
        isDragging && "opacity-40 cursor-grabbing",
        task.statusIsClosed && "opacity-70",
        recentlyUpdated && "bg-accent-50/40",
        fadedByOverlay && !recentlyUpdated && "opacity-40",
      )}
      style={{ paddingLeft: 12 + depth * 18 }}
      aria-disabled={!editable || undefined}
    >
      {recentlyUpdated && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-0 bottom-0 w-0.5 bg-accent rounded-r"
          title="Updated since last visit"
        />
      )}
      {/* Expand chevron OR placeholder for alignment */}
      {hasChildren ? (
        <span
          role="button"
          data-inline-tap
          aria-label={expanded ? "Collapse" : "Expand"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="relative grid place-items-center w-4 h-4 rounded text-fg-subtle hover:bg-surface-muted hover:text-fg before:content-[''] before:absolute before:-inset-2"
        >
          <Icon
            name={expanded ? "chev-down" : "chev-right"}
            size={12}
            aria-hidden="true"
          />
        </span>
      ) : (
        <span className="w-4 h-4 shrink-0" aria-hidden="true" />
      )}

      <TaskTypeIcon task={task} size={14} />

      <span className="font-mono text-[11px] text-fg-faint shrink-0 hidden sm:inline">
        {task.key}
      </span>

      <span
        title={task.title}
        className={cn(
          "flex-1 min-w-0 truncate text-[13.5px]",
          isHeader
            ? "font-display font-semibold tracking-[-0.014em] text-fg"
            : task.statusIsClosed
            ? "text-fg-subtle line-through"
            : "text-fg",
        )}
      >
        {task.title}
      </span>

      {task.labels && task.labels.length > 0 && (
        <span className="hidden lg:flex items-center gap-1 shrink-0">
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

      <span
        onClick={(e) => {
          if (!editable) return;
          e.stopPropagation();
          setStatusMenu(e.currentTarget.getBoundingClientRect());
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className={cn("shrink-0", editable ? "cursor-pointer" : "cursor-default")}
        aria-disabled={!editable || undefined}
      >
        <TaskStatusPill task={task} />
      </span>

      <span className="hidden md:inline-flex justify-center shrink-0 w-5">
        <TaskPriorityIcon task={task} size={14} />
      </span>

      <span
        title={`${task.points || 0} story points`}
        className="hidden md:inline-flex justify-center shrink-0 px-2 py-0.5 rounded-full bg-surface-muted text-[11px] font-medium text-fg-muted text-center min-w-9"
      >
        {formatEstimate(task) ?? "—"}
      </span>

      <Avatar user={task.assignee ? { id: task.assignee, name: task.assigneeName } : null} size="sm" />

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

// ─────────────────────────────────────────────────────────────────
// Group — wraps a parent row + its children in a single droppable
// container so dragging another row onto any part of this block
// re-parents under `parentId`. `parentId === null` is the
// "Without parent" zone.

function Group({ parentId, label, isOver, headerEyebrow, children }) {
  const dropId = parentId == null ? "parent:none" : `parent:${parentId}`;
  const { setNodeRef } = useDroppable({ id: dropId });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative transition-colors",
        isOver && "bg-accent-50/60 outline-1 outline-dashed outline-accent -outline-offset-2 rounded-md",
      )}
    >
      {label && (
        <div className="flex items-center gap-2 px-3 pt-3 pb-1">
          {headerEyebrow ? (
            <Eyebrow tone="strong">{label}</Eyebrow>
          ) : (
            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-fg-faint">
              {label}
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main

export function BoardList({
  tasks = [],
  statuses = [],
  onTaskClick,
  onMoveTask,
  onUpdate,
  updatedSince = null,
}) {
  const sinceMs = updatedSince ? new Date(updatedSince).getTime() : null;
  const isRecent = (task) =>
    sinceMs != null &&
    task.updatedAt &&
    new Date(task.updatedAt).getTime() >= sinceMs;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const childIndex = useMemo(() => buildChildIndex(tasks), [tasks]);
  const roots = useMemo(() => rootsOf(tasks), [tasks]);

  // Two buckets: "real" parents (root tasks that themselves have at
  // least one direct child in this slice) and the rest (leaf-roots
  // and orphans-by-filter), which collect into a single trailing
  // "Without parent" section so the eye doesn't have to chase
  // single-row sections at the top.
  const { parents, loose } = useMemo(() => {
    const p = [];
    const l = [];
    for (const t of roots) {
      const kids = childIndex.get(String(t.nativeId)) || [];
      if (kids.length > 0) p.push(t);
      else l.push(t);
    }
    return { parents: p, loose: l };
  }, [roots, childIndex]);

  const [collapsed, setCollapsed] = useState(() => new Set());
  const toggle = (id) =>
    setCollapsed((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const [activeId, setActiveId] = useState(null);
  const [overId, setOverId] = useState(null);

  const activeTask = useMemo(
    () => (activeId ? tasks.find((t) => t.id === activeId) : null),
    [activeId, tasks],
  );

  const handleDragEnd = (e) => {
    setActiveId(null);
    setOverId(null);
    if (!e.over || !e.active) return;
    const dropId = String(e.over.id || "");
    if (!dropId.startsWith("parent:")) return;

    const taskId = e.active.id;
    const moved = tasks.find((t) => t.id === taskId);
    if (!moved) return;

    if (moved.permissions?.update === false) {
      toast.error("You don't have permission to change this issue.");
      return;
    }

    const target = dropId === "parent:none" ? null : dropId.slice("parent:".length);

    // No-op: dropped on the same parent it already had.
    const currentParent = moved.epic ? String(moved.epic) : null;
    if (currentParent === target) return;

    // Cycle guard: don't allow dropping a task into one of its own
    // descendants. `target === moved.nativeId` covers the trivial
    // self-drop; the descendant set covers nested cycles.
    if (target != null) {
      if (String(moved.nativeId) === String(target)) return;
      const descendants = collectDescendants(moved.nativeId, childIndex);
      if (descendants.has(String(target))) {
        toast.error("Can't move a task under one of its own descendants.");
        return;
      }
    }

    onUpdate?.(taskId, { parent: target });
    const targetTask = target ? tasks.find((t) => String(t.nativeId) === String(target)) : null;
    if (target == null) {
      toast.success(`${moved.key} unparented`);
    } else if (targetTask) {
      toast.success(`${moved.key} moved under ${targetTask.key}`);
    }
  };

  // Render one task plus everything beneath it. Used for both parent
  // header rows and nested children — recursion handles n-level deep
  // hierarchies the same way the backlog does.
  const renderSubtree = (task, depth) => {
    const kids = childIndex.get(String(task.nativeId)) || [];
    const hasKids = kids.length > 0;
    const isExpanded = !collapsed.has(task.id);
    return (
      <Fragment key={task.id}>
        <Row
          task={task}
          depth={depth}
          isHeader={depth === 0 && hasKids}
          hasChildren={hasKids}
          expanded={isExpanded}
          onToggle={() => toggle(task.id)}
          onClick={onTaskClick}
          onStatusChange={onMoveTask}
          statuses={statuses}
          recentlyUpdated={isRecent(task)}
          fadedByOverlay={sinceMs != null}
        />
        {hasKids && isExpanded &&
          kids.map((c) => renderSubtree(c, depth + 1))}
      </Fragment>
    );
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
      <div className="luxe-card overflow-hidden">
        {parents.map((p) => (
          <Group
            key={p.id}
            parentId={p.nativeId}
            isOver={overId === `parent:${p.nativeId}`}
          >
            {renderSubtree(p, 0)}
          </Group>
        ))}

        {loose.length > 0 && (
          <Group
            parentId={null}
            label={parents.length > 0 ? "Without parent" : null}
            headerEyebrow={parents.length > 0}
            isOver={overId === "parent:none"}
          >
            {loose.map((t) => renderSubtree(t, 0))}
          </Group>
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
