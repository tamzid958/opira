import { buildFilters, fetchAllPages, opFetch } from "@/lib/openproject/client";
import {
  elementsOf,
  mapActivity,
  mapVersionFull,
  mapWorkPackage,
} from "@/lib/openproject/mappers";
import { closedSprintMentions } from "@/lib/openproject/activity-parsing";
import { errorResponse } from "@/lib/openproject/route-utils";
import { makeCache } from "@/lib/openproject/route-cache";

export const dynamic = "force-dynamic";

const CACHE = makeCache({ ttlMs: 5 * 60 * 1000 });

// Hard cap on per-WP activity fetches per project. Carry-over chips are a
// nice-to-have — past the cap we silently drop signals rather than block.
const WP_FETCH_CAP = 300;

// GET /api/openproject/projects/<id>/carryover
//
// Returns { byWpId: { <id>: { count, sprintNames } }, truncated }. A WP is
// "carried over" when it currently sits in an open/locked sprint AND its
// activity history shows it was previously in one or more closed sprints.
//
// Computed by scanning per-WP activities — bounded by WP_FETCH_CAP. Cached
// per project for 5 minutes; the response is small even on large projects.
async function computeCarryover(projectId) {
  const versionsHal = await opFetch(
    `/projects/${encodeURIComponent(projectId)}/versions`,
  ).catch(() => null);
  const versions = elementsOf(versionsHal).map(mapVersionFull);
  const openLockedIds = versions
    .filter((s) => s.status === "open" || s.status === "locked")
    .map((s) => s.id);
  const closedNames = versions
    .filter((s) => s.status === "closed")
    .map((s) => s.name)
    .filter(Boolean);

  if (openLockedIds.length === 0 || closedNames.length === 0) {
    return { byWpId: {}, truncated: false };
  }

  const wpEls = await fetchAllPages(
    `/projects/${encodeURIComponent(projectId)}/work_packages`,
    {
      filters: buildFilters([
        { version: { operator: "=", values: openLockedIds } },
      ]),
    },
  );
  const wps = wpEls.map((wp) => mapWorkPackage(wp));
  const truncated = wps.length > WP_FETCH_CAP;
  const scanWps = truncated ? wps.slice(0, WP_FETCH_CAP) : wps;

  const perWp = await Promise.all(
    scanWps.map((t) =>
      opFetch(`/work_packages/${t.nativeId}/activities`)
        .then((aHal) => ({ wpId: t.nativeId, acts: elementsOf(aHal).map(mapActivity) }))
        .catch(() => null),
    ),
  );

  const byWpId = {};
  for (const r of perWp) {
    if (!r) continue;
    const priorClosed = new Set();
    for (const a of r.acts) {
      for (const detail of a.details || []) {
        for (const name of closedSprintMentions(detail, closedNames)) {
          priorClosed.add(name);
        }
      }
    }
    if (priorClosed.size > 0) {
      byWpId[r.wpId] = {
        count: priorClosed.size,
        sprintNames: Array.from(priorClosed),
      };
    }
  }

  return { byWpId, truncated };
}

export async function GET(_req, ctx) {
  try {
    const { id } = await ctx.params;
    const cached = CACHE.get(id);
    if (cached) return Response.json(cached);
    const value = await computeCarryover(id);
    CACHE.set(id, value);
    return Response.json(value);
  } catch (e) {
    return errorResponse(e);
  }
}
