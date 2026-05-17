import { buildFilters, fetchAllPages, opFetch, withQuery } from "@/lib/openproject/client";
import { elementsOf, mapVersionFull, mapWorkPackage } from "@/lib/openproject/mappers";
import { loadLookups } from "@/lib/openproject/lookups";
import { makeCache } from "@/lib/openproject/route-cache";
import { errorResponse } from "@/lib/openproject/route-utils";
import {
  getProjectEstimateMode,
  inferModeFromTasks,
  unitFor,
  weightOf,
} from "@/lib/openproject/estimate";

export const dynamic = "force-dynamic";

const CACHE = makeCache({ ttlMs: 5 * 60 * 1000 });

async function computeVelocity(projectId) {
  // 1. List all versions on the project + cached lookups in parallel.
  const [versionsHal, lookups] = await Promise.all([
    opFetch(
      withQuery(`/projects/${encodeURIComponent(projectId)}/versions`, { pageSize: "200" }),
    ),
    loadLookups(projectId),
  ]);
  const versions = elementsOf(versionsHal).map(mapVersionFull);
  const closed = versions
    .filter((v) => v.status === "closed" && v.end && v.end !== "—")
    .sort((a, b) => (a.end < b.end ? 1 : -1))
    .slice(0, 5)
    .reverse();

  // Project-wide mode: schema is the source of truth. Old closed sprints
  // might have unsized WPs and look "duration"-shaped, but if the project
  // is currently configured for t-shirt sizing we trust the schema and
  // compute every sum in t-shirt mode. Only fall back to data inference
  // if the schema endpoint is unreadable.
  let sampleWp = null;
  for (const v of closed) {
    if (sampleWp) break;
    const filters = buildFilters([{ version: { operator: "=", values: [v.id] } }]);
    try {
      const probe = await fetchAllPages(
        `/projects/${encodeURIComponent(projectId)}/work_packages`,
        { filters, pageSize: "1" },
      );
      if (probe.length > 0) sampleWp = mapWorkPackage(probe[0], lookups);
    } catch {
      // continue with next sprint
    }
  }
  const schemaMode = await getProjectEstimateMode(projectId, sampleWp, opFetch);

  // For each closed sprint, fetch the WPs as they were AT SPRINT END so a
  // post-close points resize ("we bumped this from M to L last week")
  // doesn't retroactively rewrite the historical velocity. Falls back to
  // the live state if the OP install doesn't expose the `timestamps`
  // filter, which we tag per-sprint so the UI can flag approximate data.
  const out = await Promise.all(
    closed.map(async (v) => {
      const versionFilters = buildFilters([
        { version: { operator: "=", values: [v.id] } },
      ]);
      const ts = `${v.end}T23:59:59Z`;
      const liveEls = await fetchAllPages(
        `/projects/${encodeURIComponent(projectId)}/work_packages`,
        { filters: versionFilters },
        { hardCap: Infinity },
      );
      // Snapshot at sprint-end determines BOTH who was in the sprint and
      // the historical weights — so a post-close points resize doesn't
      // rewrite velocity, and items that were moved to a follow-up sprint
      // (the "carry undone work" flow) still count toward this sprint's
      // commit/complete because they were members at sprint-end.
      let snapshotEls = liveEls;
      let timeTraveled = false;
      try {
        snapshotEls = await fetchAllPages(
          `/projects/${encodeURIComponent(projectId)}/work_packages`,
          { filters: versionFilters, timestamps: ts },
          { hardCap: Infinity },
        );
        timeTraveled = true;
      } catch {
        // keep liveEls as the fallback
      }
      const liveWps = liveEls.map((wp) => mapWorkPackage(wp, lookups));
      const snapshotWps = snapshotEls.map((wp) => mapWorkPackage(wp, lookups));
      // Use the project mode (schema-derived) for per-sprint sums so a
      // point-mode project's historical velocity isn't computed as
      // working-day counts on sprints that happen to have unsized WPs.
      const sprintMode =
        schemaMode || inferModeFromTasks(snapshotWps) || "numeric";
      const opts = { mode: sprintMode };
      const committed = snapshotWps.reduce((s, t) => s + weightOf(t, opts), 0);

      // For items still in this sprint, use the live (current) status —
      // that preserves the "stragglers closed after sprint-end still count"
      // behavior the team relied on. For items that have since been moved
      // out of this sprint (the "carry undone work to next sprint" flow),
      // use the snapshot's sprint-end status, since their *current* status
      // belongs to whatever sprint they ended up in. This avoids issuing a
      // by-id refetch — some OP installs reject the id filter.
      const liveById = new Map(liveWps.map((w) => [w.nativeId, w]));
      const completed = snapshotWps.reduce((s, w) => {
        const live = liveById.get(w.nativeId);
        const isClosed = live ? live.statusIsClosed : w.statusIsClosed;
        return isClosed ? s + weightOf(w, opts) : s;
      }, 0);
      return {
        sprintId: v.id,
        sprintName: v.name,
        endDate: v.end,
        mode: sprintMode,
        unit: unitFor(sprintMode),
        committed,
        completed,
        snapshot: timeTraveled ? "sprintEnd" : "live",
      };
    }),
  );
  const avg = out.length
    ? Math.round(out.reduce((s, x) => s + x.completed, 0) / out.length)
    : 0;
  // Project-wide mode preference order: schema (authoritative) → most
  // recent closed sprint's data signal → "numeric" default. Avoids the
  // simple-majority pitfall where a project that's switched estimation
  // methodology shows the historical rather than current style.
  const projectMode =
    schemaMode || out[out.length - 1]?.mode || "numeric";
  return { sprints: out, avg, mode: projectMode, unit: unitFor(projectMode) };
}

export async function GET(_req, ctx) {
  try {
    const { id } = await ctx.params;
    const cached = CACHE.get(id);
    if (cached) return Response.json(cached);
    const value = await computeVelocity(id);
    CACHE.set(id, value);
    return Response.json(value);
  } catch (e) {
    return errorResponse(e);
  }
}
