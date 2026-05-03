// Server-only DB implementation of ProjectRepository.
//
// OpenProject `projects` schema (verified against running OP instance):
//   projects(id, name, identifier, description, active, public, parent_id,
//            status_code, status_explanation, settings jsonb,
//            lft, rgt, templated, created_at, updated_at)
//
// Note: projects has NO `default_version_id` column — defaultVersion in the
// HAL API is a virtual association OP synthesises from `projects.settings`
// or per-project version_settings depending on the version. We surface "—"
// for `sprint`, matching what the API mapper does in installs where the
// link is absent. Same for `responsible_id` (lead): not on the projects
// table here; left null.

import "server-only";
import { getPool } from "./client";
import { mapProjectRow } from "./row-mappers";

// 60-second in-memory cache. Project membership and visibility change on
// the order of minutes (admins add a member, archive a project) so 60s
// is short enough that fresh changes surface within the next page load,
// but long enough that the project switcher and dashboards don't re-issue
// the same query for every page navigation in the same session.
//
// Cache key collapses by viewer "shape":
//   - admins share one entry (they all see the same projects)
//   - non-admins are keyed by sorted projectIds, so two members of the
//     same set of projects share an entry too
const TTL_MS = 60_000;
const cache = new Map();

function cacheKeyFor(ctx) {
  if (ctx?.isAdmin) return "admin";
  const ids = Array.isArray(ctx?.projectIds) ? [...ctx.projectIds].sort((a, b) => a - b) : [];
  return `member:${ids.join(",")}`;
}

export async function list(ctx, _opts = {}) {
  const key = cacheKeyFor(ctx);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

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
  const value = rows.map((r) => mapProjectRow(r, ctx));
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

// Exposed for tests and for future write paths that should bust the cache
// (e.g. admin creates/archives a project). Pass nothing to flush all keys.
export function invalidateProjectCache(key) {
  if (key) cache.delete(key);
  else cache.clear();
}
