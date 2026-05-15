import { opFetch } from "@/lib/openproject/client";
import { buildVersionPatchBody, mapVersionFull } from "@/lib/openproject/mappers";
import { errorResponse } from "@/lib/openproject/route-utils";
import { flushSprintCache } from "@/lib/data/redis-lookups-cache";

export const dynamic = "force-dynamic";

export async function GET(_req, ctx) {
  try {
    const { id } = await ctx.params;
    const v = await opFetch(`/versions/${id}`);
    return Response.json(mapVersionFull(v));
  } catch (e) {
    return errorResponse(e);
  }
}

// OP versions don't expose or require `lockVersion` — verified end-to-end
// against a live install (PATCH /versions/{id} without lockVersion returns
// 200). Sending `lockVersion: null` would otherwise bake an invalid field
// into every body.
export async function PATCH(req, ctx) {
  try {
    const { id } = await ctx.params;
    const data = await req.json();
    const v = await opFetch(`/versions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(buildVersionPatchBody(data)),
    });
    void flushSprintCache();
    return Response.json(mapVersionFull(v));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req, ctx) {
  try {
    const { id } = await ctx.params;
    await opFetch(`/versions/${id}`, { method: "DELETE" });
    void flushSprintCache();
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
