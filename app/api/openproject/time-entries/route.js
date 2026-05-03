import { errorResponse } from "@/lib/openproject/route-utils";
import { getRepositories } from "@/lib/data/factory";
import { buildAuthzContext } from "@/lib/data/authz/context";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const query = {
      from: url.searchParams.get("from") || undefined,
      to: url.searchParams.get("to") || undefined,
      projectId: url.searchParams.get("projectId") || undefined,
      userId: url.searchParams.get("userId") || undefined,
      workPackageId: url.searchParams.get("workPackageId") || undefined,
    };
    const ctx = await buildAuthzContext();
    const { timeEntries: repo } = getRepositories();
    const result = await repo.list(ctx, query);
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req) {
  try {
    const data = await req.json();
    if (!data.workPackageId) {
      return Response.json({ error: "workPackageId is required" }, { status: 400 });
    }
    if (data.hours == null) {
      return Response.json({ error: "hours is required" }, { status: 400 });
    }
    const ctx = await buildAuthzContext();
    const { timeEntries: repo } = getRepositories();
    const created = await repo.create(ctx, data);
    return Response.json(created);
  } catch (e) {
    return errorResponse(e);
  }
}
