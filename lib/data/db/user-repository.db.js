// `users` is shared with groups/placeholders via STI on `type`; restrict
// to 'User' so the result mirrors /api/v3/users. status=1 means active.

import "server-only";
import { getPool } from "./client";
import { mapUserRow } from "./row-mappers";

const TTL_MS = 5 * 60_000;
let cache = null; // { promise, expiresAt, pageSize }

async function fetchUsers(limit) {
  const { rows } = await getPool().query(
    `SELECT id, firstname, lastname, login
       FROM users
      WHERE type = 'User' AND status = 1   -- 1 = active
      ORDER BY lastname ASC, firstname ASC
      LIMIT $1`,
    [limit],
  );
  return rows.map(mapUserRow).filter(Boolean);
}

export function list(_ctx, opts = {}) {
  const limit = Number.isFinite(opts.pageSize) ? opts.pageSize : 100;
  if (cache && cache.expiresAt > Date.now() && cache.pageSize === limit) {
    return cache.promise;
  }
  const promise = fetchUsers(limit).catch((e) => {
    if (cache?.promise === promise) cache = null;
    throw e;
  });
  cache = { promise, expiresAt: Date.now() + TTL_MS, pageSize: limit };
  return promise;
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
