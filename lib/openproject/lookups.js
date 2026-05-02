import "server-only";

import { opFetch } from "./client";
import {
  elementsOf,
  indexById,
  mapPriority,
  mapStatus,
  mapType,
} from "./mappers";
import { makeCache } from "./route-cache";

// Status / type / priority lists are project-config — they change on the
// order of months, not requests. Cache 5 min so the hot task routes
// (list, detail, PATCH, POST) don't fan out three extra OP calls per hit.
const CACHE = makeCache({ ttlMs: 5 * 60 * 1000 });

export async function loadLookups(projectId) {
  const cacheKey = projectId || "__global__";
  const hit = CACHE.get(cacheKey);
  if (hit) return hit;

  const typesPath = projectId
    ? `/projects/${encodeURIComponent(projectId)}/types`
    : "/types";
  const [statusesHal, typesHal, prioritiesHal] = await Promise.all([
    opFetch("/statuses").catch(() => null),
    opFetch(typesPath).catch(() => null),
    opFetch("/priorities").catch(() => null),
  ]);
  const statuses = elementsOf(statusesHal).map(mapStatus);
  const types = elementsOf(typesHal).map(mapType);
  const priorities = elementsOf(prioritiesHal).map(mapPriority);
  const lookups = {
    statuses,
    types,
    priorities,
    lookupIndex: {
      statuses: indexById(statuses),
      types: indexById(types),
      priorities: indexById(priorities),
    },
  };
  CACHE.set(cacheKey, lookups);
  return lookups;
}
