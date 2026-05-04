// Project list. Cache keyed by viewer "shape": admins share one entry;
// non-admins share entries with the same set of projectIds.
//
// `projects` has no `default_version_id` column — defaultVersion in the
// HAL API is a virtual association OP synthesises from `projects.settings`
// or per-project version_settings. We surface "—" for `sprint`, matching
// the API mapper when the link is absent. Same for `responsible_id`.

import "server-only";
import { getPool } from "./client";
import { mapProjectRow } from "./row-mappers";

const TTL_MS = 60_000;
const cache = new Map();

function cacheKeyFor(ctx) {
  if (ctx?.isAdmin) return "admin";
  const ids = Array.isArray(ctx?.projectIds) ? [...ctx.projectIds].sort((a, b) => a - b) : [];
  return `member:${ids.join(",")}`;
}

async function fetchProjects(ctx) {
  const params = [];
  // Project list always filters by `active = TRUE` regardless of role —
  // matches the API's default `filters=[{active:t}]` so the project
  // switcher and dashboards don't surface archived projects to anyone.
  const conditions = ["p.active = TRUE"];

  if (!ctx?.isAdmin) {
    const visibleIds = ctx?.projectIds?.length ? ctx.projectIds : [];
    if (visibleIds.length === 0) {
      conditions.push("p.public = TRUE");
    } else {
      params.push(visibleIds);
      conditions.push(`(p.public = TRUE OR p.id = ANY($${params.length}::int[]))`);
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT p.id,
           p.name,
           p.identifier,
           p.description
      FROM projects p
      ${where}
     ORDER BY p.name ASC
     LIMIT 500
  `;

  const { rows } = await getPool().query(sql, params);
  return rows.map((r) => mapProjectRow(r, ctx));
}

export function list(ctx, _opts = {}) {
  const key = cacheKeyFor(ctx);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.promise;

  const promise = fetchProjects(ctx).catch((e) => {
    if (cache.get(key)?.promise === promise) cache.delete(key);
    throw e;
  });
  cache.set(key, { promise, expiresAt: Date.now() + TTL_MS });
  return promise;
}

// Exposed for tests and for future write paths that should bust the cache
// (e.g. admin creates/archives a project). Pass nothing to flush all keys.
export function invalidateProjectCache(key) {
  if (key) cache.delete(key);
  else cache.clear();
}
