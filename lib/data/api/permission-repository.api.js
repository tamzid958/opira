import "server-only";
import { getViewerPermissions } from "@/lib/openproject/permissions";

export async function viewer() {
  const data = await getViewerPermissions();
  return { admin: !!data?.admin, byProject: data?.byProject || {} };
}
