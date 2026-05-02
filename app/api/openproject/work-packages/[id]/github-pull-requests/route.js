import { opFetch, withQuery } from "@/lib/openproject/client";
import { elementsOf, mapGithubPullRequest } from "@/lib/openproject/mappers";
import { errorResponse, nativeId } from "@/lib/openproject/route-utils";

export const dynamic = "force-dynamic";

// GET /api/openproject/work-packages/<id>/github-pull-requests
//
// Returns GitHub PRs the OpenProject GitHub integration has linked to this
// work package — typically because a PR description / commit referenced
// `OP#<id>` or `#<id>`. Read-only: the v3 API doesn't expose PR mutations.
//
// The endpoint only exists when the OP server has the GitHub plugin enabled
// and configured. We treat 404 (plugin off) and 403 (no permission) as
// "nothing to show" rather than errors so the panel hides itself silently.
export async function GET(_req, ctx) {
  try {
    const { id } = await ctx.params;
    const path = withQuery(`/work_packages/${nativeId(id)}/github_pull_requests`, {
      pageSize: "100",
    });
    const hal = await opFetch(path);
    return Response.json(elementsOf(hal).map(mapGithubPullRequest));
  } catch (e) {
    if (e?.status === 404 || e?.status === 403) {
      return Response.json([]);
    }
    return errorResponse(e);
  }
}
