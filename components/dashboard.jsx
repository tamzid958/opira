"use client";

import { useMemo, useState } from "react";
import {
  addDays,
  differenceInCalendarDays,
  formatDistanceToNowStrict,
  isToday,
  isWithinInterval,
} from "date-fns";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/icons";
import { TaskStatusPill, TaskTypeIcon } from "@/components/ui/task-meta";
import { Eyebrow } from "@/components/ui/eyebrow";
import { useBurndown } from "@/lib/hooks/use-openproject-detail";
import { useEstimateMode } from "@/lib/hooks/use-estimate-mode";
import { unitFor, weightOf } from "@/lib/openproject/estimate";
import { cn, safeParseISO as safeISO } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// Helpers


function greetingFor(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return "Late night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function dueLabel(due, now) {
  if (!due) return "";
  if (isToday(due)) return "Due today";
  const diff = differenceInCalendarDays(due, now);
  if (diff < 0) {
    const abs = Math.abs(diff);
    return `Overdue by ${abs} ${abs === 1 ? "day" : "days"}`;
  }
  return `Due in ${diff} ${diff === 1 ? "day" : "days"}`;
}

// ─────────────────────────────────────────────────────────────────
// Sub-components — minimal, chrome-less, hairline-driven

function PulseCell({ label, value, hint, tone = "default", index = 0 }) {
  const valueColor =
    tone === "warning" ? "text-pri-medium" :
    tone === "danger"  ? "text-pri-highest" :
    "text-fg";
  return (
    <div
      style={{ "--i": index }}
      className="flex flex-col gap-2 px-4 py-4 sm:px-5 sm:py-5 border-r border-border-soft last:border-r-0"
    >
      <Eyebrow>{label}</Eyebrow>
      <div className={cn("font-display text-[28px] sm:text-[32px] font-semibold leading-none tracking-[-0.025em] tabular-nums", valueColor)}>
        {value}
      </div>
      {hint && <div className="text-[12px] text-fg-subtle leading-tight">{hint}</div>}
    </div>
  );
}

function TodayItem({ task, onClick, now }) {
  const due = safeISO(task.dueDate);
  const overdue = due && !isToday(due) && due < now;
  return (
    <li
      className="group flex items-center gap-3 px-4 py-3 border-b border-border-soft last:border-b-0 cursor-pointer transition-colors hover:bg-surface-subtle/60"
      onClick={() => onClick?.(task.id)}
    >
      <TaskTypeIcon task={task} size={14} />
      <span className="font-mono text-[11px] text-fg-faint shrink-0">{task.key}</span>
      <span className="flex-1 min-w-0 truncate text-[13.5px] text-fg">
        {task.title}
      </span>
      <TaskStatusPill task={task} />
      <span
        className={cn(
          "hidden sm:inline text-[11.5px] tabular-nums shrink-0 min-w-[88px] text-right",
          overdue ? "text-pri-highest font-medium" : "text-fg-subtle",
        )}
      >
        {dueLabel(due, now)}
      </span>
    </li>
  );
}

// Compact prev/next pager used by the Cadence and Top-assignees rails.
// Renders nothing when the list fits in a single page so empty/short
// projects don't show dead controls.
function SectionPager({ page, pageCount, label, onPrev, onNext }) {
  if (pageCount <= 1) return null;
  return (
    <div className="mt-2 flex items-center justify-between gap-2 px-1 text-[11.5px] text-fg-subtle">
      <span>{label}</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page === 0}
          onClick={onPrev}
          className="inline-flex items-center gap-1 h-6.5 px-2 rounded-md border border-border bg-surface-elevated text-[11.5px] font-medium text-fg hover:bg-surface-subtle hover:border-border-strong cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Icon name="chev-left" size={11} aria-hidden="true" />
          Previous
        </button>
        <button
          type="button"
          disabled={page >= pageCount - 1}
          onClick={onNext}
          className="inline-flex items-center gap-1 h-6.5 px-2 rounded-md border border-border bg-surface-elevated text-[11.5px] font-medium text-fg hover:bg-surface-subtle hover:border-border-strong cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
          <Icon name="chev-right" size={11} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

const CADENCE_PAGE_SIZE = 3;
const TOP_PAGE_SIZE = 4;

function CadenceCard({ sp, isActive, onOpen }) {
  const total = sp.taskCount ?? null;
  const done = sp.doneCount ?? null;
  const pct =
    total != null && done != null && total > 0 ? Math.round((done / total) * 100) : null;
  const stateLabel =
    sp.state === "active" ? "Active" :
    sp.state === "planned" ? "Planned" :
    sp.state === "closed" ? "Closed" : "—";
  const stateTone =
    sp.state === "active" ? "text-fg" :
    sp.state === "planned" ? "text-fg-muted" :
    "text-fg-subtle";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "luxe-card snap-start shrink-0 w-[260px] sm:w-[300px] text-left p-5 transition-colors",
        isActive && "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-4">
        <Eyebrow>{stateLabel}</Eyebrow>
        {isActive && (
          <span
            className="inline-block w-1.5 h-1.5 rounded-full bg-accent"
            aria-hidden="true"
          />
        )}
      </div>
      <div className={cn("font-display text-[18px] font-semibold leading-tight tracking-[-0.018em] truncate", stateTone)}>
        {sp.name?.split(" — ")[0] || sp.name}
      </div>
      <div className="mt-4 h-px bg-border-soft" />
      <div className="mt-3 flex items-baseline justify-between gap-2 text-[12px] text-fg-subtle">
        <span>{sp.start && sp.start !== "—" ? sp.start : "—"}</span>
        <span aria-hidden="true">→</span>
        <span>{sp.end && sp.end !== "—" ? sp.end : "—"}</span>
      </div>
      {pct != null && (
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-px bg-border-soft overflow-hidden">
            <div
              className="h-px bg-accent"
              style={{ width: `${Math.max(2, pct)}%` }}
            />
          </div>
          <span className="text-[11px] tabular-nums text-fg-subtle">{pct}%</span>
        </div>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sprint health — trend pill + scope-change pip + % done. Reads the
// burndown for the active sprint; degrades silently when the sprint
// has no committed scope or no dates.

function SprintHealthTile({ projectId, activeSprint }) {
  const enabled = !!projectId && !!activeSprint?.id;
  const q = useBurndown(projectId, activeSprint?.id, enabled);
  if (!activeSprint) return null;

  const data = q.data || {};
  const unit = data.unit || "pts";
  const committed = data.committedAtStart || data.totalCommitted || 0;
  const lastRemaining = data.points?.[data.points.length - 1]?.remaining ?? committed;
  const donePct = committed > 0
    ? Math.max(0, Math.min(100, Math.round(((committed - lastRemaining) / committed) * 100)))
    : 0;

  const start = safeISO(activeSprint.start);
  const end = safeISO(activeSprint.end);
  const today = new Date();
  let trend = "neutral";
  let trendLabel = "On track";
  if (start && end && committed > 0 && data.points?.length) {
    const totalDays = Math.max(1, differenceInCalendarDays(end, start));
    const elapsed = Math.max(0, Math.min(totalDays, differenceInCalendarDays(today, start)));
    const idealRemaining = committed * (1 - elapsed / totalDays);
    const delta = lastRemaining - idealRemaining;
    if (delta > 0.5) {
      trend = "warn";
      trendLabel = `${Math.round(delta)} ${unit} behind`;
    } else if (delta < -0.5) {
      trend = "good";
      trendLabel = `${Math.round(-delta)} ${unit} ahead`;
    }
  } else if (committed === 0) {
    trendLabel = "No commit";
  }

  const added = data.addedAfterStart?.points || 0;
  const removed = data.removedAfterStart?.points || 0;
  const scopeChanged = added > 0 || removed > 0;

  const trendCls =
    trend === "warn"
      ? "bg-status-blocked-bg text-status-blocked-fg"
      : trend === "good"
      ? "bg-status-done-bg text-status-done-fg"
      : "bg-surface-muted text-fg-muted";

  return (
    <div className="luxe-card px-5 py-4 grid gap-3" data-stagger>
      <div className="flex items-baseline justify-between gap-2">
        <span className="eyebrow truncate" title={activeSprint.name}>
          Sprint health · {activeSprint.name?.split(" — ")[0] || "Active sprint"}
        </span>
        <span
          className={`inline-flex items-center px-1.5 h-5 rounded text-[10px] font-bold tabular-nums ${trendCls}`}
        >
          {trendLabel}
        </span>
      </div>
      <div className="flex items-end gap-4">
        <div className="font-display text-[28px] sm:text-[32px] font-semibold tracking-[-0.024em] text-fg leading-none tabular-nums">
          {donePct}%
        </div>
        <div className="text-[11px] text-fg-subtle leading-snug pb-1">
          {committed - lastRemaining} of {committed} {unit} done
        </div>
        <div className="ml-auto flex flex-col items-end gap-1 text-[11px] text-fg-subtle">
          {scopeChanged ? (
            <span className="inline-flex items-center gap-1">
              <Icon name="rotate-ccw" size={11} aria-hidden="true" />
              {added > 0 ? `+${added}` : ""}
              {added > 0 && removed > 0 ? " / " : ""}
              {removed > 0 ? `−${removed}` : ""} {unit} scope change
            </span>
          ) : (
            <span className="text-fg-faint">Scope stable</span>
          )}
          {q.isLoading && <span className="text-fg-faint">Loading…</span>}
        </div>
      </div>
      <div className="relative h-1.5 rounded-full bg-surface-muted overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${donePct}%` }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main

export function Dashboard({
  project,
  currentUser,
  activeSprint,
  sprints = [],
  tasks = [],
  onTaskClick,
  onChangeView,
}) {
  const myId = currentUser?.id;
  const firstName = currentUser?.name?.split(" ")[0] || "there";
  const today = useMemo(() => new Date(), []);
  // Schema-anchored estimation mode. Drives weightOf on every assignee
  // tally + my-open-work sum, plus the unit suffix on the chrome so a
  // t-shirt project doesn't read "27 d" or sum stray date weights into
  // its points totals.
  const estimateModeQ = useEstimateMode(project?.id);
  const mode = estimateModeQ.mode || "numeric";
  const unit = unitFor(mode);
  // Pagination state for the two long rails on this page. Both default
  // to page 0 (latest / leaders) and walk in fixed-size windows so the
  // page lands quietly even on projects with deep sprint history or
  // large teams.
  const [cadencePage, setCadencePage] = useState(0);
  const [topPage, setTopPage] = useState(0);

  // Slices — three numbers + one focus list + a top-assignees roll-up.
  const openTasks = useMemo(() => tasks.filter((t) => !t.statusIsClosed), [tasks]);
  const myOpen = useMemo(
    () => (myId ? openTasks.filter((t) => t.assignee === myId) : []),
    [openTasks, myId],
  );

  // Every assignee with open work, sorted by leaders first. Paginated in
  // the render below so the rail stays compact regardless of team size.
  const topAssignees = useMemo(() => {
    const tally = new Map();
    for (const t of openTasks) {
      if (!t.assignee) continue;
      const ent = tally.get(t.assignee) || {
        id: t.assignee,
        name: t.assigneeName || "—",
        count: 0,
        points: 0,
      };
      ent.count += 1;
      ent.points += weightOf(t, { mode });
      tally.set(t.assignee, ent);
    }
    return [...tally.values()].sort((a, b) => b.count - a.count);
  }, [openTasks, mode]);
  // Drive the bar by story points when at least one assignee has any
  // estimate; otherwise fall back to open-issue count so the section
  // still says something visually on a project that hasn't sized work
  // yet. The leader's value (max across the visible top-5) is the
  // baseline — every other bar is a fraction of it.
  const topMaxPoints = topAssignees.reduce((m, a) => Math.max(m, a.points || 0), 0);
  const topMaxCount = topAssignees[0]?.count || 0;
  const useTopPoints = topMaxPoints > 0;
  const topPageCount = Math.max(
    1,
    Math.ceil(topAssignees.length / TOP_PAGE_SIZE),
  );
  const safeTopPage = Math.min(topPage, topPageCount - 1);
  const visibleTopAssignees = topAssignees.slice(
    safeTopPage * TOP_PAGE_SIZE,
    safeTopPage * TOP_PAGE_SIZE + TOP_PAGE_SIZE,
  );
  const topRangeStart = safeTopPage * TOP_PAGE_SIZE + 1;
  const topRangeEnd = Math.min(
    safeTopPage * TOP_PAGE_SIZE + TOP_PAGE_SIZE,
    topAssignees.length,
  );

  const { dueToday, overdue, focus } = useMemo(() => {
    const dt = [];
    const od = [];
    for (const t of tasks) {
      if (t.statusIsClosed) continue;
      const due = safeISO(t.dueDate);
      if (!due) continue;
      if (due < today && !isToday(due)) {
        od.push({ t, due });
      } else if (isToday(due)) {
        dt.push({ t, due });
      } else if (isWithinInterval(due, { start: today, end: addDays(today, 3) })) {
        // Pull "next 3 days" into the focus tail so the section is never
        // empty just because today happens to be quiet.
        dt.push({ t, due });
      }
    }
    od.sort((a, b) => a.due - b.due);
    dt.sort((a, b) => a.due - b.due);
    const fcs = [
      ...od.map((x) => ({ ...x, group: "overdue" })),
      ...dt.map((x) => ({ ...x, group: "today" })),
    ].slice(0, 8);
    return { dueToday: dt, overdue: od, focus: fcs };
  }, [tasks, today]);

  // Sprint context for the hero eyebrow.
  const sprintInfo = useMemo(() => {
    if (!activeSprint) return null;
    const start = safeISO(activeSprint.start);
    const end = safeISO(activeSprint.end);
    if (!start || !end) return { name: activeSprint.name?.split(" — ")[0] };
    const totalDays = Math.max(1, differenceInCalendarDays(end, start) + 1);
    const dayIn = Math.min(
      totalDays,
      Math.max(1, differenceInCalendarDays(today, start) + 1),
    );
    const endsIn = (() => {
      try { return formatDistanceToNowStrict(end, { addSuffix: true }); }
      catch { return null; }
    })();
    return {
      name: activeSprint.name?.split(" — ")[0],
      dayIn,
      totalDays,
      endsIn,
    };
  }, [activeSprint, today]);

  // Sprint roadmap — annotate each sprint with its task counts so the
  // Cadence rail can render a one-line progress bar without re-running
  // the slicing logic for every card. Paginated in the render below.
  const cadence = useMemo(() => {
    const rank = (s) =>
      s.state === "active" ? 0 : s.state === "planned" ? 1 : 2;
    return [...sprints]
      .map((sp) => {
        const inSprint = tasks.filter((t) => t.sprint === sp.id);
        const done = inSprint.filter((t) => t.statusIsClosed).length;
        return { ...sp, taskCount: inSprint.length, doneCount: done };
      })
      .sort((a, b) => {
        if (rank(a) !== rank(b)) return rank(a) - rank(b);
        return (a.start || "").localeCompare(b.start || "");
      });
  }, [sprints, tasks]);
  const cadencePageCount = Math.max(
    1,
    Math.ceil(cadence.length / CADENCE_PAGE_SIZE),
  );
  const safeCadencePage = Math.min(cadencePage, cadencePageCount - 1);
  const visibleCadence = cadence.slice(
    safeCadencePage * CADENCE_PAGE_SIZE,
    safeCadencePage * CADENCE_PAGE_SIZE + CADENCE_PAGE_SIZE,
  );
  const cadenceRangeStart = safeCadencePage * CADENCE_PAGE_SIZE + 1;
  const cadenceRangeEnd = Math.min(
    safeCadencePage * CADENCE_PAGE_SIZE + CADENCE_PAGE_SIZE,
    cadence.length,
  );

  const headlineTone = overdue.length > 0
    ? `${overdue.length} overdue · ${myOpen.length} on your plate`
    : myOpen.length > 0
    ? `${myOpen.length} ${myOpen.length === 1 ? "task" : "tasks"} on your plate today`
    : "Nothing pressing — a good day to ship something polished.";

  return (
    <div className="min-w-0">
      {/* ── HEADER ───────────────────────────────────────────────
          Same chrome rhythm as Board / Backlog / Reports — title +
          meta chips on a hairline-bottomed surface. The personalized
          greeting lives in the subtitle, not the hero, so the page
          reads as one of the app's tabs rather than a separate site. */}
      <div className="-mx-3 sm:-mx-6 mb-5 px-3 sm:px-6 pt-3.5 pb-3 bg-surface-elevated border-b border-border-soft">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="font-display text-[24px] font-semibold tracking-[-0.022em] text-fg m-0">
              {greetingFor()}, {firstName}
            </h1>
            <p className="mt-1 text-[13px] text-fg-subtle leading-snug">
              {headlineTone}
              {sprintInfo?.endsIn && activeSprint && (
                <>
                  {" · "}Sprint ends{" "}
                  <span className="text-fg-muted">{sprintInfo.endsIn}</span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onChangeView?.("backlog")}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-surface-elevated text-[13px] font-medium text-fg hover:bg-surface-subtle hover:border-border-strong transition-colors"
            >
              Backlog
            </button>
            <button
              type="button"
              onClick={() => onChangeView?.("board")}
              className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md bg-accent text-on-accent text-[12.5px] font-semibold transition-transform hover:-translate-y-px hover:bg-accent-600"
            >
              Open board
              <Icon name="arrow-up" size={12} className="rotate-90" aria-hidden="true" />
            </button>
          </div>
        </div>
        {sprintInfo && (
          <div className="mt-2 flex items-center gap-2 text-[11.5px] text-fg-subtle">
            <Icon name="folder" size={11} aria-hidden="true" />
            <span>{project?.name || "Workspace"}</span>
            <span className="text-fg-faint">·</span>
            <span>{sprintInfo.name || "Sprint"}</span>
            {sprintInfo.dayIn && sprintInfo.totalDays && (
              <>
                <span className="text-fg-faint">·</span>
                <span>Day {sprintInfo.dayIn} of {sprintInfo.totalDays}</span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="max-w-[1180px] mx-auto pb-10 grid gap-5 sm:gap-6">
        {/* ── PULSE ────────────────────────────────────────────── */}
        <section>
          <Eyebrow className="mb-2 px-1">Pulse</Eyebrow>
          <div data-stagger className="luxe-card grid grid-cols-3 overflow-hidden">
            <PulseCell
              index={0}
              label="Open"
              value={openTasks.length}
              hint={
                openTasks.length === 0
                  ? "All clear."
                  : `${tasks.length - openTasks.length} of ${tasks.length} closed`
              }
            />
            <PulseCell
              index={1}
              label="Assigned to you"
              value={myOpen.length}
              hint={
                myOpen.length === 0
                  ? "Inbox zero."
                  : `${myOpen.reduce((s, t) => s + weightOf(t, { mode }), 0)} ${unit === "d" ? "working days" : "story points"}`
              }
              tone={myOpen.length > 5 ? "warning" : "default"}
            />
            <PulseCell
              index={2}
              label="Overdue"
              value={overdue.length}
              hint={
                overdue.length === 0
                  ? "Nothing past due."
                  : `Oldest ${dueLabel(overdue[0]?.due, today).toLowerCase()}`
              }
              tone={overdue.length > 0 ? "danger" : "default"}
            />
          </div>
        </section>

        {activeSprint && (
          <section>
            <SprintHealthTile
              projectId={project?.id}
              activeSprint={activeSprint}
            />
          </section>
        )}

        {/* ── TODAY ────────────────────────────────────────────── */}
        <section>
          <div className="flex items-baseline justify-between mb-2 px-1">
            <Eyebrow>Today &amp; the next three days</Eyebrow>
            {focus.length > 0 && (
              <span className="text-[11.5px] text-fg-subtle">
                {focus.length} {focus.length === 1 ? "item" : "items"}
              </span>
            )}
          </div>
          {focus.length === 0 ? (
            <div className="luxe-card px-5 py-7 text-center">
              <h3 className="font-display text-[16px] font-semibold tracking-[-0.018em] text-fg m-0">
                A clear horizon
              </h3>
              <p className="mt-2 text-[13px] text-fg-subtle">
                No deadlines in the next three days. Use the lull to refine the backlog.
              </p>
            </div>
          ) : (
            <ul className="luxe-card overflow-hidden m-0 p-0 list-none">
              {focus.map(({ t, due }, i) => {
                const showHeader =
                  i === 0 ||
                  (focus[i - 1].group !== "overdue" && focus[i].group === "overdue") ||
                  (focus[i - 1].group !== "today" && focus[i].group === "today");
                return (
                  <div key={t.id}>
                    {showHeader && (
                      <div className="px-4 pt-3 pb-1 bg-surface-subtle/50 border-b border-border-soft">
                        <Eyebrow>
                          {focus[i].group === "overdue"
                            ? `Overdue (${overdue.length})`
                            : `Due soon (${dueToday.length})`}
                        </Eyebrow>
                      </div>
                    )}
                    <TodayItem task={t} onClick={onTaskClick} now={today} />
                  </div>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── TOP ASSIGNEES ────────────────────────────────────── */}
        {topAssignees.length > 0 && (
          <section>
            <div className="flex items-baseline justify-between mb-2 px-1">
              <Eyebrow>
                {useTopPoints
                  ? unit === "d"
                    ? "Working days by member"
                    : "Story points by member"
                  : "Top assignees"}
              </Eyebrow>
              <button
                type="button"
                onClick={() => onChangeView?.("members")}
                className="text-[11.5px] text-fg-subtle hover:text-fg transition-colors"
              >
                See team →
              </button>
            </div>
            <ul className="luxe-card overflow-hidden m-0 p-0 list-none">
              {visibleTopAssignees.map((a) => {
                const pct = useTopPoints
                  ? topMaxPoints > 0
                    ? Math.max(2, ((a.points || 0) / topMaxPoints) * 100)
                    : 0
                  : topMaxCount > 0
                  ? Math.max(2, (a.count / topMaxCount) * 100)
                  : 0;
                return (
                  <li
                    key={a.id}
                    className="flex items-center gap-3 px-4 py-3 border-b border-border-soft last:border-b-0"
                  >
                    <Avatar user={a} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] text-fg truncate leading-tight">
                        {a.name}
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-surface-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent transition-[width] duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right shrink-0 min-w-16">
                      <div className="font-display text-[16px] font-semibold tabular-nums text-fg leading-none">
                        {useTopPoints ? a.points || 0 : a.count}
                      </div>
                      <div className="text-[10.5px] text-fg-faint mt-1 uppercase tracking-[0.12em]">
                        {useTopPoints
                          ? `${unit} · ${a.count} open`
                          : a.count === 1
                          ? "open"
                          : "open"}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <SectionPager
              page={safeTopPage}
              pageCount={topPageCount}
              label={`Showing ${topRangeStart}–${topRangeEnd} of ${topAssignees.length}`}
              onPrev={() => setTopPage((p) => Math.max(0, p - 1))}
              onNext={() => setTopPage((p) => Math.min(topPageCount - 1, p + 1))}
            />
          </section>
        )}

        {/* ── CADENCE ──────────────────────────────────────────── */}
        {cadence.length > 0 && (
          <section>
            <div className="flex items-baseline justify-between mb-2 px-1">
              <Eyebrow>Cadence</Eyebrow>
              <button
                type="button"
                onClick={() => onChangeView?.("backlog")}
                className="text-[11.5px] text-fg-subtle hover:text-fg transition-colors"
              >
                See all sprints →
              </button>
            </div>
            <div className="board-scroller -mx-3 sm:-mx-6 px-3 sm:px-6 pb-2 flex gap-4 overflow-x-auto">
              {visibleCadence.map((sp) => (
                <CadenceCard
                  key={sp.id}
                  sp={sp}
                  isActive={activeSprint?.id === sp.id}
                  onOpen={() => onChangeView?.("backlog")}
                />
              ))}
            </div>
            <SectionPager
              page={safeCadencePage}
              pageCount={cadencePageCount}
              label={`Showing ${cadenceRangeStart}–${cadenceRangeEnd} of ${cadence.length} sprints`}
              onPrev={() => setCadencePage((p) => Math.max(0, p - 1))}
              onNext={() =>
                setCadencePage((p) => Math.min(cadencePageCount - 1, p + 1))
              }
            />
          </section>
        )}
      </div>
    </div>
  );
}
