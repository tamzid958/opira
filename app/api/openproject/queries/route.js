import { errorResponse } from "@/lib/openproject/route-utils";
import { getRepositories } from "@/lib/data/factory";
import { buildAuthzContext } from "@/lib/data/authz/context";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId") || undefined;
    const starredOnly = url.searchParams.get("starredOnly") === "1";
    const ctx = await buildAuthzContext();
    const { queries: repo } = getRepositories();
    const result = await repo.list(ctx, { projectId, starredOnly });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req) {
  try {
    const data = await req.json();
    if (!data.name) {
      return Response.json({ error: "name is required" }, { status: 400 });
    }
    const ctx = await buildAuthzContext();
    const { queries: repo } = getRepositories();
    const created = await repo.create(ctx, data);
    return Response.json(created);
  } catch (e) {
    return errorResponse(e);
  }
}
