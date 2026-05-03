import { errorResponse } from "@/lib/openproject/route-utils";
import { getRepositories } from "@/lib/data/factory";
import { buildAuthzContext } from "@/lib/data/authz/context";

export const dynamic = "force-dynamic";

export async function GET(_req, ctxArg) {
  try {
    const { id } = await ctxArg.params;
    const ctx = await buildAuthzContext();
    const { activities: repo } = getRepositories();
    const result = await repo.list(ctx, { workPackageId: id });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req, ctxArg) {
  try {
    const { id } = await ctxArg.params;
    const { text } = await req.json();
    if (!text || !String(text).trim()) {
      return Response.json({ error: "Comment cannot be empty" }, { status: 400 });
    }
    const ctx = await buildAuthzContext();
    const { activities: repo } = getRepositories();
    const created = await repo.create(ctx, { workPackageId: id, text });
    return Response.json(created);
  } catch (e) {
    return errorResponse(e);
  }
}
