import "server-only";
import { buildFilters, opFetch, withQuery } from "@/lib/openproject/client";
import { elementsOf, mapQuery } from "@/lib/openproject/mappers";

export async function list(_ctx, { projectId, starredOnly } = {}) {
  const filters = [];
  if (projectId) {
    filters.push({ project: { operator: "=", values: [String(projectId)] } });
  }
  if (starredOnly) {
    filters.push({ starred: { operator: "=", values: ["t"] } });
  }
  const path = withQuery("/queries", {
    pageSize: 200,
    filters: buildFilters(filters),
  });
  const hal = await opFetch(path);
  return elementsOf(hal).map(mapQuery);
}

export async function create(_ctx, data) {
  if (!data?.name) throw new Error("name is required");
  const body = {
    name: data.name,
    public: !!data.public,
    filters: data.filters || [],
    sortBy: data.sortBy || [],
    groupBy: data.groupBy || null,
    _links: {},
  };
  if (data.projectId) {
    body._links.project = { href: `/api/v3/projects/${data.projectId}` };
  }
  if (Array.isArray(data.columns)) {
    body._links.columns = data.columns.map((c) => ({
      href: `/api/v3/queries/columns/${c}`,
    }));
  }
  const created = await opFetch("/queries", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return mapQuery(created);
}
