import { opFetch } from "@/lib/openproject/client";
import { errorResponse } from "@/lib/openproject/route-utils";
import {
  buildMembershipPatchBody,
  mapMembership,
} from "@/lib/openproject/mappers";
import { flushAssigneesCache } from "@/lib/data/redis-lookups-cache";

export const dynamic = "force-dynamic";

// PATCH a membership — the only mutable thing is the role set. Body:
// { roleIds: string[], sendNotification?: boolean, message?: string }.
export async function PATCH(req, ctx) {
  try {
    const { id } = await ctx.params;
    const data = await req.json();
    if (!Array.isArray(data?.roleIds)) {
      return Response.json({ error: "roleIds[] is required" }, { status: 400 });
    }
    const body = buildMembershipPatchBody({
      roleIds: data.roleIds,
      sendNotification: data.sendNotification,
      message: data.message,
    });
    const updated = await opFetch(`/memberships/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    void flushAssigneesCache();
    return Response.json(mapMembership(updated));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req, ctx) {
  try {
    const { id } = await ctx.params;
    await opFetch(`/memberships/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    void flushAssigneesCache();
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
