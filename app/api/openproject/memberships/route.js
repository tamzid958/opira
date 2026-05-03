import { errorResponse } from "@/lib/openproject/route-utils";
import { getRepositories } from "@/lib/data/factory";
import { buildAuthzContext } from "@/lib/data/authz/context";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId") || undefined;
    const principalId = url.searchParams.get("principalId") || undefined;
    const ctx = await buildAuthzContext();
    const { memberships: repo } = getRepositories();
    const result = await repo.list(ctx, { projectId, principalId });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req) {
  try {
    const data = await req.json();
    if (!data.projectId || !data.principalId || !Array.isArray(data.roleIds) || data.roleIds.length === 0) {
      return Response.json(
        { error: "projectId, principalId, roleIds[] required" },
        { status: 400 },
      );
    }
    const ctx = await buildAuthzContext();
    const { memberships: repo } = getRepositories();
    const created = await repo.create(ctx, data);
    return Response.json(created);
  } catch (e) {
    return errorResponse(e);
  }
}
