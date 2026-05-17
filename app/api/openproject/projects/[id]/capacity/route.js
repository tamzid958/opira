import {
  buildFilters,
  fetchAllPages,
  opFetch,
  withQuery,
} from "@/lib/openproject/client";
import {
  elementsOf,
  mapMembership,
  mapNonWorkingTime,
  mapVersionFull,
  mapWorkPackage,
  mapWorkingHours,
} from "@/lib/openproject/mappers";
import { loadLookups } from "@/lib/openproject/lookups";
import { errorResponse } from "@/lib/openproject/route-utils";
import { makeCache } from "@/lib/openproject/route-cache";
import { isoDayOf, workingDaySet } from "@/lib/openproject/working-days";
import {
  getProjectEstimateMode,
  inferModeFromTasks,
  weightOf,
} from "@/lib/openproject/estimate";

export const dynamic = "force-dynamic";

const CACHE = makeCache({ ttlMs: 5 * 60 * 1000 });

// Cap on per-user fan-out so capacity stays cheap on large projects.
const MEMBER_FETCH_CAP = 50;

// Default working-hours / day if a user has no working_hours configured.
const DEFAULT_HOURS_PER_DAY = 8;

function hoursPerPoint() {
  const raw = Number(process.env.HOURS_PER_POINT);
  return Number.isFinite(raw) && raw > 0 ? raw : 4;
}

// OP's working_hours uses 1=Mon..7=Sun. JS Date#getUTCDay is 0=Sun..6=Sat.
function jsDayToOpWeekday(jsDay) {
  return jsDay === 0 ? 7 : jsDay;
}

function nonWorkingCovers(nwt, dayIso) {
  if (!nwt) return false;
  const start = nwt.start || nwt.end;
  const end = nwt.end || nwt.start;
  if (!start || !end) return false;
  return dayIso >= String(start).slice(0, 10) && dayIso <= String(end).slice(0, 10);
}

async function computeCapacity(projectId, sprintId) {
  const projectFilter = buildFilters([
    { project: { operator: "=", values: [String(projectId)] } },
  ]);
  const sprintFilter = buildFilters([
    { version: { operator: "=", values: [sprintId] } },
  ]);

  // Sprint, memberships, WPs, and per-task lookups are independent — fetch
  // in parallel. Lookups feed `mapWorkPackage` so each WP carries
  // statusIsClosed / colors without a per-task linear scan.
  const [v, memberHal, wpEls, lookups] = await Promise.all([
    opFetch(`/versions/${sprintId}`),
    opFetch(withQuery("/memberships", { filters: projectFilter, pageSize: "200" }))
      .catch(() => null),
    fetchAllPages(
      `/projects/${encodeURIComponent(projectId)}/work_packages`,
      { filters: sprintFilter },
      { hardCap: Infinity },
    ),
    loadLookups(projectId),
  ]);

  const sprint = mapVersionFull(v);
  if (!sprint.start || !sprint.end || sprint.start === "—" || sprint.end === "—") {
    return {
      sprint,
      members: [],
      totals: { availableHours: 0, committedHours: 0 },
      hoursPerPoint: hoursPerPoint(),
      truncated: false,
      reason: "Sprint has no dates set.",
    };
  }

  const memberships = elementsOf(memberHal).map(mapMembership).filter(Boolean);
  const userMembers = memberships.filter(
    (m) => m.principalType === "user" && m.principalId,
  );
  const truncated = userMembers.length > MEMBER_FETCH_CAP;
  const scanMembers = truncated
    ? userMembers.slice(0, MEMBER_FETCH_CAP)
    : userMembers;

  // Working hours + non-working times per member, in parallel.
  const memberData = await Promise.all(
    scanMembers.map(async (m) => {
      const userId = m.principalId;
      const [whHal, nwtHal] = await Promise.all([
        opFetch(withQuery(`/users/${userId}/working_hours`, { pageSize: "20" }))
          .catch(() => null),
        opFetch(withQuery(`/users/${userId}/non_working_times`, { pageSize: "100" }))
          .catch(() => null),
      ]);
      const wh = elementsOf(whHal).map(mapWorkingHours).filter(Boolean);
      const nwt = elementsOf(nwtHal).map(mapNonWorkingTime).filter(Boolean);
      return { userId, name: m.name, wh, nwt };
    }),
  );

  const wps = wpEls.map((wp) => mapWorkPackage(wp, lookups));
  const ratio = hoursPerPoint();
  const schemaMode = await getProjectEstimateMode(projectId, wps[0], opFetch);
  const mode = schemaMode || inferModeFromTasks(wps) || "numeric";
  const wOpts = { mode };
  const committedByUser = new Map();
  for (const wp of wps) {
    if (!wp.assignee) continue;
    const hoursFromEstimate = wp.estimatedHours || 0;
    const w = weightOf(wp, wOpts);
    const hours = hoursFromEstimate || (w > 0 ? w * ratio : 0);
    const cur = committedByUser.get(String(wp.assignee)) || 0;
    committedByUser.set(String(wp.assignee), cur + hours);
  }

  // Walk sprint days, summing per-member available hours.
  const wdays = workingDaySet(process.env.OPENPROJECT_WORKING_DAYS);
  const members = memberData.map((m) => {
    let availableHours = 0;
    let availableDays = 0;
    let nonWorkingDays = 0;
    const start = new Date(sprint.start);
    const end = new Date(sprint.end);
    for (
      let d = new Date(start);
      d.getTime() <= end.getTime();
      d.setDate(d.getDate() + 1)
    ) {
      const iso = isoDayOf(d);
      const opWeekday = jsDayToOpWeekday(d.getUTCDay());
      // Project-default working day mask first; respect it as a baseline.
      if (!wdays.has(d.getUTCDay())) continue;
      // Member's per-weekday hours, if configured. When absent, fall back
      // to the default 8h/day on project working days.
      const todayWh = m.wh.find((w) => w.weekday === opWeekday);
      const hoursToday = todayWh
        ? todayWh.hours != null
          ? Number(todayWh.hours) || 0
          : DEFAULT_HOURS_PER_DAY
        : DEFAULT_HOURS_PER_DAY;
      // Skip if a non-working time covers this day.
      const blocked = m.nwt.some((nt) => nonWorkingCovers(nt, iso));
      if (blocked) {
        nonWorkingDays += 1;
        continue;
      }
      availableHours += hoursToday;
      availableDays += 1;
    }
    const committedHours = committedByUser.get(String(m.userId)) || 0;
    return {
      userId: String(m.userId),
      name: m.name,
      availableHours: Math.round(availableHours * 10) / 10,
      availableDays,
      nonWorkingDays,
      committedHours: Math.round(committedHours * 10) / 10,
    };
  });

  const totals = members.reduce(
    (acc, m) => ({
      availableHours: acc.availableHours + m.availableHours,
      committedHours: acc.committedHours + m.committedHours,
    }),
    { availableHours: 0, committedHours: 0 },
  );
  const unassignedHours =
    Array.from(committedByUser.entries()).reduce(
      (s, [uid, h]) =>
        members.some((m) => m.userId === uid) ? s : s + h,
      0,
    ) +
    wps
      .filter((wp) => !wp.assignee)
      .reduce((s, wp) => {
        const fromEstimate = wp.estimatedHours || 0;
        if (fromEstimate) return s + fromEstimate;
        const w = weightOf(wp, wOpts);
        return s + (w > 0 ? w * ratio : 0);
      }, 0);

  return {
    sprint,
    members: members.sort((a, b) => b.committedHours - a.committedHours),
    totals: {
      availableHours: Math.round(totals.availableHours * 10) / 10,
      committedHours: Math.round((totals.committedHours + unassignedHours) * 10) / 10,
      unassignedCommittedHours: Math.round(unassignedHours * 10) / 10,
    },
    hoursPerPoint: ratio,
    mode,
    truncated,
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
    const value = await computeCapacity(id, sprintId);
    CACHE.set(key, value);
    return Response.json(value);
  } catch (e) {
    return errorResponse(e);
  }
}
