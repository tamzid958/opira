import "server-only";
import { opFetch, withQuery } from "@/lib/openproject/client";
import { elementsOf, mapCategory } from "@/lib/openproject/mappers";
import { makeCache } from "@/lib/openproject/route-cache";
import {
  getCachedCategories,
  setCachedCategories,
  flushCategoriesCache,
} from "@/lib/data/redis-lookups-cache";

// 1 hour in-process; Redis TTL is 1 day. Invalidated on create/update/delete.
const LOCAL = makeCache({ ttlMs: 60 * 60_000 });

export function clearLocalCache(projectId) {
  if (projectId) LOCAL.delete(projectId);
  else LOCAL.clear();
}

export async function list(_ctx, { projectId } = {}) {
  if (!projectId) throw new Error("projectId is required");

  const local = LOCAL.get(projectId);
  if (local) return local;

  const redis = await getCachedCategories(projectId);
  if (redis) {
    LOCAL.set(projectId, redis);
    return redis;
  }

  const path = withQuery(`/projects/${encodeURIComponent(projectId)}/categories`, {
    pageSize: 200,
  });
  const hal = await opFetch(path);
  const result = elementsOf(hal).map(mapCategory);

  LOCAL.set(projectId, result);
  await setCachedCategories(projectId, result);
  return result;
}

export async function create(_ctx, { projectId, name, defaultAssigneeId }) {
  if (!projectId || !name) throw new Error("projectId and name are required");
  const body = {
    name,
    _links: { project: { href: `/api/v3/projects/${projectId}` } },
  };
  if (defaultAssigneeId) {
    body._links.defaultAssignee = { href: `/api/v3/users/${defaultAssigneeId}` };
  }
  const c = await opFetch("/categories", {
    method: "POST",
    body: JSON.stringify(body),
  });
  LOCAL.delete(projectId);
  void flushCategoriesCache(projectId);
  return mapCategory(c);
}
