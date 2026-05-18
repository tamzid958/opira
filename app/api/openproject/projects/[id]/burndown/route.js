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

// Cap on extra "candidate ex-member" WPs we'll scan from other versions to
// reconstruct items that left this sprint. We don't know they were ever in
// our sprint until we read their journal — capping here bounds cost.
const EX_MEMBER_SCAN_CAP = 200;

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
      completed: { count: 0, points: 0 },
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
  const otherVersionIds = allVersions
    .filter((v) => String(v.id) !== String(sprintId))
    .map((v) => v.id);
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

  // Candidate ex-members: items currently sitting in OTHER versions of this
  // project. Some of them may have been moved out of *this* sprint (e.g. the
  // "move undone work to next sprint" flow at sprint close). We don't know
  // which until we read their journals, so this is just the candidate pool —
  // the activity scan below promotes the ones whose journal mentions our
  // sprint into the full universe.
  let otherWps = [];
  if (sprint.name && otherVersionIds.length > 0) {
    try {
      const otherEls = await fetchAllPages(
        `/projects/${encodeURIComponent(projectId)}/work_packages`,
        {
          filters: buildFilters([
            { version: { operator: "=", values: otherVersionIds } },
          ]),
        },
      );
      otherWps = otherEls
        .map((wp) => mapWorkPackage(wp, lookups))
        .slice(0, EX_MEMBER_SCAN_CAP);
    } catch {
      otherWps = [];
    }
  }

  // Build the initial "definitely in this sprint at some point" set: current
  // members + baseline members. Activity scan may promote candidates from
  // `otherWps` into this set later if their journals mention our sprint.
  const universeMap = new Map();
  for (const w of currentWps) universeMap.set(w.nativeId, w);
  if (baselineWps) {
    for (const w of baselineWps) {
      if (!universeMap.has(w.nativeId)) universeMap.set(w.nativeId, w);
    }
  }

  // Activities — drive day-level scope events + carry-over detection +
  // ex-member discovery. Cap at WP_FETCH_CAP to bound cost; degrade gracefully
  // past the cap.
  const definite = [...universeMap.values()];
  const candidatesById = new Map();
  for (const w of otherWps) {
    if (!universeMap.has(w.nativeId)) candidatesById.set(w.nativeId, w);
  }
  const candidateWps = [...candidatesById.values()];
  const totalScanCandidates = definite.length + candidateWps.length;
  const truncated = totalScanCandidates > WP_FETCH_CAP;
  // Prefer scanning definite members first — candidates only get a slot if
  // we have budget left under the cap.
  const scanWps = [...definite, ...candidateWps].slice(0, WP_FETCH_CAP);
  const perWp = await Promise.all(
    scanWps.map((t) =>
      opFetch(`/work_packages/${t.nativeId}/activities`)
        .then((aHal) => ({ wp: t, acts: elementsOf(aHal).map(mapActivity) }))
        .catch(() => null),
    ),
  );

  // Canonical closed-status set, name-indexed. The activity journal renders
  // status transitions as text ("Status changed from X to Y"), so we have to
  // match against status *names* — but the closed/open classification is still
  // driven by `status.isClosed` from /statuses, never by keyword guessing.
  const closedStatusNames = new Set(
    (lookups?.statuses || [])
      .filter((s) => s.isClosed && s.name)
      .map((s) => s.name.trim().toLowerCase()),
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
    const isCandidate = candidatesById.has(wpId);
    let touchedOurSprint = !isCandidate;

    for (const a of r.acts) {
      const day = (a.createdAt || "").slice(0, 10);
      for (const detail of a.details || []) {
        if (/^\s*status\b/i.test(detail)) {
          transitions.push({
            wpId,
            day,
            toClosed: detailTransitionsToClosed(detail, closedStatusNames),
          });
        }
        if (sprint.name) {
          const kind = classifyVersionDetail(detail, sprint.name);
          if (kind) touchedOurSprint = true;
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

    // A candidate from `otherWps` only joins the universe if its journal
    // actually mentions this sprint by name. Items that just happen to live
    // in another sprint don't pollute the report.
    if (isCandidate && touchedOurSprint) {
      universeMap.set(wpId, r.wp);
    }

    if (priorClosed.size > 0) {
      carryOver[wpId] = {
        count: priorClosed.size,
        sprintNames: Array.from(priorClosed),
      };
    }
  }

  // ── Scope summary ─────────────────────────────────────────────────────
  // Universe = every WP that was in this sprint at some point (current
  // members ∪ baseline ∪ journal-confirmed ex-members). Computing scope
  // numbers off the universe rather than `currentWps` is what stops the
  // sprint report from collapsing to 100% the moment undone work is moved
  // out of a closing sprint.
  const universe = [...universeMap.values()];
  const universeIds = new Set(universe.map((w) => w.nativeId));
  const currentIds = new Set(currentWps.map((w) => w.nativeId));

  // Journal-derived join/leave days. `joinedBy` is the EARLIEST add event
  // (when did this WP first arrive in our sprint?), `leftBy` is the LATEST
  // remove event (when did it last leave?) — this pair gives us a coarse
  // membership window even for items we no longer hold.
  const joinedBy = new Map();
  const leftBy = new Map();
  for (const ev of scopeEvents) {
    if (ev.kind === "added") {
      const cur = joinedBy.get(ev.wpId);
      if (!cur || ev.day < cur) joinedBy.set(ev.wpId, ev.day);
    } else if (ev.kind === "removed") {
      const cur = leftBy.get(ev.wpId);
      if (!cur || ev.day > cur) leftBy.set(ev.wpId, ev.day);
    }
  }
  // If the WP is currently in our sprint, any earlier "removed" event was
  // followed by a re-add — clear leftBy so the membership window stays open.
  for (const id of currentIds) leftBy.delete(id);

  let committedAtStart;
  let addedSet;
  let removedSet;
  if (baselineWps) {
    const baselineIds = new Set(baselineWps.map((w) => w.nativeId));
    addedSet = new Set([...universeIds].filter((id) => !baselineIds.has(id)));
    removedSet = new Set(
      [...baselineIds].filter((id) => !currentIds.has(id)),
    );
    committedAtStart = baselineWps.reduce((s, w) => s + weightOf(w, wOpts), 0);
  } else {
    // No timestamps baseline. Reconstruct from the journal: a universe item
    // with no "added" event was already in the sprint at sprint-start.
    addedSet = new Set([...universeIds].filter((id) => joinedBy.has(id)));
    removedSet = new Set(
      [...universeIds].filter((id) => leftBy.has(id) && !currentIds.has(id)),
    );
    committedAtStart = universe.reduce(
      (s, w) => (addedSet.has(w.nativeId) ? s : s + weightOf(w, wOpts)),
      0,
    );
  }
  const addedPoints = universe
    .filter((w) => addedSet.has(w.nativeId))
    .reduce((s, w) => s + weightOf(w, wOpts), 0);
  const removedPoints = universe
    .filter((w) => removedSet.has(w.nativeId))
    .reduce((s, w) => s + weightOf(w, wOpts), 0);

  // Itemized scope-events list. Cross-reference baseline + universe so we
  // surface added/removed items even when journal parsing missed the day.
  const itemized = [...scopeEvents];
  const universeById = new Map(universe.map((w) => [w.nativeId, w]));
  for (const id of addedSet) {
    const w = universeById.get(id);
    if (!w) continue;
    const hasDay = scopeEvents.some(
      (e) => e.wpId === id && e.kind === "added",
    );
    if (!hasDay) {
      itemized.push({
        wpId: id,
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
  for (const id of removedSet) {
    const w =
      universeById.get(id) ||
      (baselineWps || []).find((b) => b.nativeId === id);
    if (!w) continue;
    const hasDay = scopeEvents.some(
      (e) => e.wpId === id && e.kind === "removed",
    );
    if (!hasDay) {
      itemized.push({
        wpId: id,
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

  // ── Day walk + per-day remaining ──────────────────────────────────────
  const wdays = workingDaySet(process.env.OPENPROJECT_WORKING_DAYS);
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
    if (tr.toClosed === true) {
      doneBy.set(tr.wpId, tr.day);
    } else if (tr.toClosed === false && doneBy.has(tr.wpId)) {
      doneBy.delete(tr.wpId);
    }
    // toClosed === null → couldn't parse the destination; leave doneBy alone
    // and let the post-walk reconciliation against `statusIsClosed` correct it.
  }
  // Reconciliation against current status only applies to WPs we still hold
  // — for ex-members, the journal is the only source of truth (their
  // "current" status reflects their state in the *next* sprint, not when
  // they left ours).
  for (const t of currentWps) {
    if (t.statusIsClosed && !doneBy.has(t.nativeId)) {
      doneBy.set(t.nativeId, sprint.start);
    }
    if (!t.statusIsClosed && doneBy.has(t.nativeId)) {
      doneBy.delete(t.nativeId);
    }
  }

  const points = days.map(({ day, isWorkingDay }) => {
    let remaining = 0;
    for (const t of universe) {
      const joined = joinedBy.get(t.nativeId) || sprint.start;
      if (joined > day) continue;
      // Item left the sprint on/before `day` and didn't come back — it's
      // no longer part of this sprint's scope from that day forward.
      const left = leftBy.get(t.nativeId);
      if (left && left <= day) continue;
      const done = doneBy.get(t.nativeId);
      if (done && done <= day) continue;
      remaining += weightOf(t, wOpts);
    }
    return { day, remaining, isWorkingDay };
  });

  // Completed-during-sprint: items still in this sprint and currently closed,
  // PLUS ex-members that closed before they left. Items that left while open
  // (the typical "carry undone work to next sprint" flow) do NOT count — they
  // weren't completed in this sprint.
  let completed = { count: 0, points: 0 };
  for (const w of universe) {
    const wpId = w.nativeId;
    if (currentIds.has(wpId)) {
      if (w.statusIsClosed) {
        completed.count += 1;
        completed.points += weightOf(w, wOpts);
      }
    } else {
      const closedAt = doneBy.get(wpId);
      const leftAt = leftBy.get(wpId);
      if (closedAt && leftAt && closedAt <= leftAt) {
        completed.count += 1;
        completed.points += weightOf(w, wOpts);
      }
    }
  }

  const totalCommitted = currentWps.reduce((s, t) => s + weightOf(t, wOpts), 0);

  return {
    sprint,
    points,
    totalCommitted,
    committedAtStart,
    addedAfterStart: { count: addedSet.size, points: addedPoints },
    removedAfterStart: { count: removedSet.size, points: removedPoints },
    completed,
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

// Parse OP's "Status changed from X to Y" / "Status set to Y" detail lines
// and ask whether Y is a closed status. Returns null when the destination
// can't be extracted — caller treats that as "no signal" rather than open.
function detailTransitionsToClosed(detail, closedStatusNames) {
  if (!detail || closedStatusNames.size === 0) return null;
  const stripped = detail.replace(/[*_`]+/g, "");
  // Last " to " wins: handles both "from X to Y" and "set to Y", and survives
  // status names containing " to ".
  const idx = stripped.toLowerCase().lastIndexOf(" to ");
  if (idx === -1) return null;
  const dest = stripped.slice(idx + 4).trim().replace(/[.\s]+$/, "");
  if (!dest) return null;
  return closedStatusNames.has(dest.toLowerCase());
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
