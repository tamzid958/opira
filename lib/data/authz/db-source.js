// Server-only AuthzContext source for the DB mode.
//
// Queries OpenProject's PostgreSQL directly to derive a viewer's project
// membership and effective permissions. Cached 5 min per user, matching the
// API source's TTL.
//
// Schema assumptions (verified by lib/data/db/schema-canary.test.js):
//   users(id, admin)
//   members(id, user_id, project_id, entity_type, entity_id)
//   member_roles(member_id, role_id)
//   role_permissions(role_id, permission)   -- one row per (role, permission)
//   roles(id, builtin)                      -- builtin = 1 → non_member
//   projects(id, identifier, active, public)

import "server-only";
import { getPool } from "@/lib/data/db/client";

/** @typedef {import("@/lib/data/ports").AuthzContext} AuthzContext */

const TTL_MS = 5 * 60_000;
const cache = new Map(); // userId -> { promise, expiresAt }

// `non_member` role permissions and the public-projects list don't depend
// on the viewer, so cache them once per process (still TTL'd) and reuse
// across all users. Saves two extra queries on every per-user cache miss.
let nonMemberCache = null; // { promise, expiresAt }

// OpenProject's `roles.builtin` enum:
//   0 = regular project role
//   1 = non_member  (default permissions for authenticated viewers on a
//                    public project they are not a member of)
//   2 = anonymous   (default permissions for unauthenticated viewers)
const NON_MEMBER_BUILTIN = 1;

async function fetchNonMemberContext(pool) {
  const [permsRes, publicRes] = await Promise.all([
    pool.query(
      `SELECT rp.permission
         FROM roles r
         JOIN role_permissions rp ON rp.role_id = r.id
        WHERE r.builtin = $1`,
      [NON_MEMBER_BUILTIN],
    ),
    pool.query(`SELECT id FROM projects WHERE active = TRUE AND public = TRUE`),
  ]);
  return {
    perms: permsRes.rows.map((r) => r.permission).filter(Boolean),
    publicProjectIds: publicRes.rows
      .map((r) => Number(r.id))
      .filter((n) => Number.isFinite(n)),
  };
}

function loadNonMemberContext(pool) {
  if (nonMemberCache && nonMemberCache.expiresAt > Date.now()) {
    return nonMemberCache.promise;
  }
  const promise = fetchNonMemberContext(pool).catch((e) => {
    if (nonMemberCache?.promise === promise) nonMemberCache = null;
    throw e;
  });
  nonMemberCache = { promise, expiresAt: Date.now() + TTL_MS };
  return promise;
}

async function buildAuthzContext(userId) {
  const pool = getPool();
  const numericUserId = Number(userId);
  if (!Number.isFinite(numericUserId)) {
    return { userId, isAdmin: false, projectIds: [], permsByProject: new Map() };
  }

  // Per-viewer queries run in parallel with the shared `non_member`
  // context (which is process-cached, so usually a no-op).
  const [adminRes, membersRes, nonMember] = await Promise.all([
    pool.query("SELECT admin FROM users WHERE id = $1 LIMIT 1", [numericUserId]),
    pool.query(
      `SELECT m.project_id AS project_id, rp.permission AS permission
         FROM members m
         JOIN member_roles mr     ON mr.member_id = m.id
         JOIN role_permissions rp ON rp.role_id   = mr.role_id
        WHERE m.user_id = $1
          AND m.entity_type IS NULL
          AND m.project_id IS NOT NULL`,
      [numericUserId],
    ),
    loadNonMemberContext(pool),
  ]);
  const isAdmin = adminRes.rows[0]?.admin === true;

  /** @type {Map<number, Set<string>>} */
  const permsByProject = new Map();
  for (const row of membersRes.rows) {
    const pid = Number(row.project_id);
    if (!Number.isFinite(pid) || !row.permission) continue;
    let set = permsByProject.get(pid);
    if (!set) {
      set = new Set();
      permsByProject.set(pid, set);
    }
    set.add(row.permission);
  }

  // Fold non_member permissions into every public project's permission set
  // (including projects the user has no explicit membership in). If the user
  // is already a member, the set already exists — we union into it; otherwise
  // we create a new entry so visibility filters surface those projects too.
  if (nonMember.perms.length > 0) {
    for (const pid of nonMember.publicProjectIds) {
      let set = permsByProject.get(pid);
      if (!set) {
        set = new Set();
        permsByProject.set(pid, set);
      }
      for (const p of nonMember.perms) set.add(p);
    }
  }

  return {
    userId,
    isAdmin,
    projectIds: [...permsByProject.keys()],
    permsByProject,
  };
}

/**
 * @param {{user: {id: string}}} session
 * @returns {Promise<AuthzContext>}
 */
export function fromDbPermissions(session) {
  const userId = String(session.user.id);
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.promise;

  const promise = buildAuthzContext(userId).catch((e) => {
    if (cache.get(userId)?.promise === promise) cache.delete(userId);
    throw e;
  });
  cache.set(userId, { promise, expiresAt: Date.now() + TTL_MS });
  return promise;
}

export function invalidateDbAuthzCache(userId) {
  if (userId) {
    cache.delete(String(userId));
  } else {
    cache.clear();
    nonMemberCache = null;
  }
}
