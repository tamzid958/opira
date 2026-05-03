import { errorResponse } from "@/lib/openproject/route-utils";
import { getRepositories } from "@/lib/data/factory";

export const dynamic = "force-dynamic";

// Effective permissions for the signed-in user, folded across all of their
// memberships. The shape is `{admin: bool, byProject: {[projectId]: string[]}}`.
// Cached per-user in-process for 5 min by the underlying source.
export async function GET() {
  try {
    const { permissions: repo } = getRepositories();
    const result = await repo.viewer();
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
