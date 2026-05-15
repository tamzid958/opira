import { buildFilters, opFetch, withQuery } from "@/lib/openproject/client";
import { elementsOf, idFromHref, linkTitle } from "@/lib/openproject/mappers";
import { errorResponse } from "@/lib/openproject/route-utils";

export const dynamic = "force-dynamic";

// Lightweight work-package search for the Parent picker in the task detail
// drawer. Scopes to the project path when projectId is provided (same pattern
// as task-repository.api.js list()) so the project filter works correctly.
export async function GET(req) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    const projectId = url.searchParams.get("project") || null;
    const excludeId = url.searchParams.get("exclude") || null;

    if (!q) return Response.json([]);

    const basePath = projectId
      ? `/projects/${encodeURIComponent(projectId)}/work_packages`
      : "/work_packages";

    const hal = await opFetch(
      withQuery(basePath, {
        pageSize: "20",
        filters: buildFilters([{ subjectOrId: { operator: "**", values: [q] } }]),
      }),
    );

    const results = elementsOf(hal)
      .filter((wp) => !excludeId || String(wp.id) !== String(excludeId))
      .map((wp) => ({
        id: String(wp.id),
        title: wp.subject || "",
        epicName: linkTitle(wp._links?.parent) || null,
        parentId: idFromHref(wp._links?.parent?.href) || null,
      }));

    return Response.json(results);
  } catch (e) {
    return errorResponse(e);
  }
}
