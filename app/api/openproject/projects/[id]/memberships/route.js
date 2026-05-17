import {
  buildFilters,
  fetchAllPages,
  opFetch,
  withQuery,
} from "@/lib/openproject/client";
import { errorResponse } from "@/lib/openproject/route-utils";
import {
  buildMembershipCreateBody,
  elementsOf,
  mapMembership,
} from "@/lib/openproject/mappers";
import { invalidateViewerPermissions } from "@/lib/openproject/permissions";
import { clearAssigneesLocalCache } from "@/lib/openproject/ephemeral-caches";

export const dynamic = "force-dynamic";

// Project-scoped membership listing. OpenProject only exposes the list
// at `/memberships?filters=[{project:{operator:"=",values:[<id>]}}]` —
// there is no `/projects/{id}/memberships` collection. The filter
// requires an *integer* project id (passing the identifier slug yields
// "Filters Project is not an integer"), so we resolve the slug to the
// numeric id first via GET /projects/{slug}.
async function resolveProjectIntegerId(idOrSlug) {
  if (/^\d+$/.test(String(idOrSlug))) return String(idOrSlug);
  const proj = await opFetch(`/projects/${encodeURIComponent(idOrSlug)}`);
  return String(proj?.id ?? idOrSlug);
}

export async function GET(_req, ctx) {
  try {
    const { id } = await ctx.params;
    const numericId = await resolveProjectIntegerId(id);
    const filters = buildFilters([
      { project: { operator: "=", values: [numericId] } },
    ]);
    const path = withQuery("/memberships", { filters, pageSize: "200" });
    const items = await fetchAllPages(path, undefined, { hardCap: 500 });
    return Response.json(items.map(mapMembership).filter(Boolean));
  } catch (e) {
    return errorResponse(e);
  }
}

// Add a principal (user or group) to the project with one or more roles.
// Body: { principalId, roleIds: string[], sendNotification?: boolean,
//          message?: string }.
export async function POST(req, ctx) {
  try {
    const { id } = await ctx.params;
    const data = await req.json();
    if (!data?.principalId || !Array.isArray(data?.roleIds) || data.roleIds.length === 0) {
      return Response.json(
        { error: "principalId and at least one roleId are required" },
        { status: 400 },
      );
    }
    // OP's /memberships POST resolves projects by integer id reliably;
    // pass the resolved numeric id so we don't depend on slug routing.
    const numericId = await resolveProjectIntegerId(id);
    const body = buildMembershipCreateBody({
      projectId: numericId,
      principalId: data.principalId,
      roleIds: data.roleIds,
      sendNotification: data.sendNotification,
      message: data.message,
    });
    const created = await opFetch("/memberships", {
      method: "POST",
      body: JSON.stringify(body),
    });
    clearAssigneesLocalCache();
    void invalidateViewerPermissions(data.principalId ? String(data.principalId) : null);
    return Response.json(mapMembership(created));
  } catch (e) {
    return errorResponse(e);
  }
}
