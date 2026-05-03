import { errorResponse } from "@/lib/openproject/route-utils";
import { getRepositories } from "@/lib/data/factory";
import { buildAuthzContext } from "@/lib/data/authz/context";

export const dynamic = "force-dynamic";

export async function GET(_req, ctxArg) {
  try {
    const { id } = await ctxArg.params;
    const ctx = await buildAuthzContext();
    const { categories: repo } = getRepositories();
    const result = await repo.list(ctx, { projectId: id });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req, ctxArg) {
  try {
    const { id } = await ctxArg.params;
    const data = await req.json();
    if (!data.name) {
      return Response.json({ error: "name required" }, { status: 400 });
    }
    const ctx = await buildAuthzContext();
    const { categories: repo } = getRepositories();
    const created = await repo.create(ctx, {
      projectId: id,
      name: data.name,
      defaultAssigneeId: data.defaultAssigneeId,
    });
    return Response.json(created);
  } catch (e) {
    return errorResponse(e);
  }
}
