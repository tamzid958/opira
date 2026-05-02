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
      const filters = buildFilters([{ version: { operator: "=", values: [v.id] } }]);
      const ts = `${v.end}T23:59:59Z`;
      let wpEls;
      let timeTraveled = false;
      try {
        wpEls = await fetchAllPages(
          `/projects/${encodeURIComponent(projectId)}/work_packages`,
          { filters, timestamps: ts },
        );
        timeTraveled = true;
      } catch {
        wpEls = await fetchAllPages(
          `/projects/${encodeURIComponent(projectId)}/work_packages`,
          { filters },
        );
      }
      const wps = wpEls.map((wp) => mapWorkPackage(wp, lookups));
      // Use the project mode (schema-derived) for per-sprint sums so a
      // point-mode project's historical velocity isn't computed as
      // working-day counts on sprints that happen to have unsized WPs.
      const sprintMode = schemaMode || inferModeFromTasks(wps) || "numeric";
      const opts = { mode: sprintMode };
      const committed = wps.reduce((s, t) => s + weightOf(t, opts), 0);
      const completed = wps
        .filter((t) => t.statusIsClosed)
        .reduce((s, t) => s + weightOf(t, opts), 0);
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
