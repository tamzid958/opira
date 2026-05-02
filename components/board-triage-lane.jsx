"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/icons";
import { TaskTypeIcon } from "@/components/ui/task-meta";
import { PEOPLE } from "@/lib/data";
import { cn } from "@/lib/utils";

// "Tickets that need an owner" lane. Sits above the board and surfaces
// every open WP without an assignee in the visible scope so standup can
// walk the queue without scrolling the whole board. Empty → collapsed
// to a single thin row so the eye doesn't waste cycles on it.
//
// Click a triage chip to open the detail modal. Hover-action: assign
// menu via the right-click pattern (deferred — keep this lean for
// Wave 3 and let users use the existing context menu / `a` shortcut).
export function BoardTriageLane({ tasks, onTaskClick, onAssign, assignees = [] }) {
  const triage = (tasks || []).filter(
    (t) => !t.statusIsClosed && !t.assignee,
  );
  const count = triage.length;

  // Default: collapsed when empty, expanded when there's anything to
  // triage. Following the React 19 conditional-setState idiom (also used
  // in command-palette.jsx) so the prop change is reflected without a
  // separate effect → re-render commit.
  const [collapsed, setCollapsed] = useState(count === 0);
  const [prevCount, setPrevCount] = useState(count);
  if (count !== prevCount) {
    setPrevCount(count);
    if (count === 0) setCollapsed(true);
  }

  if (count === 0) return null;

  return (
    <div className="border-b border-border-soft bg-surface-elevated/60">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center gap-2 px-3 sm:px-6 py-2 text-left cursor-pointer hover:bg-surface-subtle transition-colors"
        aria-expanded={!collapsed}
      >
        <Icon
          name={collapsed ? "chev-right" : "chev-down"}
          size={12}
          className="text-fg-subtle"
          aria-hidden="true"
        />
        <span className="text-[12px] font-semibold uppercase tracking-wider text-fg-muted">
          Triage
        </span>
        <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10.5px] font-semibold tabular-nums bg-pri-medium/15 text-pri-medium">
          {count}
        </span>
        <span className="text-[12px] text-fg-subtle">
          unassigned · open
        </span>
        <span className="ml-auto text-[11px] text-fg-faint">
          {collapsed ? "Show" : "Hide"}
        </span>
      </button>
      {!collapsed && (
        <div className="px-3 sm:px-6 pb-3 flex gap-2 overflow-x-auto">
          {triage.map((t) => (
            <TriageChip
              key={t.id}
              task={t}
              onOpen={() => onTaskClick?.(t.id)}
              onAssignSelf={
                onAssign
                  ? () => {
                      // Re-use the bulk update pathway with a single id —
                      // assigning to "self" requires the page to know the
                      // current user, so we leave the actual assignee
                      // selection to a quick menu on the chip click.
                      onAssign(t);
                    }
                  : null
              }
              assignees={assignees}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TriageChip({ task, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${task.key} · ${task.title}`}
      className={cn(
        "shrink-0 flex items-center gap-2 px-2.5 h-8 rounded-md border border-border bg-surface-elevated cursor-pointer",
        "hover:border-border-strong hover:bg-surface-subtle transition-colors",
      )}
    >
      <TaskTypeIcon task={task} size={12} />
      <span className="font-mono text-[11px] text-fg-subtle">{task.key}</span>
      <span className="text-[12px] text-fg max-w-50 truncate">{task.title}</span>
      <Avatar user={null} size="sm" />
    </button>
  );
}
