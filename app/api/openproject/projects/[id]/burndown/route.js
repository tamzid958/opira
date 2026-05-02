import { buildFilters, fetchAllPages, opFetch } from "@/lib/openproject/client";
import {
  elementsOf,
  mapActivity,
  mapVersionFull,
  mapWorkPackage,
} from "@/lib/openproject/mappers";
import {
  classifyVersionDetail,
  closedSprintMentions,
} from "@/lib/openproject/activity-parsing";
import { loadLookups } from "@/lib/openproject/lookups";
import { errorResponse } from "@/lib/openproject/route-utils";
import { makeCache } from "@/lib/openproject/route-cache";
import { isoDayOf, workingDaySet } from "@/lib/openproject/working-days";
import {
  getProjectEstimateMode,
  inferModeFromTasks,
  unitFor,
  weightOf,
} from "@/lib/openproject/estimate";

export const dynamic = "force-dynamic";

const CACHE = makeCache({ ttlMs: 5 * 60 * 1000 });

// Hard cap on per-WP activity fetches per sprint. Prevents runaway requests
// on very large sprints; everything past the cap is silently skipped and the
// UI's best-effort tooltip already accounts for missing data.
const WP_FETCH_CAP = 200;

async function computeBurndown(projectId, sprintId) {
  const v = await opFetch(`/versions/${sprintId}`);
  const sprint = mapVersionFull(v);
  if (!sprint.start || !sprint.end || sprint.start === "—" || sprint.end === "—") {
    return {
      sprint,
      points: [],
      totalCommitted: 0,
      committedAtStart: 0,
      addedAfterStart: { count: 0, points: 0 },
      removedAfterStart: { count: 0, points: 0 },
      scopeEvents: [],
      carryOver: {},
      truncated: false,
      baselineSource: "none",
      mode: "numeric",
      unit: "pts",
    };
  }

  const filters = buildFilters([
    { version: { operator: "=", values: [sprintId] } },
  ]);

  // Fan out the heavy fetches in parallel: versions list (for closed-sprint
  // mentions), the per-task lookup tables (cached), and the current sprint
  // members.
  const [versionsHal, lookups, currentEls] = await Promise.all([
    opFetch(`/projects/${encodeURIComponent(projectId)}/versions`).catch(() => null),
    loadLookups(projectId),
    fetchAllPages(
      `/projects/${encodeURIComponent(projectId)}/work_packages`,
      { filters },
    ),
  ]);
  const allVersions = elementsOf(versionsHal).map(mapVersionFull);
  const closedSprintNames = allVersions
    .filter((s) => s.status === "closed" && String(s.id) !== String(sprintId))
    .map((s) => s.name)
    .filter(Boolean);
  const currentWps = currentEls.map((wp) => mapWorkPackage(wp, lookups));

  // Estimation mode: schema is the source of truth (the OP admin configured
  // a CustomOption / Float / Integer field, or none, on this project's
  // schema). Falls back to data inference when the schema is unreadable
  // — common on installs with locked-down schema endpoints. Mode applies
  // to every weightOf below so the chart numbers are uniform.
  const schemaMode = await getProjectEstimateMode(projectId, currentWps[0], opFetch);
  const mode = schemaMode || inferModeFromTasks(currentWps) || "numeric";
  const wOpts = { mode };

  // Baseline at the END of sprint-start day so we capture WPs added during
  // sprint planning. Midnight UTC is too early — most teams plan during day 1
  // of the sprint, which means the timestamp=T00:00:00Z snapshot is genuinely
  // empty per OP and every WP gets miscounted as "added mid-sprint".
  const baselineTs = `${sprint.start}T23:59:59Z`;
  let baselineWps = null;
  let baselineSource = "timestamps";
  try {
    const baselineEls = await fetchAllPages(
      `/projects/${encodeURIComponent(projectId)}/work_packages`,
      { filters, timestamps: baselineTs },
    );
    baselineWps = baselineEls.map((wp) => mapWorkPackage(wp, lookups));
  } catch {
    baselineWps = null;
    baselineSource = "fallback";
  }
  // Empty array is truthy in JS — treat false-empty (zero WPs at the
  // baseline timestamp despite a non-empty current set) the same way we
  // treat a thrown error. The journal-derived path below is more honest in
  // that case than blindly trusting "everything was added mid-sprint".
  if (
    Array.isArray(baselineWps) &&
    baselineWps.length === 0 &&
    currentWps.length > 0
  ) {
    baselineWps = null;
    baselineSource = "fallback-empty";
  }

  // Activities — drive day-level scope events + carry-over detection. Cap at
  // WP_FETCH_CAP to bound cost; degrade gracefully past the cap.
  const truncated = currentWps.length > WP_FETCH_CAP;
  const scanWps = truncated ? currentWps.slice(0, WP_FETCH_CAP) : currentWps;
  const perWp = await Promise.all(
    scanWps.map((t) =>
      opFetch(`/work_packages/${t.nativeId}/activities`)
        .then((aHal) => ({ wp: t, acts: elementsOf(aHal).map(mapActivity) }))
        .catch(() => null),
    ),
  );

  const transitions = [];
  const scopeEvents = [];
  const carryOver = {};

  for (const r of perWp) {
    if (!r) continue;
    const wpId = r.wp.nativeId;
    const wpKey = r.wp.key;
    const wpTitle = r.wp.title;
    const wpPoints = weightOf(r.wp, wOpts);
    const wpPointsRaw = r.wp.pointsRaw ?? null;
    const priorClosed = new Set();

    for (const a of r.acts) {
      const day = (a.createdAt || "").slice(0, 10);
      for (const detail of a.details || []) {
        if (/status/i.test(detail)) {
          transitions.push({ wpId, day, text: detail });
        }
        if (sprint.name) {
          const kind = classifyVersionDetail(detail, sprint.name);
          // Strict `>` so events on sprint-start day fall inside the
          // baseline (which is now sprint-start EOD) instead of double-
          // counting as mid-sprint additions.
          if (kind && day && day > sprint.start && day <= sprint.end) {
            scopeEvents.push({
              wpId,
              wpKey,
              wpTitle,
              points: wpPoints,
              pointsRaw: wpPointsRaw,
              day,
              kind,
              by: a.authorName || null,
            });
          }
        }
        if (closedSprintNames.length > 0) {
          for (const name of closedSprintMentions(detail, closedSprintNames)) {
            priorClosed.add(name);
          }
        }
      }
    }

    if (priorClosed.size > 0) {
      carryOver[wpId] = {
        count: priorClosed.size,
        sprintNames: Array.from(priorClosed),
      };
    }
  }

  // ── Scope summary ─────────────────────────────────────────────────────
  // Prefer the timestamps baseline; fall back to journal-derived added set
  // when OP didn't return a baseline snapshot.
  let committedAtStart;
  let addedSet;
  let removedSet;
  if (baselineWps) {
    const baselineIds = new Set(baselineWps.map((w) => w.nativeId));
    const currentIds = new Set(currentWps.map((w) => w.nativeId));
    addedSet = new Set([...currentIds].filter((id) => !baselineIds.has(id)));
    removedSet = new Set([...baselineIds].filter((id) => !currentIds.has(id)));
    committedAtStart = baselineWps.reduce((s, w) => s + weightOf(w, wOpts), 0);
  } else {
    addedSet = new Set(
      scopeEvents.filter((e) => e.kind === "added").map((e) => e.wpId),
    );
    removedSet = new Set(
      scopeEvents
        .filter((e) => e.kind === "removed")
        .map((e) => e.wpId)
        .filter((id) => !currentWps.some((w) => w.nativeId === id)),
    );
    committedAtStart = currentWps.reduce(
      (s, w) => (addedSet.has(w.nativeId) ? s : s + weightOf(w, wOpts)),
      0,
    );
  }
  const addedPoints = currentWps
    .filter((w) => addedSet.has(w.nativeId))
    .reduce((s, w) => s + weightOf(w, wOpts), 0);
  const removedPoints = (baselineWps || [])
    .filter((w) => removedSet.has(w.nativeId))
    .reduce((s, w) => s + weightOf(w, wOpts), 0);

  // Itemized scope-events list. Cross-reference baseline so we surface
  // removed-and-not-readded WPs even when journal parsing missed them.
  const scopeEventIndex = new Map();
  for (const ev of scopeEvents) {
    scopeEventIndex.set(`${ev.wpId}:${ev.kind}:${ev.day}`, ev);
  }
  const itemized = [...scopeEvents];
  if (baselineWps) {
    for (const w of currentWps) {
      if (!addedSet.has(w.nativeId)) continue;
      // No journal event captured this addition — synthesize a placeholder
      // so the UI table still lists the WP. Day is unknown.
      const hasDay = scopeEvents.some(
        (e) => e.wpId === w.nativeId && e.kind === "added",
      );
      if (!hasDay) {
        itemized.push({
          wpId: w.nativeId,
          wpKey: w.key,
          wpTitle: w.title,
          points: weightOf(w, wOpts),
          pointsRaw: w.pointsRaw ?? null,
          day: null,
          kind: "added",
          by: null,
        });
      }
    }
    for (const w of baselineWps) {
      if (!removedSet.has(w.nativeId)) continue;
      const hasDay = scopeEvents.some(
        (e) => e.wpId === w.nativeId && e.kind === "removed",
      );
      if (!hasDay) {
        itemized.push({
          wpId: w.nativeId,
          wpKey: w.key,
          wpTitle: w.title,
          points: weightOf(w, wOpts),
          pointsRaw: w.pointsRaw ?? null,
          day: null,
          kind: "removed",
          by: null,
        });
      }
    }
  }

  // ── Day walk + per-day remaining ──────────────────────────────────────
  const wdays = workingDaySet();
  const start = new Date(sprint.start);
  const end = new Date(sprint.end);
  const today = new Date();
  const stop = today < end ? today : end;
  const days = [];
  for (let d = new Date(start); d <= stop; d.setDate(d.getDate() + 1)) {
    days.push({
      day: isoDayOf(d),
      isWorkingDay: wdays.has(d.getUTCDay()),
    });
  }

  // Day a WP became "done", clearing on reopen. We walk transitions in
  // chronological order — the journal already returns activities in
  // ascending order, but we sort defensively — and toggle the doneBy
  // entry: a "done|closed|resolved" event sets it; any other status
  // transition (in progress, todo, etc.) clears it. This means a WP that
  // went done → reopened → in-progress no longer stays marked done in the
  // burndown chart, matching the WP's actual state.
  const sortedTransitions = transitions
    .slice()
    .sort((a, b) => String(a.day || "").localeCompare(String(b.day || "")));
  const doneBy = new Map();
  for (const tr of sortedTransitions) {
    const isDone = /\b(done|closed|resolved)\b/i.test(tr.text);
    if (isDone) {
      doneBy.set(tr.wpId, tr.day);
    } else if (doneBy.has(tr.wpId)) {
      doneBy.delete(tr.wpId);
    }
  }
  // Currently-done WPs that have no journal "done" event (closed before the
  // journal retention window, or activities fetch was capped). Anchor them
  // at sprint.start so they're excluded from every day's remaining.
  for (const t of currentWps) {
    if (t.statusIsClosed && !doneBy.has(t.nativeId)) {
      doneBy.set(t.nativeId, sprint.start);
    }
  }
  // Currently-NOT-done WPs that the journal *did* flag as done (then they
  // got reopened off-journal, or our regex caught a false positive) —
  // ensure remaining counts them. Without this, a stray "done" mention in
  // a comment could permanently remove the WP from the burndown.
  for (const t of currentWps) {
    if (!t.statusIsClosed && doneBy.has(t.nativeId)) {
      doneBy.delete(t.nativeId);
    }
  }

  // Day a WP joined this sprint, when it was added mid-sprint.
  const joinedBy = new Map();
  for (const ev of scopeEvents) {
    if (ev.kind !== "added") continue;
    const cur = joinedBy.get(ev.wpId);
    if (!cur || ev.day < cur) joinedBy.set(ev.wpId, ev.day);
  }

  const points = days.map(({ day, isWorkingDay }) => {
    let remaining = 0;
    for (const t of currentWps) {
      const joined = joinedBy.get(t.nativeId) || sprint.start;
      if (joined > day) continue;
      const done = doneBy.get(t.nativeId);
      if (done && done <= day) continue;
      remaining += weightOf(t, wOpts);
    }
    return { day, remaining, isWorkingDay };
  });

  const totalCommitted = currentWps.reduce((s, t) => s + weightOf(t, wOpts), 0);

  return {
    sprint,
    points,
    totalCommitted,
    committedAtStart,
    addedAfterStart: { count: addedSet.size, points: addedPoints },
    removedAfterStart: { count: removedSet.size, points: removedPoints },
    scopeEvents: itemized.sort(
      (a, b) => (a.day || "").localeCompare(b.day || ""),
    ),
    carryOver,
    truncated,
    baselineSource,
    mode,
    unit: unitFor(mode),
  };
}

export async function GET(req, ctx) {
  try {
    const { id } = await ctx.params;
    const sprintId = new URL(req.url).searchParams.get("sprint");
    if (!sprintId) {
      return Response.json({ error: "sprint param is required" }, { status: 400 });
    }
    const key = `${id}:${sprintId}`;
    const cached = CACHE.get(key);
    if (cached) return Response.json(cached);
    const value = await computeBurndown(id, sprintId);
    CACHE.set(key, value);
    return Response.json(value);
  } catch (e) {
    return errorResponse(e);
  }
}
