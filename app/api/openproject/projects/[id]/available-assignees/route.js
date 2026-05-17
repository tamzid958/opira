import { opFetch, withQuery } from "@/lib/openproject/client";
import { errorResponse } from "@/lib/openproject/route-utils";
import { elementsOf, mapUser } from "@/lib/openproject/mappers";
import { getCachedAssignees, setCachedAssignees } from "@/lib/data/redis-lookups-cache";
import { availableAssigneesCache } from "@/lib/openproject/ephemeral-caches";

export const dynamic = "force-dynamic";

export async function GET(_req, ctx) {
  try {
    const { id } = await ctx.params;

    const local = availableAssigneesCache.get(id);
    if (local) return Response.json(local);

    const redis = await getCachedAssignees(id);
    if (redis) {
      availableAssigneesCache.set(id, redis);
      return Response.json(redis);
    }

    const path = withQuery(`/projects/${encodeURIComponent(id)}/available_assignees`, {
      pageSize: "200",
    });
    const hal = await opFetch(path);
    const result = elementsOf(hal).map(mapUser).filter(Boolean);

    availableAssigneesCache.set(id, result);
    await setCachedAssignees(id, result);
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
