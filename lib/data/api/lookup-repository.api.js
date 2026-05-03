import "server-only";
import { opFetch, withQuery } from "@/lib/openproject/client";
import {
  elementsOf,
  mapStatus,
  mapType,
  mapPriority,
} from "@/lib/openproject/mappers";

export async function statuses(_ctx) {
  const hal = await opFetch(withQuery("/statuses", { pageSize: 100 }));
  return elementsOf(hal).map(mapStatus);
}

export async function types(_ctx, opts = {}) {
  const { projectId } = opts;
  const path = projectId
    ? `/projects/${encodeURIComponent(projectId)}/types`
    : withQuery("/types", { pageSize: 100 });
  const hal = await opFetch(path);
  return elementsOf(hal).map(mapType);
}

export async function priorities(_ctx) {
  const hal = await opFetch(withQuery("/priorities", { pageSize: 100 }));
  return elementsOf(hal).map(mapPriority);
}
