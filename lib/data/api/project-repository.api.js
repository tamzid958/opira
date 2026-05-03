import "server-only";
import { opFetch, withQuery, buildFilters } from "@/lib/openproject/client";
import { elementsOf, mapProject } from "@/lib/openproject/mappers";

export async function list(_ctx, opts = {}) {
  const pageSize = opts.pageSize ?? 100;
  const filters =
    opts.filters ?? buildFilters([{ active: { operator: "=", values: ["t"] } }]);
  const path = withQuery("/projects", { pageSize, filters });
  const hal = await opFetch(path);
  return elementsOf(hal).map(mapProject);
}
