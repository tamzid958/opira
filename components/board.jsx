"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Icon } from "@/components/icons";
import { TaskPriorityIcon, TaskTypeIcon } from "@/components/ui/task-meta";
import { CarryOverChip } from "@/components/ui/carryover-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingPill } from "@/components/ui/loading-pill";
import { TagPill } from "@/components/ui/tag-pill";
import { BoardActionBar } from "@/components/board-action-bar";
import { BoardCardMenu } from "@/components/board-card-menu";
import { fetchJson } from "@/lib/api-client";
import { formatEstimate } from "@/lib/openproject/estimate";
import { PEOPLE } from "@/lib/data";
import { cn, findById } from "@/lib/utils";

// Pointer-distance threshold before a press becomes a drag — anything below
// this is treated as a click (open detail or toggle selection). Drops it
// from the dnd-kit default of 4px so quick clicks on small avatars / chips
// don't accidentally start a drag.
const DRAG_ACTIVATION_DISTANCE = 5;

function CardBody({
  task,
  dragging,
  assignees,
  carryOver,
  selected,
  focused,
  recentlyUpdated,
  agingDays,
  estimateMissing,
}) {
  const assignee = task.assignee
    ? findById(assignees, task.assignee) ||
      PEOPLE[task.assignee] ||
      { id: task.assignee, name: task.assigneeName || "Assignee" }
    : null;
  return (
    <div
      className={cn(
        "board-card luxe-card rounded-md px-2.5 pt-2.5 pb-2 select-none cursor-grab relative",
        dragging && "opacity-50 cursor-grabbing rotate-1",
        selected &&
          "ring-2 ring-accent ring-offset-1 ring-offset-surface-board bg-accent-50/30",
        focused && !selected &&
          "ring-2 ring-fg/50 ring-offset-1 ring-offset-surface-board",
        estimateMissing && !selected && !focused &&
          "border border-dashed border-border",
      )}
    >
      {recentlyUpdated && (
        <span
          className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-accent ring-2 ring-surface-elevated"
          aria-label="Updated since last visit"
          title="Updated since last visit"
        />
      )}
      <div className="text-[13px] font-medium text-fg leading-tight mb-2 wrap-break-word">
        {task.title}
      </div>
      {task.labels && task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.labels.map((l) => (
            <TagPill key={l} name={l} size="xs" />
          ))}
        </div>
      )}
      <div className="flex items-center justify-between mt-1.5">
        <div className="flex items-center gap-1.5">
          <TaskTypeIcon task={task} size={14} />
          <span
            className={cn(
              "font-mono text-[11px] text-fg-subtle font-medium",
              task.statusIsClosed && "line-through opacity-60",
            )}
          >
            {task.key}
          </span>
          {carryOver && <CarryOverChip entry={carryOver} />}
          {agingDays != null && agingDays > 0 && (
            <span
              className="inline-flex items-center gap-0.5 px-1 h-4 rounded text-[10px] font-medium tabular-nums bg-pri-medium/15 text-pri-medium"
              title={`No updates in ${agingDays} day${agingDays === 1 ? "" : "s"}`}
            >
              <Icon name="clock" size={10} aria-hidden="true" />
              {agingDays}d
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {task.comments > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-fg-subtle">
              <Icon name="comment" size={12} aria-hidden="true" /> {task.comments}
            </span>
          )}
          <TaskPriorityIcon task={task} size={14} />
          {formatEstimate(task) != null && (
            <span
              className="px-1.5 py-0.5 rounded-full bg-surface-muted text-[11px] font-medium text-fg-muted"
              title={
                task.points != null && String(task.points) !== formatEstimate(task)
                  ? `${task.points} story points`
                  : undefined
              }
            >
              {formatEstimate(task)}
            </span>
          )}
          <Avatar user={assignee} size="sm" />
        </div>
      </div>
    </div>
  );
}

function DraggableCard({
  task,
  onClick,
  onContextMenu,
  assignees,
  carryOver,
  selected,
  focused,
  recentlyUpdated,
  fadedByOverlay,
  agingDays,
  estimateMissing,
}) {
  const draggable = task.permissions?.update !== false;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled: !draggable,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...(draggable ? listeners : {})}
      onClick={(e) => onClick?.(task, e)}
      onContextMenu={(e) => onContextMenu?.(task, e)}
      style={{ opacity: isDragging ? 0 : 1, cursor: draggable ? undefined : "pointer" }}
      aria-disabled={!draggable || undefined}
      data-task-id={task.id}
      data-selected={selected ? "true" : undefined}
      data-focused={focused ? "true" : undefined}
      className={cn(
        "transition-opacity",
        fadedByOverlay && !recentlyUpdated && "opacity-40",
      )}
    >
      <CardBody
        task={task}
        dragging={isDragging}
        assignees={assignees}
        carryOver={carryOver}
        selected={selected}
        focused={focused}
        recentlyUpdated={recentlyUpdated}
        agingDays={agingDays}
        estimateMissing={estimateMissing}
      />
    </div>
  );
}

// In-column inline create. Click "+ Create issue" → expands an input;
// type a title + Enter to fire `onSubmit(title)`; Esc / blur with empty
// closes. Holds focus so consecutive creates are a single keystroke loop.
function InlineCreate({ statusId, statusName, onSubmit }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const reset = () => {
    setValue("");
    setOpen(false);
  };

  const submit = async () => {
    const title = value.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      await onSubmit?.(title);
      // Stay open — most create flows are bursty (two or three rows in a
      // row). Just clear the input and re-focus.
      setValue("");
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch {
      // Toast already raised by the calling hook; keep the input filled.
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Create issue in ${statusName}`}
        className="w-full flex items-center gap-1 px-2 h-7 rounded text-fg-subtle text-xs font-medium hover:bg-surface-subtle hover:text-fg cursor-pointer text-left"
      >
        <Icon name="plus" size={14} aria-hidden="true" /> Create issue
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 px-1.5 py-1 rounded border border-accent/60 bg-surface-elevated shadow-sm">
      <Icon name="plus" size={13} className="text-fg-subtle ml-1" aria-hidden="true" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            reset();
          }
        }}
        onBlur={() => {
          if (!value.trim() && !busy) reset();
        }}
        disabled={busy}
        placeholder="What needs doing?"
        className="flex-1 bg-transparent border-0 outline-none text-[12px] text-fg placeholder:text-fg-faint min-w-0 disabled:opacity-50"
        aria-label={`New issue title for ${statusName}`}
      />
      {busy ? (
        <Icon name="loader" size={12} className="text-fg-subtle animate-spin mr-1.5" aria-hidden="true" />
      ) : (
        <span
          className="text-[10px] text-fg-faint mr-1.5"
          title="Press Enter to create, Esc to cancel"
        >
          ↵
        </span>
      )}
    </div>
  );
}

// Floating "Send to backlog" rail that only appears while a card is being
// dragged. Drop target uses a sentinel id so the parent's onDragEnd can
// route a sprint-clear PATCH instead of a status PATCH.
function BacklogDropzone({ visible, isOver }) {
  const { setNodeRef } = useDroppable({ id: BACKLOG_DROP_ID });
  if (!visible) return null;
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "fixed left-1/2 -translate-x-1/2 bottom-4 z-40 flex items-center gap-2 px-4 h-10 rounded-xl border-2 border-dashed text-[12px] font-medium transition-colors",
        isOver
          ? "bg-accent-50 border-accent text-accent-700"
          : "bg-surface-elevated/95 border-border text-fg-muted",
      )}
    >
      <Icon name="sprint" size={14} aria-hidden="true" />
      Drop here to send to backlog
    </div>
  );
}

function DroppableColumn({
  status,
  children,
  count,
  isOver,
  onCreate,
  canCreate,
  onInlineCreate,
  dropDiscouraged,
}) {
  const { setNodeRef } = useDroppable({ id: `status:${status.id}` });
  return (
    <div
      className={cn(
        "board-column flex flex-col w-70 shrink-0 rounded-lg overflow-hidden border border-border-soft transition-opacity",
        dropDiscouraged && "opacity-50",
      )}
      style={{
        background:
          "linear-gradient(180deg, var(--color-surface-subtle) 0%, var(--color-surface-column) 200px)",
      }}
      title={
        dropDiscouraged
          ? "Workflow probably doesn't allow moving this issue here"
          : undefined
      }
    >
      <div className="flex items-start gap-2 px-3.5 py-3 bg-transparent border-b border-border-soft">
        <span
          className="eyebrow leading-snug wrap-break-word"
          title={status.name}
        >
          {status.name}
        </span>
        <span className="ml-auto mt-0.5 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10.5px] font-semibold tabular-nums text-fg-muted border border-border-soft shrink-0">
          {count}
        </span>
        {canCreate ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={`Add issue to ${status.name} (full editor)`}
            title="Add issue (full editor)"
            onClick={onCreate}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onCreate?.()}
            className="grid place-items-center w-6 h-6 rounded text-fg-subtle cursor-pointer hover:bg-surface-subtle hover:text-fg shrink-0"
          >
            <Icon name="plus" size={14} aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-2 min-h-20 transition-colors",
          isOver && "bg-accent-50 outline-2 outline-dashed outline-accent-200 -outline-offset-4 rounded-md",
        )}
      >
        {children}
      </div>
      {canCreate ? (
        <div className="px-2 py-1.5 pb-2 border-t border-border-soft bg-transparent">
          <InlineCreate
            statusId={status.id}
            statusName={status.name}
            onSubmit={(title) => onInlineCreate?.(status.id, title)}
          />
        </div>
      ) : null}
    </div>
  );
}

// Aging threshold (days). Cards still open with no updates beyond this many
// days surface a small amber chip so the eye picks up trouble without the
// user having to skim every column.
const AGING_DAYS_THRESHOLD = 3;

// Days back to look at when "Updated since…" overlay is enabled. Anything
// updated within this window glows; everything else fades. The value is
// what the page's overlay toggle interprets as "yesterday".
function daysBetween(from, to) {
  if (!from) return null;
  const ms = to.getTime() - new Date(from).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 86_400_000);
}

// Drop target id used by the "send to backlog" rail. Has to live outside
// the per-status droppable namespace so onDragEnd can disambiguate.
const BACKLOG_DROP_ID = "__backlog__";

export function Board({
  tasks,
  statuses,
  assignees,
  sprints = [],
  types = [],
  categories = [],
  canCreate = true,
  onTaskClick,
  onMoveTask,
  onCreateInColumn,
  onInlineCreate,
  onBulkUpdate,
  onBulkDelete,
  carryover,
  updatedSince,
  showBacklogDropzone = false,
}) {
  const [activeId, setActiveId] = useState(null);
  const [overStatusId, setOverStatusId] = useState(null);
  const [overBacklog, setOverBacklog] = useState(false);
  // Set of status ids the active card may transition into (per OP's
  // role × type workflow). `null` means "unknown" — either we haven't
  // started a drag, the lookup is in flight, or it failed (in which case
  // we let the server be the source of truth and don't dim anything).
  const [allowedStatusIds, setAllowedStatusIds] = useState(null);
  // Cache lookups by WP id so re-dragging the same card doesn't refetch.
  const allowedCacheRef = useRef(new Map());
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE },
    }),
  );

  // Multi-select: a Set of task ids the user has explicitly picked. Lives
  // in board state so it's cleared when the project / sprint changes (the
  // page remounts the Board with fresh tasks). Esc clears.
  const [selected, setSelected] = useState(() => new Set());
  const toggleSelected = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  // Right-click / keyboard context menu state. Either `point` (mouse) or
  // `anchorRect` (keyboard) is set so BoardCardMenu can position itself.
  const [cardMenu, setCardMenu] = useState(null);

  // Keyboard navigation focus — the "current" card the user is operating
  // on without using the mouse. Independent of selection so a focused-but-
  // not-selected card has a softer ring than the selection ring.
  const [focusedId, setFocusedId] = useState(null);

  // `?` cheatsheet popover. Bottom-right toast-style overlay.
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Esc-only: clear selection / focus / cheatsheet without colliding with
  // the rest of the keyboard layer (which lives below `grouped`). Modal
  // Esc still wins because we bail when a [role=dialog] is mounted.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (document.querySelector('[role="dialog"]')) return;
      if (showShortcuts) {
        setShowShortcuts(false);
        return;
      }
      if (cardMenu) {
        setCardMenu(null);
        return;
      }
      if (selected.size > 0) {
        clearSelection();
        return;
      }
      if (focusedId) setFocusedId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected.size, clearSelection, focusedId, cardMenu, showShortcuts]);

  // Only top-level work packages render as cards on the board. A WP is a
  // child if its `epic` (parent native id) refers to another task that's
  // also in the visible pool — those live inside the parent's detail
  // modal (Sub-tasks tab) so we don't double-count them on the board.
  const filtered = useMemo(() => {
    const ids = new Set(tasks.map((t) => String(t.nativeId)));
    return tasks.filter((t) => !t.epic || !ids.has(String(t.epic)));
  }, [tasks]);

  // Drop selected ids that are no longer in the visible pool — guard
  // against dangling selection after a sprint switch / filter change.
  // Derived (not state) so a tasks refetch can't trigger a cascading
  // setSelected → re-render loop; the underlying Set is allowed to keep
  // stale ids since every consumer reads via this filtered view.
  const visibleSelected = useMemo(() => {
    if (selected.size === 0) return selected;
    const ids = new Set(filtered.map((t) => t.id));
    const next = new Set();
    for (const id of selected) if (ids.has(id)) next.add(id);
    return next;
  }, [filtered, selected]);

  // Show *every* configured status as a column, including closed ones (Done,
  // Rejected, etc.) even when they're currently empty — otherwise the column
  // vanishes the moment the user drags the last card out of it, leaving them
  // unable to drop anything back. Inferred statuses from tasks whose status
  // isn't in the cached list use the task's own statusIsClosed flag (API
  // truth from the mapper).
  const columns = useMemo(() => {
    const seen = new Map();
    if (Array.isArray(statuses)) {
      for (const s of statuses) seen.set(String(s.id), s);
    }
    for (const t of filtered) {
      if (!t.statusId) continue;
      const id = String(t.statusId);
      if (!seen.has(id)) {
        seen.set(id, {
          id,
          name: t.statusName || "Unknown",
          isClosed: !!t.statusIsClosed,
        });
      }
    }
    return [...seen.values()].sort((a, b) => {
      if (a.isClosed !== b.isClosed) return a.isClosed ? 1 : -1;
      return (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name);
    });
  }, [statuses, filtered]);

  const grouped = useMemo(() => {
    const acc = {};
    for (const c of columns) acc[c.id] = [];
    for (const t of filtered) {
      const id = String(t.statusId || "");
      if (!acc[id]) acc[id] = [];
      acc[id].push(t);
    }
    return acc;
  }, [columns, filtered]);

  // Per-task overlay flags: aging-since-update for open WPs, missing-estimate
  // hint, and "updated since X" for the standup overlay.
  const overlayFlags = (() => {
    const now = new Date();
    const sinceMs = updatedSince ? new Date(updatedSince).getTime() : null;
    const map = new Map();
    for (const t of filtered) {
      const updatedDays = daysBetween(t.updatedAt, now);
      const open = !t.statusIsClosed;
      const aging =
        open && updatedDays != null && updatedDays >= AGING_DAYS_THRESHOLD
          ? updatedDays
          : null;
      const estimateMissing =
        open && (t.points == null || t.points === "") && !t.hasChildren;
      const recentlyUpdated =
        sinceMs != null &&
        t.updatedAt &&
        new Date(t.updatedAt).getTime() >= sinceMs;
      map.set(t.id, { agingDays: aging, estimateMissing, recentlyUpdated });
    }
    return map;
  })();

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  // Click handler — modifier-key gates whether we toggle selection or
  // open the detail modal. Plain click always opens, so muscle memory
  // for "click a card to look at it" stays intact even with selection.
  const handleCardClick = (task, e) => {
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      e.preventDefault();
      toggleSelected(task.id);
      return;
    }
    onTaskClick?.(task.id);
  };

  const handleCardContextMenu = (task, e) => {
    e.preventDefault();
    setCardMenu({ task, point: { x: e.clientX, y: e.clientY } });
  };

  const closeCardMenu = () => setCardMenu(null);

  // ── Keyboard navigation ────────────────────────────────────────────────
  // Resolve the (column, row) of the currently-focused card. Falls back to
  // the first card in the leftmost non-empty column when nothing is
  // focused yet so the very first j / k press doesn't no-op.
  const locate = useCallback(
    (id) => {
      for (let c = 0; c < columns.length; c += 1) {
        const col = columns[c];
        const list = grouped[col.id] || [];
        const idx = list.findIndex((t) => t.id === id);
        if (idx >= 0) return { col: c, row: idx, list };
      }
      return null;
    },
    [columns, grouped],
  );

  const firstCard = useCallback(() => {
    for (const col of columns) {
      const list = grouped[col.id] || [];
      if (list.length > 0) return list[0].id;
    }
    return null;
  }, [columns, grouped]);

  const moveFocus = useCallback(
    (dir) => {
      const id = focusedId || firstCard();
      if (!id) return;
      if (id !== focusedId) {
        setFocusedId(id);
        return;
      }
      const pos = locate(id);
      if (!pos) {
        setFocusedId(firstCard());
        return;
      }
      const { col, row, list } = pos;
      if (dir === "down") {
        const next = list[Math.min(list.length - 1, row + 1)];
        if (next) setFocusedId(next.id);
        return;
      }
      if (dir === "up") {
        const next = list[Math.max(0, row - 1)];
        if (next) setFocusedId(next.id);
        return;
      }
      if (dir === "right" || dir === "left") {
        const step = dir === "right" ? 1 : -1;
        let nextCol = col + step;
        while (nextCol >= 0 && nextCol < columns.length) {
          const list2 = grouped[columns[nextCol].id] || [];
          if (list2.length > 0) {
            const target = list2[Math.min(list2.length - 1, row)];
            setFocusedId(target.id);
            return;
          }
          nextCol += step;
        }
      }
    },
    [focusedId, firstCard, locate, columns, grouped],
  );

  // Open BoardCardMenu anchored to the focused card, drilled into a
  // specific stage so a / s / m / t skips the root menu.
  const openFocusedMenu = useCallback(
    (stage) => {
      const id = focusedId || firstCard();
      if (!id) return;
      const task = tasks.find((t) => t.id === id);
      if (!task) return;
      const el = document.querySelector(`[data-task-id="${CSS.escape(id)}"]`);
      const rect = el?.getBoundingClientRect();
      if (!rect) return;
      setFocusedId(id);
      setCardMenu({ task, anchorRect: rect, initialStage: stage });
    },
    [focusedId, firstCard, tasks],
  );

  useEffect(() => {
    const onKey = (e) => {
      // Skip when the user is typing — inputs, textareas, contenteditable.
      const target = e.target;
      const tag = target?.tagName;
      const typing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable === true;
      if (typing) return;
      // Skip when a modal / detail panel is on top — its own handlers win.
      if (document.querySelector('[role="dialog"]')) return;
      // Skip when the card menu is already open — let that menu's own
      // keyboard handlers win (Esc / arrow keys inside the menu).
      if (cardMenu) return;

      const noMod = !e.metaKey && !e.ctrlKey && !e.altKey;
      const noModOrShift = !e.metaKey && !e.ctrlKey && !e.altKey;
      if (!noModOrShift) return;

      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setShowShortcuts((v) => !v);
        return;
      }
      if (!noMod || e.shiftKey) return;

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          moveFocus("down");
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          moveFocus("up");
          break;
        case "h":
        case "ArrowLeft":
          e.preventDefault();
          moveFocus("left");
          break;
        case "l":
        case "ArrowRight":
          e.preventDefault();
          moveFocus("right");
          break;
        case "Enter":
          if (focusedId) {
            e.preventDefault();
            onTaskClick?.(focusedId);
          }
          break;
        case " ":
        case "x":
          if (focusedId) {
            e.preventDefault();
            toggleSelected(focusedId);
          }
          break;
        case "a":
          if (focusedId) {
            e.preventDefault();
            openFocusedMenu("assignee");
          }
          break;
        case "s":
          if (focusedId) {
            e.preventDefault();
            openFocusedMenu("status");
          }
          break;
        case "m":
          if (focusedId) {
            e.preventDefault();
            openFocusedMenu("sprint");
          }
          break;
        case "t":
          if (focusedId) {
            e.preventDefault();
            openFocusedMenu("type");
          }
          break;
        default:
          break;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [
    cardMenu,
    focusedId,
    moveFocus,
    onTaskClick,
    openFocusedMenu,
    toggleSelected,
  ]);

  // Scroll the focused card into view whenever focus moves — important for
  // h / l hops that land in a column scrolled out of view.
  useEffect(() => {
    if (!focusedId) return;
    const el = document.querySelector(`[data-task-id="${CSS.escape(focusedId)}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [focusedId]);

  // Bulk action helpers — fan the supplied callback across every selected
  // id. The parent's mutation hooks handle optimistic updates per id, so
  // the cards re-render in lockstep.
  const runBulk = async (patch, label) => {
    if (visibleSelected.size === 0 || !onBulkUpdate) return;
    const ids = [...visibleSelected];
    try {
      await onBulkUpdate(ids, patch);
      toast.success(
        label
          ? `${ids.length} issue${ids.length === 1 ? "" : "s"} → ${label}`
          : `${ids.length} issue${ids.length === 1 ? "" : "s"} updated`,
      );
      clearSelection();
    } catch (err) {
      toast.error(err?.message || "Couldn't update some issues");
    }
  };

  if (columns.length === 0) {
    return (
      <div className="grid place-items-center py-10">
        <LoadingPill label="loading statuses" />
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="py-10">
        <EmptyState
          title="No issues here yet"
          body="When work packages are created in this project, they appear on the board grouped by status."
          action={
            canCreate
              ? { label: "Create issue", onClick: () => onCreateInColumn?.(columns[0]?.id) }
              : null
          }
        />
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => {
        setActiveId(e.active.id);
        const wpId = e.active.id;
        const cached = allowedCacheRef.current.get(wpId);
        if (cached !== undefined) {
          setAllowedStatusIds(cached);
          return;
        }
        // Optimistic: leave allowed=null while in flight so columns aren't
        // wrongly dimmed during the lookup. The drag still works; if the
        // user drops before we resolve, we let the server validate.
        setAllowedStatusIds(null);
        fetchJson(`/api/openproject/tasks/${encodeURIComponent(wpId)}/allowed-statuses`)
          .then((res) => {
            // The route returns `ids: null` when OpenProject didn't expose
            // workflow transitions (older OP version, locked schema, etc.).
            // Cache that signal as `null` — the server is the authority.
            const set = Array.isArray(res?.ids) ? new Set(res.ids.map(String)) : null;
            allowedCacheRef.current.set(wpId, set);
            setActiveId((current) => {
              if (current === wpId) setAllowedStatusIds(set);
              return current;
            });
          })
          .catch(() => {
            // Swallow — fall back to letting the server reject the drop.
          });
      }}
      onDragOver={(e) => {
        const overId = e.over?.id;
        if (typeof overId === "string" && overId.startsWith("status:")) {
          setOverStatusId(overId.slice("status:".length));
          setOverBacklog(false);
        } else if (overId === BACKLOG_DROP_ID) {
          setOverStatusId(null);
          setOverBacklog(true);
        } else {
          setOverStatusId(null);
          setOverBacklog(false);
        }
      }}
      onDragEnd={(e) => {
        const overId = e.over?.id;
        // Backlog rail: route to onBulkUpdate so the optimistic patch +
        // rollback path is shared with the action bar's "Move to backlog".
        if (overId === BACKLOG_DROP_ID && e.active && onBulkUpdate) {
          const moved = tasks.find((t) => t.id === e.active.id);
          if (moved && moved.permissions?.update === false) {
            toast.error("You don't have permission to change this issue.");
          } else {
            const ids =
              visibleSelected.has(e.active.id) && visibleSelected.size > 1
                ? [...visibleSelected]
                : [e.active.id];
            onBulkUpdate(ids, { sprint: null })
              .then(() => {
                toast.success(
                  ids.length === 1
                    ? `${moved?.key || "Issue"} → backlog`
                    : `${ids.length} issues → backlog`,
                );
                if (ids.length > 1) clearSelection();
              })
              .catch((err) =>
                toast.error(err?.message || "Couldn't move to backlog"),
              );
          }
          setActiveId(null);
          setOverStatusId(null);
          setOverBacklog(false);
          setAllowedStatusIds(null);
          return;
        }
        if (typeof overId === "string" && overId.startsWith("status:") && e.active) {
          const moved = tasks.find((t) => t.id === e.active.id);
          const targetStatusId = overId.slice("status:".length);
          if (moved && moved.permissions?.update === false) {
            toast.error("You don't have permission to change this issue.");
          } else {
            // If the dragged card is part of an active multi-select, fan the
            // status change across every selected id — drag-as-bulk-move.
            // Otherwise it's a plain single-card move.
            if (
              visibleSelected.has(e.active.id) &&
              visibleSelected.size > 1 &&
              onBulkUpdate
            ) {
              const ids = [...visibleSelected];
              const target = findById(statuses, targetStatusId);
              onBulkUpdate(ids, {
                statusId: targetStatusId,
                statusName: target?.name,
              })
                .then(() => {
                  toast.success(
                    `${ids.length} issues → ${target?.name || "new status"}`,
                  );
                  clearSelection();
                })
                .catch((err) =>
                  toast.error(err?.message || "Couldn't move some issues"),
                );
            } else {
              onMoveTask(e.active.id, targetStatusId);
            }
          }
        }
        setActiveId(null);
        setOverStatusId(null);
        setOverBacklog(false);
        setAllowedStatusIds(null);
      }}
      onDragCancel={() => {
        setActiveId(null);
        setOverStatusId(null);
        setOverBacklog(false);
        setAllowedStatusIds(null);
      }}
    >
      <div className="board-scroller flex gap-3 px-2 pt-1 pb-3 h-full overflow-x-auto bg-surface-board">
        {columns.map((status) => (
          <DroppableColumn
            key={status.id}
            status={status}
            count={(grouped[status.id] || []).length}
            isOver={overStatusId === String(status.id)}
            canCreate={canCreate}
            onCreate={() => onCreateInColumn?.(status.id, status.name)}
            onInlineCreate={onInlineCreate}
            dropDiscouraged={
              !!activeId &&
              allowedStatusIds != null &&
              !allowedStatusIds.has(String(status.id))
            }
          >
            {(grouped[status.id] || []).map((t) => {
              const flags = overlayFlags.get(t.id) || {};
              return (
                <DraggableCard
                  key={t.id}
                  task={t}
                  onClick={handleCardClick}
                  onContextMenu={handleCardContextMenu}
                  assignees={assignees}
                  carryOver={carryover?.byWpId?.[String(t.nativeId)] || null}
                  selected={visibleSelected.has(t.id)}
                  focused={focusedId === t.id}
                  agingDays={flags.agingDays || null}
                  estimateMissing={!!flags.estimateMissing}
                  recentlyUpdated={!!flags.recentlyUpdated}
                  fadedByOverlay={!!updatedSince}
                />
              );
            })}
            {(grouped[status.id] || []).length === 0 &&
              overStatusId !== String(status.id) && (
                <div className="text-center py-6 px-2 text-xs text-fg-faint leading-relaxed">
                  Drop tasks here
                </div>
              )}
          </DroppableColumn>
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <CardBody
            task={activeTask}
            dragging
            assignees={assignees}
            carryOver={carryover?.byWpId?.[String(activeTask.nativeId)] || null}
          />
        ) : null}
      </DragOverlay>

      <BacklogDropzone
        visible={!!activeId && showBacklogDropzone}
        isOver={overBacklog}
      />

      <BoardActionBar
        count={visibleSelected.size}
        onClear={clearSelection}
        statuses={statuses || []}
        assignees={assignees || []}
        sprints={sprints}
        types={types}
        categories={categories}
        onSetStatus={(statusId, name) => {
          const target = (statuses || []).find(
            (s) => String(s.id) === String(statusId),
          );
          runBulk(
            {
              statusId,
              statusName: target?.name,
            },
            name,
          );
        }}
        onSetAssignee={(assigneeId, name) =>
          runBulk({ assignee: assigneeId }, name)
        }
        onSetSprint={(sprintId, name) =>
          runBulk({ sprint: sprintId }, sprintId ? name : "Backlog")
        }
        onSetType={(typeBucket, name) => runBulk({ type: typeBucket }, name)}
        onAddLabel={(labelName) => {
          if (!labelName || !onBulkUpdate) return;
          const ids = [...visibleSelected];
          // Per-id patch: union the existing labels with the new one so we
          // don't drop a card's existing tags. The parent receives a fn
          // form that resolves the patch per task.
          onBulkUpdate(ids, (task) => {
            const existing = Array.isArray(task.labels) ? task.labels : [];
            if (existing.includes(labelName)) return null;
            return { labels: [...existing, labelName] };
          })
            .then(() => {
              toast.success(`Tagged ${ids.length} issue${ids.length === 1 ? "" : "s"}`);
              clearSelection();
            })
            .catch((err) => toast.error(err?.message || "Couldn't tag some issues"));
        }}
        onDelete={() => {
          if (!onBulkDelete) return;
          const ids = [...visibleSelected];
          onBulkDelete(ids)
            .then(() => {
              toast.success(`Deleted ${ids.length} issue${ids.length === 1 ? "" : "s"}`);
              clearSelection();
            })
            .catch((err) => toast.error(err?.message || "Couldn't delete some issues"));
        }}
      />

      {cardMenu && (
        <BoardCardMenu
          point={cardMenu.point}
          anchorRect={cardMenu.anchorRect}
          initialStage={cardMenu.initialStage || "root"}
          task={cardMenu.task}
          statuses={statuses || []}
          assignees={assignees || []}
          sprints={sprints}
          types={types}
          categories={categories}
          onClose={closeCardMenu}
          onOpen={() => onTaskClick?.(cardMenu.task.id)}
          onSetStatus={(statusId, name) => {
            const target = (statuses || []).find(
              (s) => String(s.id) === String(statusId),
            );
            onMoveTask?.(cardMenu.task.id, statusId);
            if (target?.name) toast.success(`${cardMenu.task.key} → ${target.name}`);
          }}
          onSetAssignee={(assigneeId) =>
            onBulkUpdate?.([cardMenu.task.id], { assignee: assigneeId })
          }
          onSetSprint={(sprintId) =>
            onBulkUpdate?.([cardMenu.task.id], { sprint: sprintId })
          }
          onSetType={(typeBucket) =>
            onBulkUpdate?.([cardMenu.task.id], { type: typeBucket })
          }
          onAddLabel={(labelName) => {
            if (!labelName) return;
            onBulkUpdate?.([cardMenu.task.id], (task) => {
              const existing = Array.isArray(task.labels) ? task.labels : [];
              if (existing.includes(labelName)) return null;
              return { labels: [...existing, labelName] };
            });
          }}
          onDelete={() => onBulkDelete?.([cardMenu.task.id])}
        />
      )}

      {showShortcuts && (
        <ShortcutsSheet onClose={() => setShowShortcuts(false)} />
      )}
    </DndContext>
  );
}

// Toast-style cheatsheet anchored bottom-right. Renders a fixed list of
// keyboard shortcuts; the user toggles with "?" or clicks outside.
function ShortcutsSheet({ onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const rows = [
    { keys: ["j", "↓"], label: "Next card" },
    { keys: ["k", "↑"], label: "Previous card" },
    { keys: ["h", "←"], label: "Column left" },
    { keys: ["l", "→"], label: "Column right" },
    { keys: ["⏎"], label: "Open issue" },
    { keys: ["Space", "x"], label: "Toggle selection" },
    { keys: ["s"], label: "Set status" },
    { keys: ["a"], label: "Assign" },
    { keys: ["m"], label: "Move to sprint" },
    { keys: ["t"], label: "Change type" },
    { keys: ["⇧+click"], label: "Multi-select" },
    { keys: ["right-click"], label: "Quick edit" },
    { keys: ["Esc"], label: "Clear focus / selection" },
    { keys: ["?"], label: "This cheatsheet" },
  ];
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-100 bg-transparent"
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="fixed bottom-4 right-4 w-72 rounded-xl border border-border bg-surface-elevated shadow-xl p-3 animate-pop"
        role="dialog"
        aria-label="Keyboard shortcuts"
      >
        <div className="flex items-center mb-2">
          <span className="text-[12px] font-semibold text-fg">Keyboard shortcuts</span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto grid place-items-center w-6 h-6 rounded text-fg-subtle hover:bg-surface-subtle hover:text-fg cursor-pointer"
            aria-label="Close shortcuts"
          >
            <Icon name="x" size={12} aria-hidden="true" />
          </button>
        </div>
        <ul className="grid gap-1">
          {rows.map((r) => (
            <li
              key={r.label}
              className="flex items-center justify-between gap-2 text-[12px]"
            >
              <span className="text-fg-muted">{r.label}</span>
              <span className="flex items-center gap-1">
                {r.keys.map((k) => (
                  <kbd
                    key={k}
                    className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded border border-border bg-surface-app text-[10px] font-mono text-fg-subtle"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
