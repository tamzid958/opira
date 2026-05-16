"use client";

import { useState } from "react";
import { ChevronRight, Flag } from "lucide-react";
import { TaskTypeIcon, TaskStatusPill } from "@/components/ui/task-meta";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { AiSuggestButton } from "@/components/ui/ai-suggest-button";
import { usePublicConfig } from "@/components/config-provider";
import { cn, formatAbsDate, findById } from "@/lib/utils";
import { PEOPLE } from "@/lib/data";

// ─── Helpers ──────────────────────────────────────────────────────

function pickAssigneeName(task, sprints) {
  if (!task.assignee) return null;
  const user = PEOPLE[task.assignee];
  return user?.name || task.assigneeName || null;
}

function sprintName(task, sprints) {
  if (!task.sprint) return null;
  const s = findById(sprints, task.sprint);
  return s?.name || task.sprintName || null;
}

function DateCell({ iso, label }) {
  if (!iso) return <span className="text-fg-subtle text-[12px]">—</span>;
  return (
    <span title={label}>
      {formatAbsDate(iso)}
    </span>
  );
}

function ProgressBar({ done }) {
  if (done == null) return null;
  const pct = Math.min(100, Math.max(0, done));
  return (
    <div className="flex items-center gap-2 min-w-20">
      <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] text-fg-muted tabular-nums w-7 text-right">{pct}%</span>
    </div>
  );
}

// ─── Child row ────────────────────────────────────────────────────

function ChildRow({ task, sprints, onClick }) {
  const sprint = sprintName(task, sprints);
  return (
    <tr
      className="group hover:bg-surface-subtle cursor-pointer"
      onClick={() => onClick(task.id)}
    >
      {/* indent + type */}
      <td className="py-2 pl-10 pr-3 w-full max-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <TaskTypeIcon task={task} size={12} />
          <span className="text-[13px] text-fg truncate group-hover:text-accent transition-colors">
            {task.title}
          </span>
          <span className="text-[11px] text-fg-subtle shrink-0">{task.key}</span>
        </div>
      </td>
      <td className="py-2 px-3 text-[12px] text-fg-muted whitespace-nowrap">
        <TaskStatusPill task={task} />
      </td>
      <td className="py-2 px-3 text-[12px] text-fg-muted whitespace-nowrap">
        <DateCell iso={task.startDate} label="Start date" />
      </td>
      <td className="py-2 px-3 text-[12px] text-fg-muted whitespace-nowrap">
        <DateCell iso={task.dueDate} label="Due date" />
      </td>
      <td className="py-2 px-3 text-[12px] text-fg-muted whitespace-nowrap">
        {sprint ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-subtle text-fg-muted text-[11px]">
            {sprint}
          </span>
        ) : (
          <span className="text-fg-subtle">—</span>
        )}
      </td>
      <td className="py-2 px-3 text-[12px] text-fg-muted whitespace-nowrap">
        {task.assignee ? (
          <div className="flex items-center gap-1.5">
            <Avatar user={PEOPLE[task.assignee] || { name: task.assigneeName }} size="sm" />
            <span className="text-[12px] text-fg-muted">{task.assigneeName || "—"}</span>
          </div>
        ) : (
          <span className="text-fg-subtle">—</span>
        )}
      </td>
      <td className="py-2 px-3">
        <ProgressBar done={task.percentageDone} />
      </td>
    </tr>
  );
}

// ─── Milestone (parent) row ───────────────────────────────────────

function MilestoneRow({ milestone, childTasks, sprints, onTaskClick }) {
  const [open, setOpen] = useState(true);
  const { aiEnabled } = usePublicConfig();
  const sprint = sprintName(milestone, sprints);
  const childCount = childTasks.length;
  const closedCount = childTasks.filter((c) => c.statusIsClosed).length;
  const overdueItems = childTasks
    .filter((c) => !c.statusIsClosed && c.dueDate && c.dueDate < new Date().toISOString().slice(0, 10))
    .map((c) => c.title);
  const blockedItems = childTasks
    .filter((c) => !c.statusIsClosed && c.statusName?.toLowerCase().includes("block"))
    .map((c) => c.title);

  return (
    <>
      <tr
        className="group cursor-pointer hover:bg-surface-subtle border-t border-border"
        onClick={() => setOpen((v) => !v)}
      >
        {/* chevron + icon + title */}
        <td className="py-2.5 pl-3 pr-3 w-full max-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <ChevronRight
              size={14}
              className={cn(
                "shrink-0 text-fg-muted transition-transform",
                open && "rotate-90",
              )}
            />
            <Flag size={13} className="shrink-0 text-accent" />
            <span
              className="text-[13px] font-semibold text-fg truncate group-hover:text-accent transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onTaskClick(String(milestone.nativeId));
              }}
            >
              {milestone.title}
            </span>
            <span className="text-[11px] text-fg-subtle shrink-0">{milestone.key}</span>
            {childCount > 0 && (
              <span className="ml-1 text-[11px] text-fg-subtle shrink-0">
                {closedCount}/{childCount}
              </span>
            )}
          </div>
        </td>
        <td className="py-2.5 px-3 whitespace-nowrap">
          <TaskStatusPill task={milestone} />
        </td>
        <td className="py-2.5 px-3 text-[12px] text-fg-muted whitespace-nowrap font-medium">
          <DateCell iso={milestone.startDate} label="Start date" />
        </td>
        <td className="py-2.5 px-3 text-[12px] text-fg-muted whitespace-nowrap font-medium">
          <DateCell iso={milestone.dueDate} label="Target / due date" />
        </td>
        <td className="py-2.5 px-3 text-[12px] text-fg-muted whitespace-nowrap">
          {sprint ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-subtle text-fg-muted text-[11px]">
              {sprint}
            </span>
          ) : (
            <span className="text-fg-subtle">—</span>
          )}
        </td>
        <td className="py-2.5 px-3 text-[12px] text-fg-muted whitespace-nowrap">
          {milestone.assignee ? (
            <div className="flex items-center gap-1.5">
              <Avatar user={PEOPLE[milestone.assignee] || { name: milestone.assigneeName }} size="sm" />
              <span className="text-[12px]">{milestone.assigneeName || "—"}</span>
            </div>
          ) : (
            <span className="text-fg-subtle">—</span>
          )}
        </td>
        <td className="py-2.5 px-3">
          <ProgressBar done={milestone.percentageDone} />
        </td>
      </tr>

      {open &&
        childTasks.map((child) => (
          <ChildRow
            key={child.id}
            task={child}
            sprints={sprints}
            onClick={onTaskClick}
          />
        ))}

      {open && childCount === 0 && (
        <tr>
          <td colSpan={7} className="py-2 pl-10 text-[12px] text-fg-subtle italic">
            No child issues
          </td>
        </tr>
      )}

      {aiEnabled && (
        <tr>
          <td colSpan={7} className="pb-3 pl-10 pr-3">
            <div className="flex flex-wrap gap-2 mt-1">
              <AiSuggestButton
                mode="milestone-status"
                label="Draft status update"
                variant="copy"
                payload={{
                  milestoneTitle: milestone.title,
                  dueDate: milestone.dueDate || undefined,
                  percentDone: milestone.percentageDone ?? undefined,
                  childSummary: `${closedCount} of ${childCount} tasks complete`,
                }}
              />
              <AiSuggestButton
                mode="milestone-risk"
                label="Identify risks"
                variant="copy"
                payload={{
                  milestoneTitle: milestone.title,
                  dueDate: milestone.dueDate || undefined,
                  percentDone: milestone.percentageDone ?? undefined,
                  overdueItems,
                  blockedItems,
                }}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function MobileChildCard({ task, sprints, onClick }) {
  const sprint = sprintName(task, sprints);
  return (
    <button
      type="button"
      onClick={() => onClick(task.id)}
      className="w-full text-left rounded-md border border-border-soft bg-surface-app/50 px-3 py-2.5"
    >
      <div className="flex items-start gap-2 min-w-0">
        <TaskTypeIcon task={task} size={12} />
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] text-fg truncate">{task.title}</div>
          <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-fg-subtle">
            <span className="font-mono">{task.key}</span>
            {sprint ? <span className="truncate">{sprint}</span> : null}
          </div>
        </div>
        <TaskStatusPill task={task} />
      </div>
    </button>
  );
}

function MobileMilestoneCard({ milestone, childTasks, sprints, onTaskClick }) {
  const [open, setOpen] = useState(true);
  const { aiEnabled } = usePublicConfig();
  const sprint = sprintName(milestone, sprints);
  const childCount = childTasks.length;
  const closedCount = childTasks.filter((c) => c.statusIsClosed).length;
  const overdueItems = childTasks
    .filter((c) => !c.statusIsClosed && c.dueDate && c.dueDate < new Date().toISOString().slice(0, 10))
    .map((c) => c.title);
  const blockedItems = childTasks
    .filter((c) => !c.statusIsClosed && c.statusName?.toLowerCase().includes("block"))
    .map((c) => c.title);

  return (
    <div className="rounded-lg border border-border bg-surface-elevated overflow-hidden">
      <button
        type="button"
        className="w-full px-3 py-3 text-left hover:bg-surface-subtle"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-start gap-2">
          <ChevronRight
            size={14}
            className={cn("mt-0.5 shrink-0 text-fg-muted transition-transform", open && "rotate-90")}
          />
          <Flag size={13} className="mt-0.5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-fg truncate">{milestone.title}</div>
            <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-fg-subtle">
              <span className="font-mono">{milestone.key}</span>
              <span>{closedCount}/{childCount}</span>
              {sprint ? <span className="truncate">{sprint}</span> : null}
            </div>
          </div>
          <TaskStatusPill task={milestone} />
        </div>
      </button>

      <div className="px-3 pb-3">
        <div className="grid grid-cols-2 gap-2 text-[11px] text-fg-subtle mb-2">
          <span>Start: {formatAbsDate(milestone.startDate, "—")}</span>
          <span>Target: {formatAbsDate(milestone.dueDate, "—")}</span>
        </div>
        <ProgressBar done={milestone.percentageDone} />
      </div>

      {open && (
        <div className="border-t border-border-soft px-3 py-3 grid gap-2">
          {childTasks.length > 0 ? (
            childTasks.map((child) => (
              <MobileChildCard
                key={child.id}
                task={child}
                sprints={sprints}
                onClick={onTaskClick}
              />
            ))
          ) : (
            <div className="text-[12px] text-fg-subtle italic">No child issues</div>
          )}

          {aiEnabled && (
            <div className="flex flex-wrap gap-2 pt-1">
              <AiSuggestButton
                mode="milestone-status"
                label="Draft status update"
                variant="copy"
                payload={{
                  milestoneTitle: milestone.title,
                  dueDate: milestone.dueDate || undefined,
                  percentDone: milestone.percentageDone ?? undefined,
                  childSummary: `${closedCount} of ${childCount} tasks complete`,
                }}
              />
              <AiSuggestButton
                mode="milestone-risk"
                label="Identify risks"
                variant="copy"
                payload={{
                  milestoneTitle: milestone.title,
                  dueDate: milestone.dueDate || undefined,
                  percentDone: milestone.percentageDone ?? undefined,
                  overdueItems,
                  blockedItems,
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────

export function Milestones({ tasks, sprints, onTaskClick }) {
  // Parents = no parent WP themselves (epic === null / undefined)
  const parents = tasks.filter((t) => !t.epic);
  // Children = tasks that reference a parent
  const childMap = new Map();
  for (const t of tasks) {
    if (t.epic) {
      const key = String(t.epic);
      if (!childMap.has(key)) childMap.set(key, []);
      childMap.get(key).push(t);
    }
  }

  // Milestones are parents that either have children already, or any top-level WP.
  // Sort: open first, then by dueDate ascending (nulls last).
  const sorted = [...parents].sort((a, b) => {
    if (a.statusIsClosed !== b.statusIsClosed)
      return a.statusIsClosed ? 1 : -1;
    if (a.dueDate && b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });

  if (sorted.length === 0) {
    return (
      <EmptyState
        icon={Flag}
        title="No milestones"
        body="Work packages with no parent will appear here."
      />
    );
  }

  return (
    <>
      <div className="md:hidden grid gap-3">
        {sorted.map((milestone) => (
          <MobileMilestoneCard
            key={milestone.id}
            milestone={milestone}
            childTasks={childMap.get(String(milestone.nativeId)) || []}
            sprints={sprints}
            onTaskClick={onTaskClick}
          />
        ))}
      </div>

      <div className="hidden md:block rounded-lg border border-border overflow-hidden bg-surface-elevated">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-subtle">
              <th className="py-2.5 pl-3 pr-3 text-[11px] font-semibold text-fg-muted uppercase tracking-wider">
                Title
              </th>
              <th className="py-2.5 px-3 text-[11px] font-semibold text-fg-muted uppercase tracking-wider whitespace-nowrap">
                Status
              </th>
              <th className="py-2.5 px-3 text-[11px] font-semibold text-fg-muted uppercase tracking-wider whitespace-nowrap">
                Start
              </th>
              <th className="py-2.5 px-3 text-[11px] font-semibold text-fg-muted uppercase tracking-wider whitespace-nowrap">
                Target
              </th>
              <th className="py-2.5 px-3 text-[11px] font-semibold text-fg-muted uppercase tracking-wider whitespace-nowrap">
                Sprint
              </th>
              <th className="py-2.5 px-3 text-[11px] font-semibold text-fg-muted uppercase tracking-wider whitespace-nowrap">
                Assignee
              </th>
              <th className="py-2.5 px-3 text-[11px] font-semibold text-fg-muted uppercase tracking-wider whitespace-nowrap">
                Progress
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((milestone) => (
              <MilestoneRow
                key={milestone.id}
                milestone={milestone}
                childTasks={childMap.get(String(milestone.nativeId)) || []}
                sprints={sprints}
                onTaskClick={onTaskClick}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
