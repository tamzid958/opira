"use client";

import { useMemo, useState } from "react";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { Avatar } from "@/components/ui/avatar";
import { LoadingPill } from "@/components/ui/loading-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icons";
import { TaskTypeIcon } from "@/components/ui/task-meta";
import { PaginationFooter } from "@/components/ui/pagination-footer";
import { useBurndown, useVelocity } from "@/lib/hooks/use-openproject-detail";
import { workingDaySet } from "@/lib/openproject/working-days";
import { formatEstimate, weightOf } from "@/lib/openproject/estimate";
import { safeParseISO } from "@/lib/utils";

const PAGE_SIZE_DEFAULT = 10;

// ─────────────────────────────────────────────────────────────────
// Best-effort affordance — a small ⓘ next to a panel title that
// surfaces a "this data is reconstructed from journals" disclosure
// on hover/focus. Reuses the group/peer pattern from
// components/ui/permission-tooltip.jsx so we stay token-consistent
// without introducing a new tooltip primitive.

function BestEffort({ children = "Reconstructed from OpenProject activity history. Events older than your data retention window may be missing." }) {
  return (
    <span
      className="relative inline-flex items-center group cursor-help align-middle ml-1.5"
      tabIndex={0}
    >
      <Icon name="info" size={12} aria-hidden="true" />
      <span className="absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 px-2.5 py-1.5 rounded-md bg-fg text-white text-[11px] leading-snug w-64 text-center pointer-events-none opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus:opacity-100 z-1100">
        {children}
      </span>
    </span>
  );
}

// Walk the inclusive [start, end] range and tag each day with whether it's
// a working day under the configured mask. Returns parallel arrays for
// indices, days, and a running working-day count so the chart math can
// step the ideal line.
function buildSprintCalendar(startIso, endIso) {
  const wd = workingDaySet();
  const out = [];
  if (!startIso || !endIso || startIso === "—" || endIso === "—") {
    return { days: out, totalWorkingDays: 0 };
  }
  const start = parseISO(startIso);
  const end = parseISO(endIso);
  let workingSeen = 0;
  for (
    let d = new Date(start);
    d.getTime() <= end.getTime();
    d.setDate(d.getDate() + 1)
  ) {
    const isWorking = wd.has(d.getUTCDay());
    if (isWorking) workingSeen += 1;
    out.push({
      iso: d.toISOString().slice(0, 10),
      isWorkingDay: isWorking,
      workingSeen,
    });
  }
  return { days: out, totalWorkingDays: workingSeen };
}

// ─────────────────────────────────────────────────────────────────
// Shared chrome — every panel reads as the same surface, just with
// different content. Variants match the existing luxury-theme tokens
// so dark/light theme tracking is automatic.

const PANEL = "luxe-card overflow-hidden";
const PANEL_HEADER =
  "flex items-center flex-wrap gap-3 px-5 py-3.5 border-b border-border-soft";
const PANEL_TITLE =
  "font-display font-semibold text-[16px] tracking-[-0.018em] text-fg m-0 leading-none";
const PANEL_SUB = "text-xs text-fg-subtle";
const PANEL_LEGEND = "ml-auto flex items-center gap-3 text-xs text-fg-subtle";
const SWATCH = "inline-block w-2.5 h-2.5 rounded-sm align-middle mr-1.5";
const KPI_VALUE =
  "font-display text-[28px] sm:text-[32px] font-semibold tracking-[-0.024em] text-fg leading-none mt-2 tabular-nums";
const KPI_SUB = "text-[11px] text-fg-subtle mt-1.5 leading-snug";

const OPEN_SEGMENT_COLOR = "var(--status-todo)";
const CLOSED_SEGMENT_COLOR = "var(--status-done)";

// ─────────────────────────────────────────────────────────────────
// KPI tile — the small summary card that headlines a metric. The
// optional `delta` is rendered as a tiny coloured chip; positive
// numbers go green for "good" metrics and red for "bad" metrics
// (caller passes `goodDirection`).

function KpiTile({ label, value, sub, delta, deltaSuffix = "", goodDirection = "up" }) {
  let chipClass = "";
  let chipText = null;
  if (delta != null && Number.isFinite(delta) && delta !== 0) {
    const isPositive = delta > 0;
    const isGood = goodDirection === "up" ? isPositive : !isPositive;
    chipClass = isGood
      ? "bg-status-done-bg text-status-done-fg"
      : "bg-status-blocked-bg text-status-blocked-fg";
    chipText = `${isPositive ? "+" : ""}${delta}${deltaSuffix}`;
  }
  return (
    <div className="luxe-card px-4 sm:px-5 py-4">
      <div className="flex items-start justify-between gap-2">
        <div className="eyebrow truncate" title={label}>
          {label}
        </div>
        {chipText && (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums ${chipClass}`}
            aria-label={`Change ${chipText}`}
          >
            {chipText}
          </span>
        )}
      </div>
      <div className={KPI_VALUE}>{value}</div>
      {sub && <div className={KPI_SUB}>{sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sparkline — small inline trend indicator used inside KPIs and the
// throughput panel. Self-scales to its values; renders nothing for
// fewer than 2 points.

function Sparkline({ values, height = 36, color = "var(--accent)", fill = true }) {
  if (!Array.isArray(values) || values.length < 2) {
    return <div className="text-[11px] text-fg-faint">Not enough data</div>;
  }
  const W = 120;
  const H = height;
  const PAD = 3;
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const span = Math.max(1, max - min);
  const xAt = (i) => PAD + (i / (values.length - 1)) * (W - PAD * 2);
  const yAt = (v) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const linePath = values.map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(v)}`).join(" ");
  const areaPath = `${linePath} L ${xAt(values.length - 1)} ${H - PAD} L ${xAt(0)} ${H - PAD} Z`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full h-auto block"
      aria-hidden="true"
    >
      {fill && <path d={areaPath} fill={color} fillOpacity="0.12" />}
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xAt(values.length - 1)} cy={yAt(values[values.length - 1])} r="2.5" fill={color} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────
// Donut — compact pie used by the status-distribution panel. Empty
// data renders a quiet placeholder ring so the layout doesn't pop.

function Donut({ segments, size = 168, thickness = 22, centerLabel, centerSub }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  let offset = 0;
  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label="Status distribution">
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="var(--border-soft)"
          strokeWidth={thickness}
        />
        {total > 0 &&
          segments.map((s) => {
            const fraction = s.value / total;
            const dash = fraction * C;
            const el = (
              <circle
                key={s.key}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${cx} ${cy})`}
              />
            );
            offset += dash;
            return el;
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="font-display text-[26px] font-semibold tracking-[-0.022em] text-fg leading-none tabular-nums">
          {centerLabel}
        </div>
        {centerSub && <div className="text-[11px] text-fg-subtle mt-1">{centerSub}</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Burndown — ideal vs. remaining over the sprint window.

function Burndown({ projectId, sprint }) {
  const q = useBurndown(projectId, sprint?.id, !!projectId && !!sprint?.id);
  const calendar = useMemo(
    () => buildSprintCalendar(sprint?.start, sprint?.end),
    [sprint?.start, sprint?.end],
  );

  if (q.isLoading) {
    return (
      <div className={PANEL}>
        <div className={PANEL_HEADER}>
          <h3 className={PANEL_TITLE}>
            Sprint burndown
            <BestEffort />
          </h3>
          <LoadingPill label="reconstructing from activities" />
        </div>
      </div>
    );
  }

  const data = q.data || {
    points: [],
    totalCommitted: 0,
    committedAtStart: 0,
    sprint: {},
  };
  // Anchor the chart to scope as of sprint.start so the line doesn't silently
  // rewrite when work is added/removed mid-sprint. Falls back to current
  // total when the API didn't compute a baseline.
  const totalPts = data.committedAtStart || data.totalCommitted || 0;
  const unit = data.unit || "pts";
  const days =
    sprint?.start && sprint?.end && sprint.start !== "—"
      ? Math.max(1, differenceInCalendarDays(parseISO(sprint.end), parseISO(sprint.start)))
      : 14;

  const W = 760;
  const H = 280;
  const PAD_L = 44;
  const PAD_R = 20;
  const PAD_T = 18;
  const PAD_B = 30;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const xAt = (i) => PAD_L + (i / Math.max(days, 1)) * innerW;
  const yAt = (pts) => PAD_T + (1 - pts / Math.max(totalPts, 1)) * innerH;

  // Working-days-aware ideal: the line only descends on working days, so
  // weekends render as horizontal segments. Falls back to a straight line
  // when the calendar is empty (no sprint dates).
  const idealPath = (() => {
    if (!calendar.days.length || calendar.totalWorkingDays === 0) {
      return `M ${xAt(0)} ${yAt(totalPts)} L ${xAt(days)} ${yAt(0)}`;
    }
    const segs = [`M ${xAt(0)} ${yAt(totalPts)}`];
    calendar.days.forEach((d, i) => {
      const remaining = totalPts * (1 - d.workingSeen / calendar.totalWorkingDays);
      segs.push(`L ${xAt(i + 1)} ${yAt(remaining)}`);
    });
    return segs.join(" ");
  })();
  const actualLine = (data.points || [])
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(p.remaining)}`)
    .join(" ");
  // Day indices that are non-working — used to paint a faint band so the
  // viewer can see weekends/holidays at a glance.
  const nonWorkingIdx = calendar.days
    .map((d, i) => (d.isWorkingDay ? -1 : i))
    .filter((i) => i >= 0);
  const actualArea = (data.points || []).length > 0
    ? `${actualLine} L ${xAt((data.points || []).length - 1)} ${yAt(0)} L ${xAt(0)} ${yAt(0)} Z`
    : "";
  const todayIdx = (data.points || []).length - 1;
  const lastRemaining = data.points?.[todayIdx]?.remaining;
  const projectedDelta =
    lastRemaining != null && totalPts > 0 && todayIdx >= 0
      ? lastRemaining - totalPts * (1 - todayIdx / Math.max(days, 1))
      : null;

  // Baseline-source signal:
  //   "timestamps"     — clean snapshot, the displayed numbers are exact.
  //   "fallback"       — OP install lacks the time-travel filter; the
  //                      baseline is journal-derived.
  //   "fallback-empty" — OP returned zero WPs at sprint-start EOD (planning
  //                      hasn't happened yet OR the time-travel filter
  //                      mis-reports for this version). We fall back to
  //                      the journal path and use current scope as the
  //                      "committed at start" display.
  // In either fallback path the user gets a "approx" affordance so they
  // know not to read the numbers as authoritative.
  const baselineApprox = data.baselineSource && data.baselineSource !== "timestamps";

  return (
    <div className={PANEL}>
      <div className={PANEL_HEADER}>
        <h3 className={PANEL_TITLE}>
          Sprint burndown
          {baselineApprox && (
            <BestEffort>
              {data.baselineSource === "fallback-empty"
                ? "OpenProject reported zero work packages at sprint-start (planning probably happened during day 1). The committed-at-start number falls back to current scope; scope-change events are reconstructed from journals."
                : "This OpenProject install doesn't expose the time-travel filter, so committed-at-start is reconstructed from journals. Numbers are within a point or two of reality on most sprints."}
            </BestEffort>
          )}
        </h3>
        <span className={PANEL_SUB}>
          {sprint?.name?.split(" — ")[0] || "Active sprint"}
          {sprint?.start && sprint.start !== "—" ? `  •  ${sprint.start} → ${sprint.end}` : ""}
        </span>
        <div className={PANEL_LEGEND}>
          <span className="inline-flex items-center">
            <span className={SWATCH} style={{ background: "transparent", border: "1.5px dashed var(--text-3)" }} />
            Ideal
          </span>
          <span className="inline-flex items-center">
            <span className={SWATCH} style={{ background: "var(--accent)" }} />
            Remaining
          </span>
        </div>
      </div>
      {totalPts === 0 ? (
        <EmptyState
          title={
            unit === "d"
              ? "Burndown needs start + due dates"
              : "Burndown needs story points"
          }
          body={
            unit === "d"
              ? "Set start and due dates on the work packages in this sprint to see the burndown line."
              : "Add story points to work packages in this sprint to see the burndown line."
          }
        />
      ) : (
        <div className="px-2 pt-3 pb-1">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="xMidYMid meet"
            className="w-full h-auto block"
            role="img"
            aria-label="Sprint burndown chart"
          >
            {nonWorkingIdx.map((i) => (
              <rect
                key={`nw-${i}`}
                x={xAt(i)}
                y={PAD_T}
                width={Math.max(0, xAt(i + 1) - xAt(i))}
                height={innerH}
                fill="var(--border-soft)"
                opacity="0.35"
              />
            ))}
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <line
                key={f}
                x1={PAD_L}
                x2={W - PAD_R}
                y1={PAD_T + f * innerH}
                y2={PAD_T + f * innerH}
                stroke="var(--border-soft)"
                strokeWidth="1"
              />
            ))}
            {[0, 0.5, 1].map((f) => (
              <text
                key={f}
                x={PAD_L - 8}
                y={PAD_T + f * innerH + 4}
                fontSize="11"
                textAnchor="end"
                fill="var(--text-3)"
              >
                {Math.round(totalPts * (1 - f))}
              </text>
            ))}
            {Array.from({ length: days + 1 }, (_, i) => i)
              .filter((i) => i % Math.max(1, Math.ceil(days / 6)) === 0 || i === days)
              .map((i) => (
                <text
                  key={i}
                  x={xAt(i)}
                  y={H - PAD_B + 14}
                  fontSize="11"
                  textAnchor="middle"
                  fill="var(--text-3)"
                >
                  Day {i}
                </text>
              ))}
            <path d={idealPath} stroke="var(--text-3)" strokeWidth="1.5" strokeDasharray="4 4" fill="none" />
            {actualArea && <path d={actualArea} fill="var(--accent)" fillOpacity="0.10" />}
            {actualLine && (
              <path
                d={actualLine}
                stroke="var(--accent)"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {(data.points || []).map((p, i) => (
              <circle
                key={i}
                cx={xAt(i)}
                cy={yAt(p.remaining)}
                r="3"
                fill="var(--surface-elevated, white)"
                stroke="var(--accent)"
                strokeWidth="2"
              />
            ))}
            {todayIdx >= 0 && (
              <line
                x1={xAt(todayIdx)}
                x2={xAt(todayIdx)}
                y1={PAD_T}
                y2={H - PAD_B}
                stroke="var(--pri-high)"
                strokeWidth="1.5"
                strokeDasharray="2 4"
              />
            )}
          </svg>
        </div>
      )}
      {totalPts > 0 && (
        <div className="grid grid-cols-4 gap-px bg-border-soft border-t border-border-soft">
          <BurndownStat label="Committed at start" value={`${totalPts} ${unit}`} />
          <BurndownStat label="Remaining" value={`${lastRemaining ?? totalPts} ${unit}`} />
          <BurndownStat
            label="Scope change"
            value={
              data.addedAfterStart || data.removedAfterStart
                ? `${data.addedAfterStart?.points > 0 ? "+" : ""}${data.addedAfterStart?.points || 0}${
                    data.removedAfterStart?.points > 0
                      ? ` / −${data.removedAfterStart.points}`
                      : ""
                  } ${unit}`
                : "—"
            }
            tone={
              (data.addedAfterStart?.points || 0) > 0
                ? "warn"
                : (data.removedAfterStart?.points || 0) > 0
                ? "warn"
                : "neutral"
            }
          />
          <BurndownStat
            label="Trend"
            value={
              projectedDelta == null
                ? "—"
                : projectedDelta > 0.5
                ? `+${Math.round(projectedDelta)} behind`
                : projectedDelta < -0.5
                ? `${Math.round(projectedDelta)} ahead`
                : "On track"
            }
            hint={
              baselineApprox && projectedDelta != null && projectedDelta > 0.5
                ? "Behind a moving target — scope grew during the sprint, so the baseline is current scope rather than the day-1 commit."
                : null
            }
            tone={
              projectedDelta == null
                ? "neutral"
                : projectedDelta > 0.5
                ? "warn"
                : projectedDelta < -0.5
                ? "good"
                : "neutral"
            }
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sprint Report — committed / completed / added / removed,
// itemized scope-change table beneath. Shares the burndown query
// so we don't fan-out a second activity scan.

function SprintReport({ projectId, sprint, sprintTasks, mode = "numeric" }) {
  const q = useBurndown(projectId, sprint?.id, !!projectId && !!sprint?.id);
  const completedPts = useMemo(
    () =>
      sprintTasks
        .filter((t) => t.statusIsClosed)
        .reduce((s, t) => s + weightOf(t, { mode }), 0),
    [sprintTasks, mode],
  );

  if (q.isLoading) {
    return (
      <div className={PANEL}>
        <div className={PANEL_HEADER}>
          <h3 className={PANEL_TITLE}>
            Sprint report
            <BestEffort />
          </h3>
          <LoadingPill label="loading scope" />
        </div>
      </div>
    );
  }

  const data = q.data || {};
  // Match the Burndown panel's fallback: when the time-travel baseline
  // returned empty (no WPs at sprint-start EOD) `committedAtStart` is 0
  // even though the team really did commit to the current scope. Falling
  // back to `totalCommitted` keeps the two panels' "Committed at start"
  // numbers in sync. The `approx` flag below tells the user when this
  // fallback is in play.
  const baselineApprox = data.baselineSource && data.baselineSource !== "timestamps";
  const committedAtStart = baselineApprox
    ? data.totalCommitted || 0
    : data.committedAtStart || 0;
  const added = data.addedAfterStart || { count: 0, points: 0 };
  const removed = data.removedAfterStart || { count: 0, points: 0 };
  const events = data.scopeEvents || [];
  const addedEvents = events.filter((e) => e.kind === "added");
  const removedEvents = events.filter((e) => e.kind === "removed");
  const unit = data.unit || "pts";

  return (
    <div className={PANEL}>
      <div className={PANEL_HEADER}>
        <h3 className={PANEL_TITLE}>
          Sprint report
          <BestEffort>
            Scope changes are reconstructed from OpenProject activity
            history. Removed items from beyond the journal retention window
            may not appear.
            {baselineApprox && (
              <>
                {" "}OP reported zero work packages at sprint-start; the
                committed-at-start number falls back to current scope.
              </>
            )}
          </BestEffort>
        </h3>
        <span className={PANEL_SUB}>
          {sprint?.name?.split(" — ")[0] || "Active sprint"}
          {sprint?.start && sprint.start !== "—"
            ? `  •  ${sprint.start} → ${sprint.end}`
            : ""}
        </span>
      </div>
      {committedAtStart === 0 && added.count === 0 && removed.count === 0 ? (
        <EmptyState
          title="No scope to report"
          body="Once work is committed to this sprint, the report will summarize what shipped and what changed."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border-soft border-b border-border-soft">
            <BurndownStat
              label="Committed at start"
              value={`${committedAtStart} ${unit}`}
            />
            <BurndownStat
              label="Completed"
              value={`${completedPts} ${unit}`}
              tone={completedPts >= committedAtStart && committedAtStart > 0 ? "good" : "neutral"}
            />
            <BurndownStat
              label="Added mid-sprint"
              value={`${added.points} ${unit} (${added.count})`}
              tone={added.points > 0 ? "warn" : "neutral"}
            />
            <BurndownStat
              label="Removed mid-sprint"
              value={`${removed.points} ${unit} (${removed.count})`}
              tone={removed.points > 0 ? "warn" : "neutral"}
            />
          </div>
          <ScopeEventsTable
            title="Added after start"
            events={addedEvents}
            kind="added"
            unit={unit}
          />
          <ScopeEventsTable
            title="Removed after start"
            events={removedEvents}
            kind="removed"
            unit={unit}
          />
          {data.truncated && (
            <div className="px-5 py-3 text-[11px] text-fg-faint border-t border-border-soft">
              Sprint has more than 200 work packages — only the first 200
              were scanned for scope events. Remaining items are accounted
              for in the totals via OpenProject&apos;s snapshot diff.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ScopeEventsTable({ title, events, kind, unit = "pts" }) {
  const [visible, setVisible] = useState(PAGE_SIZE_DEFAULT);
  if (!events.length) return null;
  const sign = kind === "added" ? "+" : "−";
  const slice = events.slice(0, visible);
  return (
    <div className="border-t border-border-soft">
      <div className="px-5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
        {title} · {events.length} item{events.length === 1 ? "" : "s"}
      </div>
      <ul className="m-0 p-0 list-none">
        {slice.map((ev, i) => (
          <li
            key={`${ev.wpId}-${ev.day || "u"}-${i}`}
            className="grid items-center gap-3 px-5 py-2 border-b border-border-soft last:border-b-0 text-[13px]"
            style={{ gridTemplateColumns: "44px 64px minmax(0,1fr) auto auto" }}
          >
            <span
              className={`font-mono text-[12px] tabular-nums font-semibold ${
                kind === "added" ? "text-status-blocked-fg" : "text-fg-subtle"
              }`}
              title={
                ev.pointsRaw != null && String(ev.pointsRaw) !== String(ev.points || 0)
                  ? `${ev.points || 0} ${unit}`
                  : undefined
              }
            >
              {sign}
              {/* Prefer the user-facing label (e.g. "L") on t-shirt-style
                  custom fields; fall back to the numeric points so a
                  pure-numeric project still reads naturally. */}
              {formatEstimate({ points: ev.points, pointsRaw: ev.pointsRaw }) ?? 0}
            </span>
            <span className="font-mono text-[11px] text-fg-subtle truncate">
              {ev.wpKey || ev.wpId}
            </span>
            <span className="text-fg truncate" title={ev.wpTitle}>
              {ev.wpTitle || "—"}
            </span>
            <span className="text-[11px] text-fg-subtle tabular-nums whitespace-nowrap">
              {ev.day || "unknown day"}
            </span>
            <span className="text-[11px] text-fg-faint truncate max-w-32" title={ev.by || ""}>
              {ev.by || ""}
            </span>
          </li>
        ))}
      </ul>
      <PaginationFooter
        visible={Math.min(visible, events.length)}
        total={events.length}
        pageSize={PAGE_SIZE_DEFAULT}
        onShowMore={() => setVisible((n) => n + PAGE_SIZE_DEFAULT)}
        onShowAll={() => setVisible(events.length)}
        onShowLess={() => setVisible(PAGE_SIZE_DEFAULT)}
      />
    </div>
  );
}

function BurndownStat({ label, value, tone = "neutral", hint = null }) {
  const toneCls =
    tone === "warn" ? "text-pri-high" : tone === "good" ? "text-status-done" : "text-fg";
  return (
    <div
      className="bg-surface-elevated px-5 py-3"
      title={hint || undefined}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle inline-flex items-center gap-1">
        {label}
        {hint && (
          <Icon
            name="info"
            size={11}
            className="text-fg-faint"
            aria-hidden="true"
          />
        )}
      </div>
      <div className={`font-display text-[20px] font-semibold tracking-[-0.018em] mt-0.5 ${toneCls}`}>
        {value}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Velocity — committed vs. completed bars per closed sprint.

function VelocityChart({ projectId }) {
  const q = useVelocity(projectId, !!projectId);
  if (q.isLoading) {
    return (
      <div className={PANEL}>
        <div className={PANEL_HEADER}>
          <h3 className={PANEL_TITLE}>Velocity</h3>
          <LoadingPill label="loading velocity" />
        </div>
      </div>
    );
  }
  const data = q.data || { sprints: [], avg: 0 };
  const unit = data.unit || "pts";
  const max = Math.max(50, ...data.sprints.map((s) => Math.max(s.committed, s.completed)));

  return (
    <div className={PANEL}>
      <div className={PANEL_HEADER}>
        <h3 className={PANEL_TITLE}>Velocity</h3>
        <span className={PANEL_SUB}>
          Last {data.sprints.length} closed sprint{data.sprints.length === 1 ? "" : "s"}
        </span>
        <div className={PANEL_LEGEND}>
          <span className="inline-flex items-center">
            <span className={SWATCH} style={{ background: "var(--accent-200)" }} />
            Committed
          </span>
          <span className="inline-flex items-center">
            <span className={SWATCH} style={{ background: "var(--accent)" }} />
            Completed
          </span>
        </div>
      </div>
      {data.sprints.length === 0 ? (
        <EmptyState
          title="No velocity yet"
          body="Velocity is calculated from closed sprints. Complete a sprint to see the chart."
        />
      ) : (
        <div className="relative px-6 pt-8 pb-4">
          {data.avg > 0 && (
            <div
              className="absolute left-6 right-6 border-t border-dashed border-accent-200 pointer-events-none"
              style={{ bottom: `calc(16px + ${(data.avg / max) * 192}px)` }}
            >
              <span className="absolute right-0 -top-4 px-1.5 py-0.5 rounded bg-accent-50 text-accent-700 text-[10px] font-semibold">
                Avg {data.avg} {unit}
              </span>
            </div>
          )}
          <div className="flex items-end gap-4 sm:gap-6 h-48">
            {data.sprints.map((s) => (
              <div key={s.sprintId} className="flex-1 flex flex-col items-center gap-2 min-w-12">
                <div className="flex gap-1.5 items-end h-44 relative">
                  <div
                    className="w-6 sm:w-7 rounded-t-md bg-accent-200 relative transition-[height] duration-300"
                    style={{ height: `${(s.committed / max) * 100}%` }}
                  >
                    <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-fg-subtle font-semibold whitespace-nowrap">
                      {s.committed}
                    </span>
                  </div>
                  <div
                    className="w-6 sm:w-7 rounded-t-md bg-accent relative transition-[height] duration-300"
                    style={{ height: `${(s.completed / max) * 100}%` }}
                  >
                    <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-accent-700 font-bold whitespace-nowrap">
                      {s.completed}
                    </span>
                  </div>
                </div>
                <div
                  className="text-[11px] text-fg-muted font-medium max-w-24 text-center truncate"
                  title={s.sprintName}
                >
                  {s.sprintName?.split(" — ")[0] || s.sprintName}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Throughput trend — points completed per sprint as a sparkline.
// Reads the same /velocity endpoint so the data stays consistent.

function ThroughputPanel({ projectId }) {
  const q = useVelocity(projectId, !!projectId);
  const data = q.data || { sprints: [], avg: 0 };
  const unit = data.unit || "pts";
  const completed = data.sprints.map((s) => s.completed || 0);
  const last = completed[completed.length - 1] ?? 0;
  const prev = completed[completed.length - 2] ?? 0;
  const delta = prev > 0 ? Math.round(((last - prev) / prev) * 100) : null;

  return (
    <div className={PANEL}>
      <div className={PANEL_HEADER}>
        <h3 className={PANEL_TITLE}>Throughput</h3>
        <span className={PANEL_SUB}>
          {unit === "d" ? "Working days completed per sprint" : "Story points completed per sprint"}
        </span>
      </div>
      <div className="px-5 py-5 grid gap-3">
        <div className="flex items-baseline gap-3">
          <div className="font-display text-[40px] font-semibold tracking-[-0.028em] text-fg leading-none tabular-nums">
            {last}
          </div>
          <div className="text-[12px] text-fg-subtle">last sprint</div>
          {delta != null && delta !== 0 && (
            <span
              className={`ml-auto inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums ${
                delta > 0
                  ? "bg-status-done-bg text-status-done-fg"
                  : "bg-status-blocked-bg text-status-blocked-fg"
              }`}
            >
              {delta > 0 ? "+" : ""}
              {delta}%
            </span>
          )}
        </div>
        <Sparkline values={completed} height={64} color="var(--accent)" fill />
        <div className="flex justify-between text-[11px] text-fg-subtle">
          <span>{data.sprints[0]?.sprintName?.split(" — ")[0] || "—"}</span>
          <span>Avg {data.avg} {unit}</span>
          <span>{data.sprints[data.sprints.length - 1]?.sprintName?.split(" — ")[0] || "—"}</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Member contribution — story points per assignee, broken down into
// completed / in-flight / committed-but-not-started. The most-active
// member sits at the top; the bar widths are normalized against the
// highest committed total so the comparison reads at a glance.

const UNASSIGNED_KEY = "__unassigned";

function MemberContribution({ tasks, scopeLabel, unit = "pts", mode = "numeric" }) {
  const [visible, setVisible] = useState(PAGE_SIZE_DEFAULT);
  const { rows, unassigned } = useMemo(() => {
    const byAssignee = new Map();
    const un = {
      id: UNASSIGNED_KEY,
      name: "Unassigned",
      committed: 0,
      completed: 0,
      inFlight: 0,
      committedCount: 0,
      completedCount: 0,
      isUnassigned: true,
    };
    for (const t of tasks) {
      const pts = weightOf(t, { mode });
      const target = (() => {
        if (!t.assignee) return un;
        const id = String(t.assignee);
        if (!byAssignee.has(id)) {
          byAssignee.set(id, {
            id,
            name: t.assigneeName || `User ${id}`,
            committed: 0,
            completed: 0,
            inFlight: 0,
            committedCount: 0,
            completedCount: 0,
          });
        }
        return byAssignee.get(id);
      })();
      target.committed += pts;
      target.committedCount += 1;
      if (t.statusIsClosed) {
        target.completed += pts;
        target.completedCount += 1;
      } else {
        // Open work that already carries an estimate is "in flight". This
        // replaces the old keyword-derived progress/review buckets — open
        // is open, no further inference.
        if (pts > 0) target.inFlight += pts;
      }
    }
    const sorted = Array.from(byAssignee.values()).sort(
      (a, b) => b.completed - a.completed || b.committed - a.committed,
    );
    return { rows: sorted, unassigned: un.committedCount > 0 ? un : null };
  }, [tasks, mode]);

  const allRows = unassigned ? [...rows, unassigned] : rows;
  const totalCommitted = allRows.reduce((s, r) => s + r.committed, 0);
  const totalCompleted = allRows.reduce((s, r) => s + r.completed, 0);

  // Pre-compute per-row metrics so render stays declarative.
  const computed = allRows.map((r) => {
    const personalPct = r.committed > 0
      ? Math.round((r.completed / r.committed) * 100)
      : 0;
    const inFlightPct = r.committed > 0
      ? Math.round((r.inFlight / r.committed) * 100)
      : 0;
    return { ...r, personalPct, inFlightPct };
  });
  const teamPct = totalCommitted > 0
    ? Math.round((totalCompleted / totalCommitted) * 100)
    : 0;

  return (
    <div className={PANEL}>
      <div className={PANEL_HEADER}>
        <h3 className={PANEL_TITLE}>Story points by member</h3>
        <span className={PANEL_SUB}>
          {totalCompleted} of {totalCommitted} {unit} done
          {totalCommitted > 0 ? ` (${teamPct}%)` : ""} · {scopeLabel}
        </span>
      </div>
      {allRows.length === 0 ? (
        <EmptyState
          title="No work in this sprint yet"
          body="Add tasks to the sprint to see contribution by member."
        />
      ) : (
        <>
          <ul className="m-0 p-0 list-none">
            {computed.slice(0, visible).map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-4 px-5 py-4 border-b border-border-soft last:border-b-0"
              >
                {r.isUnassigned ? (
                  <Avatar user={null} size="md" tooltip="Unassigned" />
                ) : (
                  <Avatar user={{ id: r.id, name: r.name }} size="md" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3 mb-2">
                    <div
                      className={`text-[13.5px] truncate ${
                        r.isUnassigned
                          ? "italic text-fg-muted"
                          : "font-medium text-fg"
                      }`}
                      title={r.name}
                    >
                      {r.name}
                    </div>
                    <div className="text-[11.5px] text-fg-subtle tabular-nums shrink-0">
                      {r.completedCount} of {r.committedCount}{" "}
                      {r.committedCount === 1 ? "issue" : "issues"}
                    </div>
                  </div>
                  {/* Single-color bar: filled = completed, accent
                      stripe under the leading edge = in-flight.
                      Reads as one progress meter, not three. */}
                  <div className="relative h-2 rounded-full bg-surface-muted overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-status-done transition-[width] duration-500"
                      style={{ width: `${r.personalPct}%` }}
                      title={`${r.completed} ${unit} completed`}
                    />
                    {r.inFlightPct > 0 && (
                      <div
                        className="absolute inset-y-0 rounded-full bg-accent/40 transition-[width,left] duration-500"
                        style={{
                          left: `${r.personalPct}%`,
                          width: `${Math.min(100 - r.personalPct, r.inFlightPct)}%`,
                        }}
                        title={`${r.inFlight} ${unit} in flight`}
                      />
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 tabular-nums min-w-20">
                  <div className="font-display text-[18px] font-semibold text-fg leading-none">
                    {r.completed}
                    <span className="text-fg-faint font-normal text-[13px]">
                      {" "}/ {r.committed}
                    </span>
                  </div>
                  <div className="text-[11px] text-fg-subtle mt-1.5 uppercase tracking-[0.12em]">
                    {unit} · {r.personalPct}%
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <PaginationFooter
            visible={Math.min(visible, computed.length)}
            total={computed.length}
            pageSize={PAGE_SIZE_DEFAULT}
            onShowMore={() => setVisible((n) => n + PAGE_SIZE_DEFAULT)}
            onShowAll={() => setVisible(computed.length)}
            onShowLess={() => setVisible(PAGE_SIZE_DEFAULT)}
          />
          <div className="grid grid-cols-3 gap-px bg-border-soft border-t border-border-soft">
            <BurndownStat label="Contributors" value={String(rows.length)} />
            <BurndownStat label="Total committed" value={`${totalCommitted} ${unit}`} />
            <BurndownStat label="Total completed" value={`${totalCompleted} ${unit}`} tone="good" />
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Status distribution — donut by bucket. Operates on whatever task
// list it receives so callers can scope to the active sprint or the
// entire project.

function StatusDistribution({ tasks, scopeLabel }) {
  // Build one segment per OpenProject status that's actually used in the
  // visible tasks. Color comes from `task.statusColor` (API truth) — when
  // OP doesn't set a colour we fall back to a closed-vs-open neutral.
  const segments = useMemo(() => {
    const acc = new Map();
    for (const t of tasks) {
      const id = t.statusId ? String(t.statusId) : "none";
      const ent = acc.get(id) || {
        key: id,
        label: t.statusName || "—",
        color:
          t.statusColor ||
          (t.statusIsClosed ? CLOSED_SEGMENT_COLOR : OPEN_SEGMENT_COLOR),
        isClosed: !!t.statusIsClosed,
        value: 0,
      };
      ent.value += 1;
      acc.set(id, ent);
    }
    return [...acc.values()].sort((a, b) => {
      if (a.isClosed !== b.isClosed) return a.isClosed ? 1 : -1;
      return a.label.localeCompare(b.label);
    });
  }, [tasks]);
  const total = segments.reduce((s, x) => s + x.value, 0);
  const done = segments
    .filter((s) => s.isClosed)
    .reduce((s, x) => s + x.value, 0);
  const donePct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className={PANEL}>
      <div className={PANEL_HEADER}>
        <h3 className={PANEL_TITLE}>Status distribution</h3>
        <span className={PANEL_SUB}>{scopeLabel}</span>
      </div>
      {total === 0 ? (
        <EmptyState title="No tasks yet" body="Once issues are created, the breakdown lands here." />
      ) : (
        <div className="px-5 py-5 grid grid-cols-[auto_1fr] gap-5 items-center">
          <Donut
            segments={segments}
            centerLabel={`${donePct}%`}
            centerSub={`${done}/${total} done`}
          />
          <div className="grid gap-2">
            {segments.map((s) => (
              <div key={s.key} className="flex items-center gap-2 text-[12.5px]">
                <span className={SWATCH} style={{ background: s.color }} />
                <span className="text-fg-muted flex-1">{s.label}</span>
                <span className="font-mono tabular-nums text-fg font-semibold">{s.value}</span>
                <span className="text-fg-faint text-[11px] tabular-nums w-10 text-right">
                  {total > 0 ? `${Math.round((s.value / total) * 100)}%` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Type breakdown — horizontal bars by issue type. Reads from the
// classified `type` field that the mapper sets on every task.

function TypeBreakdown({ tasks }) {
  // One bar per type ID actually present in the tasks list. Color is the
  // type's API-configured colour; "done" counts use `statusIsClosed`.
  const rows = useMemo(() => {
    const acc = new Map();
    for (const t of tasks) {
      const key = t.typeId ? String(t.typeId) : "none";
      const ent = acc.get(key) || {
        key,
        label: t.typeName || "—",
        color: t.typeColor || "var(--text-3)",
        typeName: t.typeName || null,
        typeColor: t.typeColor || null,
        total: 0,
        done: 0,
      };
      ent.total += 1;
      if (t.statusIsClosed) ent.done += 1;
      acc.set(key, ent);
    }
    return [...acc.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  }, [tasks]);
  const max = Math.max(1, ...rows.map((r) => r.total));
  const totalIssues = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div className={PANEL}>
      <div className={PANEL_HEADER}>
        <h3 className={PANEL_TITLE}>Type breakdown</h3>
        <span className={PANEL_SUB}>{totalIssues} issue{totalIssues === 1 ? "" : "s"} across the project</span>
      </div>
      {totalIssues === 0 ? (
        <EmptyState title="No issues yet" body="Create work packages to see how the project is composed." />
      ) : (
        <div className="px-5 py-5 grid gap-3">
          {rows.map((r) => (
            <div
              key={r.key}
              className="grid items-center gap-3"
              style={{ gridTemplateColumns: "minmax(0, 96px) 1fr 70px" }}
            >
              <div className="inline-flex items-center gap-1.5">
                <TaskTypeIcon task={r} size={14} />
                <span className="text-[12.5px] text-fg-muted truncate">{r.label}</span>
              </div>
              <div className="relative h-5 rounded-md bg-surface-app overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-md"
                  style={{ width: `${(r.total / max) * 100}%`, background: r.color, opacity: 0.85 }}
                  aria-label={`${r.label}: ${r.total}`}
                />
                {r.done > 0 && (
                  <div
                    className="absolute inset-y-0 left-0 rounded-md bg-status-done"
                    style={{ width: `${(r.done / max) * 100}%` }}
                    aria-label={`${r.label} done: ${r.done}`}
                  />
                )}
              </div>
              <div className="text-right tabular-nums text-[13px] font-semibold text-fg">
                {r.done}
                <span className="text-fg-faint font-normal text-[11.5px]"> / {r.total}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Top-level KPI row — five tiles the PM scans before anything else.

function KpiRow({ sprint, sprintTasks, allTasks, velocity, unit = "pts", mode = "numeric" }) {
  const sprintProgress = useMemo(() => {
    const wOpts = { mode };
    const totalPts = sprintTasks.reduce((s, t) => s + weightOf(t, wOpts), 0);
    const donePts = sprintTasks
      .filter((t) => t.statusIsClosed)
      .reduce((s, t) => s + weightOf(t, wOpts), 0);
    return {
      pct: totalPts > 0 ? Math.round((donePts / totalPts) * 100) : 0,
      donePts,
      totalPts,
    };
  }, [sprintTasks, mode]);

  // Cycle time: avg days from createdAt → updatedAt across done tasks
  // updated in the last 60 days. Coarse but honest — OP doesn't expose
  // a "started at" timestamp without parsing every WP's activity log.
  const cycleTime = useMemo(() => {
    // Moving 60-day window evaluated at compute time; memo is keyed on
    // `allTasks` so it only recomputes when data actually changes.
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const cutoff = now - 60 * 24 * 60 * 60 * 1000;
    const samples = [];
    for (const t of allTasks) {
      if (!t.statusIsClosed) continue;
      const created = safeParseISO(t.createdAt);
      const updated = safeParseISO(t.updatedAt);
      if (!created || !updated) continue;
      if (updated.getTime() < cutoff) continue;
      const days = (updated.getTime() - created.getTime()) / (24 * 60 * 60 * 1000);
      if (days >= 0 && days < 365) samples.push(days);
    }
    if (samples.length === 0) return null;
    const avg = samples.reduce((s, x) => s + x, 0) / samples.length;
    return { avg, n: samples.length };
  }, [allTasks]);

  // On-time delivery: % of recent closed sprints whose completed >= committed.
  const onTime = useMemo(() => {
    const sprints = velocity?.sprints || [];
    if (sprints.length === 0) return null;
    const considered = sprints.filter((s) => s.committed > 0);
    if (considered.length === 0) return null;
    const ok = considered.filter((s) => s.completed >= s.committed).length;
    return { pct: Math.round((ok / considered.length) * 100), n: considered.length };
  }, [velocity]);

  // Active contributors: distinct assignees who closed something in the
  // last 14 days.
  const active = useMemo(() => {
    // Moving 14-day window; memo recomputes only when allTasks changes.
    // eslint-disable-next-line react-hooks/purity
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const ids = new Set();
    for (const t of allTasks) {
      if (!t.statusIsClosed || !t.assignee) continue;
      const updated = safeParseISO(t.updatedAt);
      if (updated && updated.getTime() >= cutoff) ids.add(String(t.assignee));
    }
    return ids.size;
  }, [allTasks]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <KpiTile
        label="Sprint progress"
        value={`${sprintProgress.pct}%`}
        sub={`${sprintProgress.donePts} / ${sprintProgress.totalPts} ${unit}`}
      />
      <KpiTile
        label="Velocity (avg)"
        value={velocity?.avg != null ? `${velocity.avg}` : "—"}
        sub={
          velocity?.sprints?.length
            ? `Last ${velocity.sprints.length} closed sprint${velocity.sprints.length === 1 ? "" : "s"}`
            : "Needs closed sprints"
        }
      />
      <KpiTile
        label="Cycle time"
        value={cycleTime ? `${cycleTime.avg.toFixed(1)}d` : "—"}
        sub={cycleTime ? `Avg of ${cycleTime.n} closed in 60d` : "No data in last 60 days"}
      />
      <KpiTile
        label="On-time delivery"
        value={onTime ? `${onTime.pct}%` : "—"}
        sub={
          onTime
            ? `Met commit in ${onTime.n} sprint${onTime.n === 1 ? "" : "s"}`
            : "No closed sprints with commit"
        }
      />
      <KpiTile
        label="Active contributors"
        value={String(active)}
        sub="Closed work in last 14 days"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Top-level layout. Reports receives the full project task list so
// project-wide analytics (member contribution, status breakdown,
// throughput) have the data they need, and derives the sprint-scoped
// slice internally for the burndown / sprint-progress KPI.

export function Reports({ sprint, projectId, tasks = [] }) {
  const sprintTasks = useMemo(
    () => (sprint ? tasks.filter((t) => t.sprint === sprint.id) : []),
    [tasks, sprint],
  );
  const velocityQ = useVelocity(projectId, !!projectId);
  const velocity = velocityQ.data || { sprints: [], avg: 0 };
  // Project-wide mode + unit come from the velocity response (schema-
  // anchored server-side). Mode is what the client passes to every
  // weightOf call so a t-shirt project doesn't silently fall back to
  // working-day counts for unsized WPs — that's the bug that produced
  // mixed sums like "491 d" on a t-shirt project.
  const mode = velocity.mode || "numeric";
  const unit = velocity.unit || "pts";
  const sprintScopeLabel = sprint?.name?.split(" — ")[0] || "Active sprint";

  return (
    <div className="px-1 sm:px-3 lg:px-6 py-3 sm:py-4">
      <div className="grid gap-4 max-w-300 mx-auto">
        <KpiRow
          sprint={sprint}
          sprintTasks={sprintTasks}
          allTasks={tasks}
          velocity={velocity}
          unit={unit}
          mode={mode}
        />

        <Burndown projectId={projectId} sprint={sprint} />

        <SprintReport
          projectId={projectId}
          sprint={sprint}
          sprintTasks={sprintTasks}
          mode={mode}
        />

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <VelocityChart projectId={projectId} />
          </div>
          <ThroughputPanel projectId={projectId} />
        </div>

        <MemberContribution
          tasks={sprintTasks}
          scopeLabel={sprintScopeLabel}
          unit={unit}
          mode={mode}
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <StatusDistribution
            tasks={sprintTasks.length > 0 ? sprintTasks : tasks}
            scopeLabel={sprintTasks.length > 0 ? sprintScopeLabel : "Across the project"}
          />
          <TypeBreakdown tasks={tasks} />
        </div>
      </div>
    </div>
  );
}
