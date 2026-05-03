// Server-only DB implementation of PermissionRepository.
//
// Returns the same {admin, byProject: {projectId: string[]}} shape as the
// API repo. Reuses the AuthzContext that the route handler already built —
// the data is identical to what the SQL authz source returns.

import "server-only";
import { buildAuthzContext } from "@/lib/data/authz/context";

export async function viewer() {
  const ctx = await buildAuthzContext();
  const byProject = {};
  for (const [pid, set] of ctx.permsByProject.entries()) {
    byProject[String(pid)] = [...set];
  }
  return { admin: ctx.isAdmin, byProject };
}
