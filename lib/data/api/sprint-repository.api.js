import "server-only";
import { opFetch, withQuery } from "@/lib/openproject/client";
import { elementsOf, mapVersionToSprint } from "@/lib/openproject/mappers";
import { getCachedSprints, setCachedSprints } from "@/lib/data/redis-lookups-cache";
import { makeCache } from "@/lib/openproject/route-cache";

const LOCAL = makeCache({ ttlMs: 5 * 60_000 }); // 5 min in-process

export async function list(_ctx, opts = {}) {
  const { projectId } = opts;
  const cacheKey = projectId || "__global__";

  const local = LOCAL.get(cacheKey);
  if (local) return local;

  const redis = await getCachedSprints(projectId);
  if (redis) {
    LOCAL.set(cacheKey, redis);
    return redis;
  }

  const path = projectId
    ? withQuery(`/projects/${encodeURIComponent(projectId)}/versions`, { pageSize: 100 })
    : withQuery("/versions", { pageSize: 100 });
  const hal = await opFetch(path);
  const result = elementsOf(hal).map(mapVersionToSprint);

  LOCAL.set(cacheKey, result);
  await setCachedSprints(projectId, result);
  return result;
}
