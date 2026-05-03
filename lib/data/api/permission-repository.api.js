import "server-only";
import { getViewerPermissions } from "@/lib/openproject/permissions";

export async function viewer() {
  const data = await getViewerPermissions();
  // Coerce Sets to arrays for transport — getViewerPermissions already does
  // this, but keep the conversion here so the contract is explicit.
  const byProject = {};
  for (const [pid, perms] of Object.entries(data?.byProject || {})) {
    byProject[pid] = Array.isArray(perms) ? perms : [...perms];
  }
  return { admin: !!data?.admin, byProject };
}
