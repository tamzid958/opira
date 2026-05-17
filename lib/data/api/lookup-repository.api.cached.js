import "server-only";
import * as raw from "./lookup-repository.api";
import {
  getCachedStatuses, setCachedStatuses,
  getCachedTypes,    setCachedTypes,
  getCachedPriorities, setCachedPriorities,
} from "@/lib/data/redis-lookups-cache";
import { makeCache } from "@/lib/openproject/route-cache";

// In-process L2: coalesces concurrent first-misses within a pod and avoids
// a Redis round-trip on every request once warmed.
const LOCAL = {
  statuses:   makeCache({ ttlMs: 60 * 60_000 }),
  types:      makeCache({ ttlMs: 60 * 60_000 }),
  priorities: makeCache({ ttlMs: 60 * 60_000 }),
};

export async function statuses(ctx) {
  const local = LOCAL.statuses.get("__all__");
  if (local) return local;

  const redis = await getCachedStatuses();
  if (redis) {
    LOCAL.statuses.set("__all__", redis);
    return redis;
  }

  const result = await raw.statuses(ctx);
  LOCAL.statuses.set("__all__", result);
  await setCachedStatuses(result);
  return result;
}

export async function types(ctx, opts = {}) {
  const { projectId } = opts;
  const localKey = projectId || "__global__";

  const local = LOCAL.types.get(localKey);
  if (local) return local;

  const redis = await getCachedTypes(projectId);
  if (redis) {
    LOCAL.types.set(localKey, redis);
    return redis;
  }

  const result = await raw.types(ctx, opts);
  LOCAL.types.set(localKey, result);
  await setCachedTypes(projectId, result);
  return result;
}

export function clearLocalCache() {
  LOCAL.statuses.clear();
  LOCAL.types.clear();
  LOCAL.priorities.clear();
}

export async function priorities(ctx) {
  const local = LOCAL.priorities.get("__all__");
  if (local) return local;

  const redis = await getCachedPriorities();
  if (redis) {
    LOCAL.priorities.set("__all__", redis);
    return redis;
  }

  const result = await raw.priorities(ctx);
  LOCAL.priorities.set("__all__", result);
  await setCachedPriorities(result);
  return result;
}
