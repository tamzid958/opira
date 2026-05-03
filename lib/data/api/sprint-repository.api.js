import "server-only";
import { opFetch, withQuery } from "@/lib/openproject/client";
import { elementsOf, mapVersionToSprint } from "@/lib/openproject/mappers";

export async function list(_ctx, opts = {}) {
  const { projectId } = opts;
  const path = projectId
    ? withQuery(`/projects/${encodeURIComponent(projectId)}/versions`, { pageSize: 100 })
    : withQuery("/versions", { pageSize: 100 });
  const hal = await opFetch(path);
  return elementsOf(hal).map(mapVersionToSprint);
}
