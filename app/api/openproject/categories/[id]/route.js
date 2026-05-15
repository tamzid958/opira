import { opFetch } from "@/lib/openproject/client";
import { mapCategory } from "@/lib/openproject/mappers";
import { errorResponse } from "@/lib/openproject/route-utils";
import { flushCategoriesCache } from "@/lib/data/redis-lookups-cache";

export const dynamic = "force-dynamic";

export async function GET(_req, ctx) {
  try {
    const { id } = await ctx.params;
    const c = await opFetch(`/categories/${id}`);
    return Response.json(mapCategory(c));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req, ctx) {
  try {
    const { id } = await ctx.params;
    const data = await req.json();
    const body = {};
    if (data.name !== undefined) body.name = data.name;
    if (data.defaultAssigneeId !== undefined) {
      body._links = {
        defaultAssignee: data.defaultAssigneeId
          ? { href: `/api/v3/users/${data.defaultAssigneeId}` }
          : { href: null },
      };
    }
    const c = await opFetch(`/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    void flushCategoriesCache();
    return Response.json(mapCategory(c));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req, ctx) {
  try {
    const { id } = await ctx.params;
    await opFetch(`/categories/${id}`, { method: "DELETE" });
    void flushCategoriesCache();
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
