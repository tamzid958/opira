"use client";

import { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/api-client";
import { Avatar } from "@/components/ui/avatar";
import { TaskStatusPill } from "@/components/ui/task-meta";
import { Menu } from "@/components/ui/menu";
import { Icon } from "@/components/icons";
import { useCreateChild } from "@/lib/hooks/use-openproject-detail";
import { useUpdateTask } from "@/lib/hooks/use-openproject";
import { PEOPLE } from "@/lib/data";
import { buildChildIndex as buildSliceChildIndex } from "@/lib/openproject/hierarchy";
import { assigneeMenuItems, statusMenuItems } from "@/lib/openproject/menu-items";
import { weightOf } from "@/lib/openproject/estimate";
import { cn, findById } from "@/lib/utils";

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

  // Flip between the project's first open and first closed status using
  // the API-truth `isClosed` flag (sorted by `position` so the choice is
  // stable across installs).
  const toggleDone = () => {
    const list = (Array.isArray(statuses) ? statuses : [])
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const target = list.find((s) => (isDone ? !s.isClosed : s.isClosed));
    if (!target) {
      onChange?.(
        isDone
          ? "No open status configured in OpenProject"
          : "No closed status configured in OpenProject",
      );
      return;
    }
    updateSub({ statusId: target.id, statusName: target.name });
    onChange?.(isDone ? "Sub-task reopened" : "Sub-task completed");
  };

  return (
    <>
      <div
        className="grid grid-cols-[16px_16px_100px_minmax(0,1fr)_100px_minmax(80px,140px)_28px_28px] gap-2 items-center -mx-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-surface-subtle transition-colors"
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

        <span
          onClick={(e) => {
            if (!editable) return;
            e.stopPropagation();
            toggleDone();
          }}
          role="checkbox"
          aria-checked={isDone}
          aria-label={isDone ? "Mark as not done" : "Mark as done"}
          title={
            !editable
              ? "You don't have permission to update this sub-task"
              : isDone
              ? "Mark as not done"
              : "Mark as done"
          }
          aria-disabled={!editable || undefined}
          className={cn(
            "w-4 h-4 rounded grid place-items-center text-white transition-colors",
            editable ? "cursor-pointer" : "cursor-default",
            isDone
              ? "bg-status-done border-[1.5px] border-status-done"
              : "border-[1.5px] border-border-strong hover:border-status-done",
          )}
        >
          {isDone && <Icon name="check" size={11} aria-hidden="true" />}
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

export const SubtaskBreakdown = forwardRef(function SubtaskBreakdown(
  {
    parent,
    projectId,
    statuses = [],
    assignees = [],
    sprints = [],
    canCreate = true,
    onChange,
    onTaskClick,
    allTasks = [],
  },
  ref,
) {
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [page, setPage] = useState(1);
  const createChild = useCreateChild(parent.nativeId);

  useImperativeHandle(ref, () => ({
    startAdd: () => setAdding(true),
  }));

  const childIndex = useMemo(() => buildChildIndex(allTasks), [allTasks]);
  const directChildren = childIndex.get(String(parent.nativeId)) || [];

  const totalPages = Math.max(1, Math.ceil(directChildren.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageChildren = directChildren.slice(pageStart, pageStart + PAGE_SIZE);
  const showPager = directChildren.length > PAGE_SIZE;

  const subtree = useMemo(() => {
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
  }, [childIndex, parent.nativeId]);

  const totalCount = subtree.length;
  const doneCount = subtree.filter((t) => t.statusIsClosed).length;
  const totalPts = subtree.reduce((s, t) => s + weightOf(t), 0);
  const donePts = subtree
    .filter((t) => t.statusIsClosed)
    .reduce((s, t) => s + weightOf(t), 0);

  const addSub = async () => {
    if (!newTitle.trim()) {
      setAdding(false);
      return;
    }
    try {
      await createChild.mutateAsync({ title: newTitle.trim(), projectId });
      onChange?.("Sub-task added");
      setPage(Math.max(1, Math.ceil((directChildren.length + 1) / PAGE_SIZE)));
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't create sub-task — please try again."));
    }
    setNewTitle("");
    setAdding(false);
  };

  return (
    <section>
      <header className="flex items-center justify-between gap-2 mb-2">
        <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-fg">
          Sub-tasks
          {totalCount > 0 && (
            <span className="text-fg-subtle font-medium text-xs">
              {doneCount}/{totalCount} · {donePts}/{totalPts} pts
            </span>
          )}
        </span>
        {canCreate ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
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
          <SubtaskRow
            key={c.id}
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

      {adding && canCreate && (
        <div className="flex items-center gap-2 -mx-2 mt-1 px-2 py-2 rounded-md bg-surface-subtle">
          <Icon name="plus" size={14} className="text-fg-subtle" aria-hidden="true" />
          <input
            autoFocus
            placeholder="Sub-task title…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addSub();
              if (e.key === "Escape") {
                setAdding(false);
                setNewTitle("");
              }
            }}
            onBlur={addSub}
            className="flex-1 bg-transparent border-0 outline-none text-[13px] text-fg h-6 placeholder:text-fg-faint"
          />
          {createChild.isPending && (
            <span className="text-[11px] text-fg-faint">creating…</span>
          )}
        </div>
      )}

      {!adding && directChildren.length === 0 && (
        <div className="text-center py-4 px-4 text-[13px] text-fg-subtle border border-dashed border-border rounded-lg mt-1">
          No sub-tasks yet. Break this down to track progress and split work across the team.
        </div>
      )}
    </section>
  );
});
