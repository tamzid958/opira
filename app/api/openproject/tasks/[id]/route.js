import { errorResponse } from "@/lib/openproject/route-utils";
import { getRepositories } from "@/lib/data/factory";
import { buildAuthzContext } from "@/lib/data/authz/context";

export const dynamic = "force-dynamic";

export async function GET(_req, ctxArg) {
  try {
    const { id } = await ctxArg.params;
    const ctx = await buildAuthzContext();
    const { tasks: repo } = getRepositories();
    const task = await repo.findById(ctx, id);
    if (!task) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json(task);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req, ctxArg) {
  try {
    const { id } = await ctxArg.params;
    const ctx = await buildAuthzContext();
    const { tasks: repo } = getRepositories();
    await repo.delete(ctx, id);
    return new Response(null, { status: 204 });
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
