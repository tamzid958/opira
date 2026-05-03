import "server-only";
import { opFetch, withQuery } from "@/lib/openproject/client";
import { elementsOf, mapCategory } from "@/lib/openproject/mappers";

export async function list(_ctx, { projectId } = {}) {
  if (!projectId) throw new Error("projectId is required");
  const path = withQuery(`/projects/${encodeURIComponent(projectId)}/categories`, {
    pageSize: 200,
  });
  const hal = await opFetch(path);
  return elementsOf(hal).map(mapCategory);
}

export async function create(_ctx, { projectId, name, defaultAssigneeId }) {
  if (!projectId || !name) throw new Error("projectId and name are required");
  const body = {
    name,
    _links: { project: { href: `/api/v3/projects/${projectId}` } },
  };
  if (defaultAssigneeId) {
    body._links.defaultAssignee = { href: `/api/v3/users/${defaultAssigneeId}` };
  }
  const c = await opFetch("/categories", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return mapCategory(c);
}
