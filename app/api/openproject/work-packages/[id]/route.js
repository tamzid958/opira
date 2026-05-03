import { errorResponse } from "@/lib/openproject/route-utils";
import { getRepositories } from "@/lib/data/factory";
import { buildAuthzContext } from "@/lib/data/authz/context";

export const dynamic = "force-dynamic";

export async function GET(_req, ctxArg) {
  try {
    const { id } = await ctxArg.params;
    const ctx = await buildAuthzContext();
    const { tasks: repo } = getRepositories();
    const wp = await repo.findById(ctx, id);
    if (!wp) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json(wp);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req, ctxArg) {
  try {
    const { id } = await ctxArg.params;
    const patch = await req.json();
    const ctx = await buildAuthzContext();
    const { tasks: repo } = getRepositories();
    const updated = await repo.update(ctx, id, patch);
    return Response.json(updated);
  } catch (e) {
    return errorResponse(e);
  }
}
