// 5-minute in-process cache for status/type/priority lookups, mirroring
// `lib/openproject/lookups.js`. Keeps the hot WP list/detail queries from
// re-running 3 reference-table SELECTs every request.

import "server-only";
import { statuses, types, priorities } from "./lookup-repository.db";
import { indexById } from "@/lib/openproject/mappers";

const TTL_MS = 5 * 60_000;
const cache = new Map();

export async function loadDbLookups(projectId) {
  const key = projectId || "__global__";
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const [s, t, p] = await Promise.all([
    statuses(),
    types(undefined, { projectId }),
    priorities(),
  ]);
  const value = {
    statuses: s,
    types: t,
    priorities: p,
    lookupIndex: {
      statuses: indexById(s),
      types: indexById(t),
      priorities: indexById(p),
    },
  };
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}
