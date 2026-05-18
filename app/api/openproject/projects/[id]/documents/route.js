import { fetchAllPages, opFetch } from "@/lib/openproject/client";
import { errorResponse } from "@/lib/openproject/route-utils";
import { mapDocument, mapProject } from "@/lib/openproject/mappers";

export const dynamic = "force-dynamic";

// /api/v3/documents only supports offset/pageSize/sortBy — no filter
// param — so to deliver project-scoped documents we fetch all and filter
// client-side. We resolve the project's identifier→numeric id through
// GET /projects/ so callers can pass either form in the URL.
async function resolveProjectIdentities(idOrSlug) {
  try {
    const proj = await opFetch(`/projects/${encodeURIComponent(idOrSlug)}`);
    const mapped = mapProject(proj);
    return {
      numericId: String(proj?.id ?? idOrSlug),
      identifier: mapped?.id || String(idOrSlug),
    };
  } catch {
    return { numericId: String(idOrSlug), identifier: String(idOrSlug) };
  }
}

export async function GET(req, ctx) {
  try {
    const { id } = await ctx.params;
    const { numericId, identifier } = await resolveProjectIdentities(id);
    const items = await fetchAllPages("/documents");
    const filtered = items
      .map(mapDocument)
      .filter(Boolean)
      .filter(
        (d) =>
          String(d.projectId) === String(numericId) ||
          String(d.projectId) === String(identifier),
      )
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return Response.json(filtered);
  } catch (e) {
    return errorResponse(e);
  }
}
