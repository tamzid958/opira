import { opFetch, withQuery } from "@/lib/openproject/client";
import { errorResponse } from "@/lib/openproject/route-utils";
import { elementsOf, mapUser } from "@/lib/openproject/mappers";
import { makeCache } from "@/lib/openproject/route-cache";
import { getCachedAssignees, setCachedAssignees } from "@/lib/data/redis-lookups-cache";

export const dynamic = "force-dynamic";

// Project-scoped assignee list — OpenProject's
// /api/v3/projects/{id}/available_assignees only returns principals who
// can be set as assignee on a WP in this project (i.e. members + groups).
// Used to drive the project-aware assignee picker.
// Invalidated on any membership mutation via flushAssigneesCache().
const LOCAL = makeCache({ ttlMs: 15 * 60_000 }); // 15 min in-process

export async function GET(_req, ctx) {
  try {
    const { id } = await ctx.params;

    const local = LOCAL.get(id);
    if (local) return Response.json(local);

    const redis = await getCachedAssignees(id);
    if (redis) {
      LOCAL.set(id, redis);
      return Response.json(redis);
    }

    const path = withQuery(`/projects/${encodeURIComponent(id)}/available_assignees`, {
      pageSize: "200",
    });
    const hal = await opFetch(path);
    const result = elementsOf(hal).map(mapUser).filter(Boolean);

    LOCAL.set(id, result);
    await setCachedAssignees(id, result);
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
