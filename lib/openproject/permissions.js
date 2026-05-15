// Server-only effective-permissions loader.
//
// OpenProject's API returns each role's permission list on the role
// resource (/api/v3/roles/{id}), and a user's role set per project on
// /api/v3/users/{id}/memberships. We fold those into a single
// {projectId: Set<permission>} map and also surface the admin flag
// (admins bypass project-level checks).

import "server-only";
import { auth } from "@/auth";
import { opFetch, fetchAllPages } from "@/lib/openproject/client";
import { mapMembership, mapRole, mapProject } from "@/lib/openproject/mappers";
import {
  getCachedPerms,
  setCachedPerms,
  deleteCachedPerms,
} from "./redis-perms-cache";

const ROLE_TTL_MS = 10 * 60_000;
const VIEWER_TTL_MS = 5 * 60_000;

const roleCache = new Map(); // roleId -> { value, expiresAt }
const viewerCache = new Map(); // userId -> { value, expiresAt }

// Singleflight: coalesces concurrent cache-miss calls per userId into one
// inflight Promise. On cold page load 6–8 route handlers call this
// simultaneously — without deduplication each would fan out to OP
// independently for the same user's memberships and roles.
const inFlight = new Map(); // userId -> Promise<{admin, byProject}>

async function fetchRolePermissions(roleId) {
  const hit = roleCache.get(roleId);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  try {
    const role = await opFetch(`/roles/${roleId}`);
    const mapped = mapRole(role);
    roleCache.set(roleId, { value: mapped.permissions, expiresAt: Date.now() + ROLE_TTL_MS });
    return mapped.permissions;
  } catch {
    // Older OpenProject versions expose roles only as a stub. Cache the empty
    // result so we don't refetch every request, and fall back to per-resource
    // _links checks at action time.
    roleCache.set(roleId, { value: [], expiresAt: Date.now() + ROLE_TTL_MS });
    return [];
  }
}

// Fetch memberships, tolerate failures (some roles can't read the user's
// own membership index — surface an empty map and let the project-HAL
// fallback fill in.
async function loadFromMemberships(userId) {
  let memberships = [];
  try {
    memberships = await fetchAllPages(
      `/users/${userId}/memberships`,
      {},
      { pageSize: 100, hardCap: 1000 },
    );
  } catch {
    return {};
  }
  const mapped = memberships
    .map(mapMembership)
    .filter((m) => m.isUser !== false && m.projectId);
  const distinctRoleIds = [...new Set(mapped.flatMap((m) => m.roleIds))];
  const rolePermissions = new Map();
  await Promise.all(
    distinctRoleIds.map(async (rid) => {
      rolePermissions.set(rid, await fetchRolePermissions(rid));
    }),
  );
  const byProject = {};
  for (const m of mapped) {
    const set = byProject[m.projectId] || new Set();
    for (const rid of m.roleIds) {
      const perms = rolePermissions.get(rid) || [];
      for (const p of perms) set.add(p);
    }
    byProject[m.projectId] = set;
  }
  return byProject;
}

// Project HAL responses include `_links.versions` / `_links.createVersion`
// / `_links.workPackages` etc. when the viewer can perform those actions.
// We translate those affordances into permission keys so the same UI gates
// keep working when the membership/role list path comes up empty (older
// OP versions, restricted roles, missing `view_members` etc.).
const PROJECT_LINK_TO_PERM = [
  ["manageVersions", "manage_versions"],
  ["addWorkPackages", "add_work_packages"],
  ["manageCategories", "manage_categories"],
  ["manageMembers", "manage_members"],
  ["update", "edit_project"],
  ["delete", "delete_project"],
];

async function loadFromProjectsHal() {
  let projects = [];
  try {
    projects = await fetchAllPages(
      "/projects",
      {},
      { pageSize: 200, hardCap: 1000 },
    );
  } catch {
    return {};
  }
  const out = {};
  for (const p of projects) {
    const proto = mapProject(p);
    const set = new Set();
    for (const [linkKey, permKey] of PROJECT_LINK_TO_PERM) {
      if (proto.permissions?.[linkKey]) set.add(permKey);
    }
    if (set.size > 0) out[proto.id] = set;
  }
  return out;
}

export async function loadEffectivePermissions(userId) {
  const [fromMembers, fromProjects] = await Promise.all([
    loadFromMemberships(userId),
    loadFromProjectsHal(),
  ]);
  // Union the two maps — neither alone is authoritative.
  const merged = {};
  const projectIds = new Set([...Object.keys(fromMembers), ...Object.keys(fromProjects)]);
  for (const pid of projectIds) {
    const set = new Set();
    for (const p of fromMembers[pid] || []) set.add(p);
    for (const p of fromProjects[pid] || []) set.add(p);
    merged[pid] = set;
  }
  // Serialize to plain arrays (Sets don't survive JSON).
  const out = {};
  for (const [pid, set] of Object.entries(merged)) out[pid] = [...set];
  return out;
}

export async function getViewerPermissions() {
  const session = await auth();
  if (!session?.user?.id) {
    return { admin: false, byProject: {} };
  }
  const userId = session.user.id;

  // L1 — in-process Map (zero latency within pod lifetime)
  const hit = viewerCache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  // L2 — Redis (survives restarts, shared across pods, optional)
  const redisCached = await getCachedPerms(userId);
  if (redisCached) {
    viewerCache.set(userId, { value: redisCached, expiresAt: Date.now() + VIEWER_TTL_MS });
    return redisCached;
  }

  // Singleflight — return the already-inflight promise for this user if one exists
  if (inFlight.has(userId)) return inFlight.get(userId);

  const promise = (async () => {
    try {
      // /users/me carries the global admin flag. We hit it once per cache window
      // because the access-token user might not match session.user.id (e.g. the
      // OP admin impersonated someone) — trust the API. If the call fails for a
      // non-auth reason, prefer the previously-cached admin flag rather than
      // silently demoting an admin to non-admin for 5 minutes.
      let admin = hit?.value?.admin === true;
      let canonicalId = userId;
      try {
        const me = await opFetch("/users/me");
        admin = me?.admin === true;
        if (me?.id) canonicalId = String(me.id);
      } catch (e) {
        // 401 means the session is broken — strip admin and let the next
        // mutation throw REAUTH_REQUIRED so the client redirects.
        if (e?.status === 401 || e?.code === "REAUTH_REQUIRED") admin = false;
      }

      const byProject = await loadEffectivePermissions(canonicalId);
      const value = { admin, byProject };

      viewerCache.set(userId, { value, expiresAt: Date.now() + VIEWER_TTL_MS });
      await setCachedPerms(userId, value);

      return value;
    } finally {
      inFlight.delete(userId);
    }
  })();

  inFlight.set(userId, promise);
  return promise;
}

export async function invalidateViewerPermissions(userId) {
  if (userId) viewerCache.delete(userId);
  else viewerCache.clear();
  await deleteCachedPerms(userId ?? null);
}
