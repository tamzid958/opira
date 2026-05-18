import { buildFilters, fetchAllPages } from "@/lib/openproject/client";
import { mapWorkPackage } from "@/lib/openproject/mappers";
import { loadLookups } from "@/lib/openproject/lookups";
import { errorResponse } from "@/lib/openproject/route-utils";

export const dynamic = "force-dynamic";

// GET /api/openproject/projects/<id>/scope-changes?since=<ISO>&sprintId=
//
// Returns { added, removed, changed } between the given baseline timestamp
// and the current state. Implemented as two filtered fetches of /work_packages
// — current state and snapshot at `since`. Field-level diffs are deferred;
// this first pass only flags add/remove and a coarse "changed" set (when
// title or status differs).
export async function GET(req, ctx) {
  try {
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const since = url.searchParams.get("since");
    const sprintId = url.searchParams.get("sprintId");
    if (!since) {
      return Response.json({ error: "since is required" }, { status: 400 });
    }
    const filters = [
      { project: { operator: "=", values: [String(id)] } },
    ];
    if (sprintId) {
      filters.push({ version: { operator: "=", values: [String(sprintId)] } });
    }
    const filtersJson = buildFilters(filters);

    const [now, then, lookups] = await Promise.all([
      fetchAllPages("/work_packages", { filters: filtersJson }),
      fetchAllPages("/work_packages", { filters: filtersJson, timestamps: since }),
      loadLookups(id),
    ]);
    const nowMap = new Map(now.map((wp) => [String(wp.id), wp]));
    const thenMap = new Map(then.map((wp) => [String(wp.id), wp]));

    const added = [];
    const removed = [];
    const changed = [];
    for (const [k, wp] of nowMap) {
      const prev = thenMap.get(k);
      if (!prev) {
        added.push(mapWorkPackage(wp, lookups));
        continue;
      }
      const titleDiff = (wp.subject || "") !== (prev.subject || "");
      const statusDiff =
        wp._links?.status?.href !== prev._links?.status?.href;
      if (titleDiff || statusDiff) {
        changed.push({
          before: mapWorkPackage(prev, lookups),
          after: mapWorkPackage(wp, lookups),
          fields: [titleDiff && "title", statusDiff && "status"].filter(Boolean),
        });
      }
    }
    for (const [k, wp] of thenMap) {
      if (!nowMap.has(k)) removed.push(mapWorkPackage(wp, lookups));
    }
    return Response.json({ since, added, removed, changed });
  } catch (e) {
    return errorResponse(e);
  }
}
