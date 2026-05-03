import { errorResponse } from "@/lib/openproject/route-utils";
import { getRepositories } from "@/lib/data/factory";
import { buildAuthzContext } from "@/lib/data/authz/context";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("project") || undefined;

    const ctx = await buildAuthzContext();
    const { sprints: repo } = getRepositories();
    const result = await repo.list(ctx, { projectId });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
