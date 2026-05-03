// Server-only AuthzContext source for the API mode.
//
// Wraps `getViewerPermissions()` (lib/openproject/permissions.js), which is
// already cached 5 min per user, and translates the {admin, byProject:
// {id: string[]}} shape into the AuthzContext shape repos consume.

import "server-only";
import { getViewerPermissions } from "@/lib/openproject/permissions";

/** @typedef {import("@/lib/data/ports").AuthzContext} AuthzContext */

/**
 * @param {{user: {id: string}}} session
 * @returns {Promise<AuthzContext>}
 */
export async function fromApiPermissions(session) {
  const { admin, byProject } = await getViewerPermissions();
  const permsByProject = new Map();
  for (const [pid, perms] of Object.entries(byProject || {})) {
    const id = Number(pid);
    if (Number.isFinite(id)) {
      permsByProject.set(id, new Set(perms));
    }
  }
  return {
    userId: String(session.user.id),
    isAdmin: !!admin,
    projectIds: [...permsByProject.keys()],
    permsByProject,
  };
}
