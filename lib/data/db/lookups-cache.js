import "server-only";
import { statuses, types, priorities } from "./lookup-repository.db";
import { indexById } from "@/lib/openproject/mappers";

const TTL_MS = 5 * 60_000;
const cache = new Map();

async function load(projectId) {
  const [s, t, p] = await Promise.all([
    statuses(),
    types(undefined, { projectId }),
    priorities(),
  ]);
  return {
    statuses: s,
    types: t,
    priorities: p,
    lookupIndex: {
      statuses: indexById(s),
      types: indexById(t),
      priorities: indexById(p),
    },
  };
}

// Cache the in-flight promise so concurrent first-misses share one load
// instead of firing N parallel triple-SELECTs. Reject paths drop the entry
// so the next call retries.
export function loadDbLookups(projectId) {
  const key = projectId || "__global__";
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.promise;

  const promise = load(projectId).catch((e) => {
    if (cache.get(key)?.promise === promise) cache.delete(key);
    throw e;
  });
  cache.set(key, { promise, expiresAt: Date.now() + TTL_MS });
  return promise;
}
