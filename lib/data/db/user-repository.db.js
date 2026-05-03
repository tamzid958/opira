// Server-only DB implementation of UserRepository.
//
// OpenProject `users` table is shared with groups/placeholders via STI on
// `type`. We restrict to `type = 'User'` so the result mirrors what
// /api/v3/users returns.

import "server-only";
import { getPool } from "./client";
import { mapUserRow } from "./row-mappers";

// 5-minute in-memory cache. The user list (active users only) changes on
// the order of days — new hires, departures, password resets. Process-
// wide because the result is the same for every viewer (no per-user
// filtering at this level). The assignee picker, members page, mentions
// dropdown all hit this — caching pulls them off PG entirely after a
// single warm-up.
const TTL_MS = 5 * 60_000;
let cache = null; // { value, expiresAt, pageSize }

export async function list(_ctx, opts = {}) {
  const limit = Number.isFinite(opts.pageSize) ? opts.pageSize : 100;
  if (cache && cache.expiresAt > Date.now() && cache.pageSize === limit) {
    return cache.value;
  }
  const { rows } = await getPool().query(
    `SELECT id, firstname, lastname, login
       FROM users
      WHERE type = 'User' AND status = 1   -- 1 = active
      ORDER BY lastname ASC, firstname ASC
      LIMIT $1`,
    [limit],
  );
  const value = rows.map(mapUserRow).filter(Boolean);
  cache = { value, expiresAt: Date.now() + TTL_MS, pageSize: limit };
  return value;
}

export async function me(ctx) {
  // No cache: cheap, identity-bound, occasionally needs to be fresh after
  // OP-side profile edits. Same query the legacy `/users/me` route ran.
  if (!ctx?.userId) return null;
  const { rows } = await getPool().query(
    `SELECT id, firstname, lastname, login
       FROM users
      WHERE id = $1
      LIMIT 1`,
    [Number(ctx.userId)],
  );
  return mapUserRow(rows[0]) || null;
}

// Exposed for tests and for write paths that should bust the cache
// (e.g. an admin creates a user via the API repo).
export function invalidateUserCache() {
  cache = null;
}
