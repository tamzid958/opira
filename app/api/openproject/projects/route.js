import { errorResponse } from "@/lib/openproject/route-utils";
import { getRepositories } from "@/lib/data/factory";
import { buildAuthzContext } from "@/lib/data/authz/context";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const pageSize = url.searchParams.get("pageSize") || "100";
    const filtersParam = url.searchParams.get("filters");

    const ctx = await buildAuthzContext();
    const { projects: repo } = getRepositories();
    const result = await repo.list(ctx, {
      pageSize: Number(pageSize),
      filters: filtersParam || undefined,
    });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
