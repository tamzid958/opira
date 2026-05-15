"use client";

import { useRef, useState } from "react";
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  isWeekend,
  max as dateMax,
  min as dateMin,
  startOfMonth,
} from "date-fns";
import { CalendarRange } from "lucide-react";
import { Icon } from "@/components/icons";
import { TaskTypeIcon } from "@/components/ui/task-meta";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingPill } from "@/components/ui/loading-pill";
import { PEOPLE } from "@/lib/data";
import { findById, safeParseISO as safeISO } from "@/lib/utils";
import { ratioOf } from "@/lib/openproject/task-state";

// ─── Layout constants ────────────────────────────────────────────
const ZOOM = {
  quarter: { day: 6, label: "Quarter" },
  month: { day: 14, label: "Month" },
  week: { day: 28, label: "Week" },
};

const ROW_RAIL = "w-[180px] sm:w-[220px] md:w-[280px] shrink-0";
const ROW_TASK_H = 28;
const ROW_GROUP_H = 36;
// Decorative separator on chart side for non-sprint group headers — much
// shorter than the rail header to keep dead space minimal.
const ROW_GROUP_BAND_H = 36;
const AXIS_H = 44;
// Auto-collapse groups with more rows than this so the page doesn't drown
// in 100+ rows on first load.
const AUTO_COLLAPSE_THRESHOLD = 8;
// Hard ceiling on rows visible in an expanded group; remainder hides
// behind a "Show all N" button.
const MAX_EXPANDED_ROWS = 25;
const MIN_BAR_WIDTH = 28;

const GROUP_OPTIONS = [
  { id: "sprint", label: "Sprint" },
  { id: "assignee", label: "Assignee" },
  { id: "status", label: "Status" },
  { id: "type", label: "Type" },
];

// ─── Helpers ─────────────────────────────────────────────────────

function pickAvatar(task, assignees) {
  if (!task.assignee) return null;
  return (
    findById(assignees, task.assignee) ||
    PEOPLE[task.assignee] ||
    { id: task.assignee, name: task.assigneeName || "Assignee" }
  );
}

function buildAxis(rangeStart, rangeEnd, dayPx) {
  const months = [];
  let cur = startOfMonth(rangeStart);
  while (cur <= rangeEnd) {
    const visStart = cur < rangeStart ? rangeStart : cur;
    const visEnd = endOfMonth(cur) > rangeEnd ? rangeEnd : endOfMonth(cur);
    const offsetDays = differenceInCalendarDays(visStart, rangeStart);
    const lengthDays = differenceInCalendarDays(visEnd, visStart) + 1;
    months.push({
      key: format(cur, "yyyy-MM"),
      label: format(cur, "MMM yyyy"),
      left: offsetDays * dayPx,
      width: lengthDays * dayPx,
    });
    cur = addMonths(cur, 1);
  }

  const totalDays = differenceInCalendarDays(rangeEnd, rangeStart) + 1;
  // Tick density adapts to zoom — labels never stack on each other.
  const tickEvery = dayPx >= 24 ? 1 : dayPx >= 12 ? 7 : 14;
  const ticks = [];
  for (let i = 0; i < totalDays; i += tickEvery) {
    const d = addDays(rangeStart, i);
    ticks.push({
      key: i,
      label: dayPx >= 24 ? format(d, "d") : format(d, "MMM d"),
      sub: dayPx >= 24 ? format(d, "EEEEE") : null,
      left: i * dayPx,
      isWeekend: isWeekend(d),
    });
  }

  // Weekend stripes — only at zoom levels that show day-level detail.
  const weekendBands = [];
  if (dayPx >= 12) {
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(rangeStart, i);
      if (isWeekend(d)) {
        weekendBands.push({ key: i, left: i * dayPx, width: dayPx });
      }
    }
  }

  return { months, ticks, totalDays, weekendBands };
}

function groupTasks(tasks, mode, { sprints, assignees }) {
  const out = new Map();
  const ensure = (key, label, extras = {}) => {
    if (!out.has(key)) out.set(key, { key, label, tasks: [], ...extras });
    return out.get(key);
  };

  if (mode === "sprint") {
    const sList = Array.isArray(sprints) ? sprints : [];
    for (const sp of sList) {
      ensure(`sp-${sp.id}`, sp.name?.split(" — ")[0] || sp.name || "Sprint", {
        sprint: sp,
        rank: sp.state === "active" ? 0 : sp.state === "planned" ? 1 : 2,
      });
    }
    for (const t of tasks) {
      const k = t.sprint != null ? `sp-${t.sprint}` : "sp-none";
      const g = ensure(k, k === "sp-none" ? "Without sprint" : "Sprint", {
        rank: k === "sp-none" ? 99 : 1,
      });
      if (k !== "sp-none" && !g.sprint) {
        const found = sList.find((s) => `sp-${s.id}` === k);
        if (found) g.sprint = found;
      }
      g.tasks.push(t);
    }
    return [...out.values()]
      .filter((g) => g.tasks.length > 0 || g.sprint)
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  }

  if (mode === "assignee") {
    for (const t of tasks) {
      const k = t.assignee ? `u-${t.assignee}` : "u-none";
      const user = findById(assignees, t.assignee);
      const label = user?.name || t.assigneeName || (k === "u-none" ? "Unassigned" : "User");
      ensure(k, label, {
        user: user || (t.assignee ? { id: t.assignee, name: label } : null),
      }).tasks.push(t);
    }
    return [...out.values()].sort((a, b) => {
      if (a.key === "u-none") return 1;
      if (b.key === "u-none") return -1;
      return a.label.localeCompare(b.label);
    });
  }

  if (mode === "status") {
    // Group by API statusId; closed statuses sort to the end (isClosed truth).
    for (const t of tasks) {
      const k = t.statusId ? `s-${t.statusId}` : "s-none";
      ensure(k, t.statusName || "—", {
        statusId: t.statusId || null,
        statusIsClosed: !!t.statusIsClosed,
        statusColor: t.statusColor || null,
      }).tasks.push(t);
    }
    return [...out.values()].sort((a, b) => {
      if ((a.statusIsClosed ? 1 : 0) !== (b.statusIsClosed ? 1 : 0)) {
        return a.statusIsClosed ? 1 : -1;
      }
      return a.label.localeCompare(b.label);
    });
  }

  if (mode === "type") {
    for (const t of tasks) {
      const k = t.typeId ? `t-${t.typeId}` : "t-none";
      ensure(k, t.typeName || "—", {
        typeId: t.typeId || null,
        typeName: t.typeName || null,
        typeColor: t.typeColor || null,
      }).tasks.push(t);
    }
    return [...out.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  return [];
}

function progressOf(tasks) {
  if (!tasks?.length) return { pct: 0, done: 0, total: 0 };
  let done = 0;
  for (const t of tasks) {
    done += ratioOf(t);
  }
  return {
    pct: Math.round((done / tasks.length) * 100),
    done: Math.round(done),
    total: tasks.length,
  };
}

// ─── Atoms ───────────────────────────────────────────────────────

function StatePill({ state }) {
  if (!state) return null;
  const tone =
    state === "active"
      ? "bg-accent-50 text-accent-700"
      : state === "planned"
      ? "bg-surface-app text-fg-muted ring-1 ring-inset ring-border"
      : "bg-surface-muted text-fg-faint";
  return (
    <span
      className={`inline-flex items-center px-1.5 h-4 rounded text-[9.5px] font-semibold uppercase tracking-wider ${tone}`}
    >
      {state}
    </span>
  );
}

function ProgressBar({ pct }) {
  const safe = Math.max(0, Math.min(100, pct));
  return (
    <div className="h-1 w-full rounded-full bg-surface-muted overflow-hidden">
      <span
        className="block h-full bg-accent transition-all"
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}

function TaskBar({ task, rangeStart, dayPx, assignees, onClick }) {
  const start = safeISO(task.startDate);
  const end = safeISO(task.dueDate);
  if (!start || !end) return null;
  const offsetDays = differenceInCalendarDays(start, rangeStart);
  const spanDays = Math.max(1, differenceInCalendarDays(end, start) + 1);
  const left = offsetDays * dayPx;
  const naturalWidth = spanDays * dayPx;
  const width = Math.max(MIN_BAR_WIDTH, naturalWidth);
  const avatar = pickAvatar(task, assignees);
  // Bar color: API status color when set, else neutral. Fill is binary —
  // closed = 100% done, otherwise 0% (no keyword-derived intermediate
  // progress states).
  const tint = task.statusColor || null;
  const tintStyle = tint
    ? {
        backgroundColor: `color-mix(in srgb, ${tint} 22%, transparent)`,
        color: tint,
      }
    : undefined;
  const klass = tint
    ? "ring-1 ring-inset"
    : "bg-status-todo-bg text-status-todo-fg";
  const pct = Math.round(ratioOf(task) * 100);
  const showAvatar = width >= 60 && avatar;
  const showLabel = width >= 80;
  return (
    <button
      type="button"
      onClick={() => onClick?.(task.id)}
      title={`${task.key} · ${task.title}\n${format(start, "MMM d")} → ${format(end, "MMM d")} (${spanDays}d)`}
      className={`group absolute top-1 bottom-1 inline-flex items-center gap-1.5 px-1.5 rounded-md text-[11px] font-medium overflow-hidden cursor-pointer ring-1 ring-inset ring-border-soft transition-all hover:ring-accent hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${klass}`}
      style={{ left, width, ...(tintStyle || {}) }}
    >
      {pct > 0 && pct < 100 && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 bg-black/10"
          style={{ width: `${pct}%` }}
        />
      )}
      {showAvatar && (
        <span className="relative shrink-0">
          <Avatar user={avatar} size="sm" />
        </span>
      )}
      {showLabel ? (
        <span className="relative truncate">
          <span className="font-mono text-[10px] opacity-60 mr-1">{task.key}</span>
          {task.title}
        </span>
      ) : (
        !showAvatar && (
          <span className="relative font-mono text-[9.5px] truncate">
            {task.key}
          </span>
        )
      )}
    </button>
  );
}

function SprintBand({ sprint, tasks, rangeStart, dayPx }) {
  const s = safeISO(sprint?.start);
  const e = safeISO(sprint?.end);
  if (!s || !e) return null;
  const left = differenceInCalendarDays(s, rangeStart) * dayPx;
  const spanDays = differenceInCalendarDays(e, s) + 1;
  const width = Math.max(dayPx, spanDays * dayPx);
  const tone =
    sprint.state === "active"
      ? "bg-accent-50/70 ring-accent-200"
      : sprint.state === "planned"
      ? "bg-surface-subtle ring-border"
      : "bg-surface-muted/60 ring-border-strong";
  const { pct } = progressOf(tasks);
  return (
    <div
      className={`absolute top-1.5 bottom-1.5 rounded-md ring-1 ring-inset overflow-hidden ${tone}`}
      style={{ left, width }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 bg-accent/15"
        style={{ width: `${pct}%` }}
      />
      {width > 90 && (
        <>
          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9.5px] font-semibold text-fg-muted">
            {format(s, "MMM d")}
          </span>
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9.5px] font-semibold text-fg-muted">
            {format(e, "MMM d")}
          </span>
        </>
      )}
    </div>
  );
}

// ─── Group rail leader ────────────────────────────────────────────

function GroupLeader({ group, mode, open, onToggle }) {
  const { tasks } = group;
  const { pct, done, total } = progressOf(tasks);
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-3 bg-surface-sunken hover:bg-surface-subtle cursor-pointer text-left border-b border-border"
      style={{ height: ROW_GROUP_H }}
    >
      <Icon
        name={open ? "chev-down" : "chev-right"}
        size={11}
        className="text-fg-subtle shrink-0"
        aria-hidden="true"
      />
      {mode === "assignee" && group.user && (
        <Avatar user={group.user} size="sm" />
      )}
      {mode === "status" && (
        <span
          aria-hidden="true"
          className="inline-block w-2 h-2 rounded-full shrink-0"
          style={{
            background:
              group.statusColor ||
              (group.statusIsClosed ? "var(--status-done)" : "var(--status-todo)"),
          }}
        />
      )}
      {mode === "type" && <TaskTypeIcon task={group} size={12} />}

      <span className="flex-1 min-w-0 text-[12px] font-semibold text-fg truncate">
        {group.label}
      </span>
      {mode === "sprint" && group.sprint && <StatePill state={group.sprint.state} />}
      <span className="shrink-0 inline-flex items-center gap-1.5 text-[10.5px] text-fg-faint tabular-nums">
        <span>
          {done}/{total}
        </span>
        <span className="hidden md:inline w-10">
          <ProgressBar pct={pct} />
        </span>
      </span>
    </button>
  );
}

// ─── Public ──────────────────────────────────────────────────────

export function Timeline({ tasks = [], sprints = [], assignees = [], onTaskClick, isLoading }) {
  const [zoom, setZoom] = useState("month");
  const [groupBy, setGroupBy] = useState("sprint");
  // Per-group open-state overrides. Absent → derived from auto rule (groups
  // larger than AUTO_COLLAPSE_THRESHOLD start collapsed). Present → user
  // explicitly toggled it.
  const [openOverrides, setOpenOverrides] = useState(() => new Map());
  const [expandedAll, setExpandedAll] = useState(() => new Set());
  const [showUndated, setShowUndated] = useState(false);
  const scrollRef = useRef(null);

  const dated = tasks.filter((t) => t.startDate && t.dueDate);
  const undated = tasks.filter((t) => !t.startDate || !t.dueDate);

  const { rangeStart, rangeEnd } = (() => {
    const dates = [];
    for (const t of dated) {
      const s = safeISO(t.startDate);
      const e = safeISO(t.dueDate);
      if (s) dates.push(s);
      if (e) dates.push(e);
    }
    for (const sp of Array.isArray(sprints) ? sprints : []) {
      const s = safeISO(sp.start);
      const e = safeISO(sp.end);
      if (s) dates.push(s);
      if (e) dates.push(e);
    }
    if (dates.length === 0) {
      const today = new Date();
      return { rangeStart: addDays(today, -14), rangeEnd: addDays(today, 21) };
    }
    return {
      rangeStart: addDays(dateMin(dates), -3),
      rangeEnd: addDays(dateMax(dates), 3),
    };
  })();

  const dayPx = ZOOM[zoom].day;
  const axis = buildAxis(rangeStart, rangeEnd, dayPx);
  const totalWidth = axis.totalDays * dayPx;

  const today = new Date();
  const todayLeft =
    today >= rangeStart && today <= rangeEnd
      ? differenceInCalendarDays(today, rangeStart) * dayPx
      : null;

  const groups = groupTasks(dated, groupBy, { sprints, assignees });

  const isOpen = (g) => {
    if (openOverrides.has(g.key)) return openOverrides.get(g.key);
    return g.tasks.length <= AUTO_COLLAPSE_THRESHOLD;
  };

  const jumpToToday = () => {
    if (!scrollRef.current || todayLeft == null) return;
    const el = scrollRef.current;
    el.scrollTo({
      left: Math.max(0, todayLeft - el.clientWidth / 2),
      behavior: "smooth",
    });
  };

  const toggleGroup = (g) =>
    setOpenOverrides((m) => {
      const n = new Map(m);
      n.set(g.key, !isOpen(g));
      return n;
    });

  const toggleExpandAll = (key) =>
    setExpandedAll((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  if (isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <LoadingPill label="loading timeline" />
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="px-6 py-10">
        <EmptyState
          icon={CalendarRange}
          title="Nothing to plan yet"
          body="Create work packages with start and due dates and they'll lay out as a timeline here."
        />
      </div>
    );
  }

  const visibleTasksFor = (g) => {
    if (expandedAll.has(g.key)) return g.tasks;
    if (g.tasks.length <= MAX_EXPANDED_ROWS) return g.tasks;
    return g.tasks.slice(0, MAX_EXPANDED_ROWS);
  };

  return (
    <div className="flex flex-col h-full bg-surface-elevated rounded-lg border border-border overflow-hidden">
      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2 border-b border-border bg-surface-elevated shrink-0 flex-wrap">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[12px] text-fg font-semibold tabular-nums">
            {format(rangeStart, "MMM d")} – {format(rangeEnd, "MMM d, yyyy")}
          </span>
          <span className="text-[11px] text-fg-faint">
            {dated.length} on chart
            {undated.length > 0 && ` · ${undated.length} undated`}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-fg-subtle">Group</span>
            <div className="inline-flex rounded-md border border-border bg-surface-elevated p-0.5">
              {GROUP_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setGroupBy(opt.id)}
                  className={`inline-flex items-center h-6 px-2 rounded text-[11px] font-medium cursor-pointer transition-colors ${
                    groupBy === opt.id
                      ? "bg-accent-50 text-accent-700"
                      : "text-fg-muted hover:text-fg"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={jumpToToday}
            disabled={todayLeft == null}
            className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border bg-surface-elevated text-[11.5px] font-medium text-fg-muted hover:bg-surface-subtle hover:text-fg cursor-pointer disabled:opacity-40 disabled:cursor-default"
            title={todayLeft == null ? "Today is outside the range" : "Scroll to today"}
          >
            <Icon name="calendar" size={12} aria-hidden="true" />
            Today
          </button>

          <div className="inline-flex rounded-md border border-border bg-surface-elevated p-0.5">
            {Object.entries(ZOOM).map(([key, def]) => (
              <button
                key={key}
                type="button"
                onClick={() => setZoom(key)}
                className={`inline-flex items-center h-6 px-2.5 rounded text-[11px] font-medium cursor-pointer transition-colors ${
                  zoom === key
                    ? "bg-accent-50 text-accent-700"
                    : "text-fg-muted hover:text-fg"
                }`}
              >
                {def.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left rail */}
        <div
          className={`${ROW_RAIL} border-r border-border bg-surface-elevated flex flex-col`}
        >
          <div
            className="flex items-end px-3 pb-2 bg-surface-sunken border-b border-border"
            style={{ height: AXIS_H }}
          >
            <span className="text-[10px] uppercase font-semibold tracking-wider text-fg-subtle">
              Work item
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {groups.map((g) => {
              const open = isOpen(g);
              const visible = visibleTasksFor(g);
              const hidden = g.tasks.length - visible.length;
              return (
                <div key={g.key}>
                  <GroupLeader
                    group={g}
                    mode={groupBy}
                    open={open}
                    onToggle={() => toggleGroup(g)}
                  />
                  {open && (
                    <>
                      {visible.map((t, i) => (
                        <button
                          type="button"
                          key={t.id}
                          onClick={() => onTaskClick?.(t.id)}
                          className={`w-full flex items-center gap-1.5 px-3 pl-7 text-left hover:bg-surface-subtle cursor-pointer ${
                            i % 2 === 1 ? "bg-surface-app/30" : ""
                          }`}
                          style={{ height: ROW_TASK_H }}
                          title={t.title}
                        >
                          <TaskTypeIcon task={t} size={11} />
                          <span className="font-mono text-[10px] text-fg-faint shrink-0">
                            {t.key}
                          </span>
                          <span className="truncate text-[12px] text-fg">
                            {t.title}
                          </span>
                        </button>
                      ))}
                      {hidden > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleExpandAll(g.key)}
                          className="w-full flex items-center gap-1.5 px-3 pl-7 text-[11px] font-medium text-accent-700 hover:bg-surface-subtle cursor-pointer border-b border-border-soft"
                          style={{ height: ROW_TASK_H }}
                        >
                          {expandedAll.has(g.key) ? "Show less" : `Show all ${g.tasks.length}`}
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
            {groups.length === 0 && (
              <div className="px-3 py-6 text-[12px] text-fg-subtle">
                No grouped items.
              </div>
            )}
          </div>
        </div>

        {/* Chart */}
        <div ref={scrollRef} className="flex-1 min-w-0 overflow-auto bg-surface-elevated">
          <div className="relative" style={{ width: totalWidth }}>
            {/* Axis */}
            <div
              className="sticky top-0 z-20 bg-surface-sunken border-b border-border"
              style={{ height: AXIS_H }}
              aria-hidden="true"
            >
              <div className="absolute inset-x-0 top-0 h-5 border-b border-border-soft">
                {axis.months.map((m) => (
                  <span
                    key={m.key}
                    className="absolute top-0 h-5 inline-flex items-center px-2 text-[10px] font-semibold uppercase tracking-wider text-fg-muted border-r border-border-soft"
                    style={{ left: m.left, width: m.width }}
                  >
                    {m.label}
                  </span>
                ))}
              </div>
              <div className="absolute inset-x-0 top-5 h-[calc(100%-1.25rem)]">
                {axis.ticks.map((t) => (
                  <span
                    key={t.key}
                    className={`absolute top-1 inline-flex flex-col items-center text-[9.5px] leading-tight ${
                      t.isWeekend ? "text-fg-faint" : "text-fg-subtle"
                    }`}
                    style={{ left: t.left }}
                  >
                    <span>{t.label}</span>
                    {t.sub && <span className="text-fg-faint">{t.sub}</span>}
                  </span>
                ))}
              </div>
            </div>

            {/* Body */}
            <div className="relative">
              {/* Weekend stripes + today line. */}
              <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
                {axis.weekendBands.map((b) => (
                  <span
                    key={b.key}
                    className="absolute top-0 bottom-0 bg-surface-app/40"
                    style={{ left: b.left, width: b.width }}
                  />
                ))}
                {/* Month-edge guides only — fewer vertical lines than per-tick. */}
                {axis.months.map((m) => (
                  <span
                    key={`g-${m.key}`}
                    className="absolute top-0 bottom-0 w-px bg-border-soft/60"
                    style={{ left: m.left }}
                  />
                ))}
                {todayLeft != null && (
                  <span
                    className="absolute top-0 bottom-0 w-px bg-pri-highest/80"
                    style={{ left: todayLeft }}
                  />
                )}
              </div>

              {/* Today pill — sticky to top of chart viewport. */}
              {todayLeft != null && (
                <div
                  className="sticky top-1 z-30 pointer-events-none"
                  style={{ height: 0 }}
                >
                  <span
                    className="inline-block -translate-x-1/2 px-1.5 py-0.5 rounded-full bg-pri-highest text-on-pri text-[9px] font-bold uppercase tracking-wider shadow-sm"
                    style={{ marginLeft: todayLeft }}
                  >
                    Today
                  </span>
                </div>
              )}

              {/* Rows */}
              {groups.map((g) => {
                const open = isOpen(g);
                const visible = visibleTasksFor(g);
                const hidden = g.tasks.length - visible.length;
                return (
                  <div key={g.key}>
                    <div
                      className="relative bg-surface-sunken border-b border-border"
                      style={{ height: groupBy === "sprint" ? ROW_GROUP_BAND_H : ROW_GROUP_H }}
                    >
                      {groupBy === "sprint" && g.sprint && (
                        <SprintBand
                          sprint={g.sprint}
                          tasks={g.tasks}
                          rangeStart={rangeStart}
                          dayPx={dayPx}
                        />
                      )}
                    </div>
                    {open && (
                      <>
                        {visible.map((t, i) => (
                          <div
                            key={t.id}
                            className={`relative hover:bg-surface-subtle ${
                              i % 2 === 1 ? "bg-surface-app/30" : ""
                            }`}
                            style={{ height: ROW_TASK_H }}
                          >
                            <TaskBar
                              task={t}
                              rangeStart={rangeStart}
                              dayPx={dayPx}
                              assignees={assignees}
                              onClick={onTaskClick}
                            />
                          </div>
                        ))}
                        {hidden > 0 && (
                          <div
                            className="border-b border-border-soft"
                            style={{ height: ROW_TASK_H }}
                          />
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Undated drawer ─────────────────────────────────────── */}
      {undated.length > 0 && (
        <div className="border-t border-border bg-surface-sunken shrink-0">
          <button
            type="button"
            onClick={() => setShowUndated((v) => !v)}
            className="w-full flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-surface-subtle"
          >
            <Icon
              name={showUndated ? "chev-down" : "chev-right"}
              size={11}
              className="text-fg-subtle"
              aria-hidden="true"
            />
            <span className="text-[11.5px] font-semibold text-fg">Without dates</span>
            <span className="text-[10.5px] text-fg-subtle tabular-nums">{undated.length}</span>
            <span className="ml-auto text-[10.5px] text-fg-faint">
              Set start &amp; due dates to plot
            </span>
          </button>
          {showUndated && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1 px-3 pb-2 max-h-48 overflow-y-auto">
              {undated.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onTaskClick?.(t.id)}
                  className="flex items-center gap-1.5 px-2 py-1 text-[12px] cursor-pointer rounded hover:bg-surface-elevated border border-transparent hover:border-border-soft text-left"
                >
                  <TaskTypeIcon task={t} size={11} />
                  <span className="font-mono text-[10px] text-fg-faint shrink-0">{t.key}</span>
                  <span className="flex-1 truncate text-fg">{t.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
