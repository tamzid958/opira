import { buildFilters, fetchAllPages, opFetch } from "@/lib/openproject/client";
import { buildCreateBody, mapWorkPackage } from "@/lib/openproject/mappers";
import { errorResponse, nativeId } from "@/lib/openproject/route-utils";

export const dynamic = "force-dynamic";

// GET children of a work package via parent filter.
export async function GET(_req, ctx) {
  try {
    const { id } = await ctx.params;
    const filters = buildFilters([{ parent: { operator: "=", values: [nativeId(id)] } }]);
    const els = await fetchAllPages(
      "/work_packages",
      { filters, sortBy: JSON.stringify([["createdAt", "asc"]]) },
    );
    const tasks = els.map((wp) => mapWorkPackage(wp));
    return Response.json(tasks);
  } catch (e) {
    return errorResponse(e);
  }
}

// Create a new child work package — requires parent link + project.
export async function POST(req, ctx) {
  try {
    const { id } = await ctx.params;
    const data = await req.json();
    if (!data.projectId) {
      return Response.json({ error: "projectId is required" }, { status: 400 });
    }
    const payload = buildCreateBody(
      { ...data, parent: nativeId(id) },
      { projectId: data.projectId },
    );
    const wp = await opFetch(
      `/projects/${encodeURIComponent(data.projectId)}/work_packages`,
      { method: "POST", body: JSON.stringify(payload) },
    );
    return Response.json(mapWorkPackage(wp));
  } catch (e) {
    return errorResponse(e);
  }
}
