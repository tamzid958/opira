import "server-only";
import { opFetch, withQuery } from "@/lib/openproject/client";
import { elementsOf, mapUser } from "@/lib/openproject/mappers";

export async function list(_ctx, opts = {}) {
  const pageSize = opts.pageSize ?? 100;
  const hal = await opFetch(withQuery("/users", { pageSize }));
  return elementsOf(hal).map(mapUser).filter(Boolean);
}

export async function me(_ctx) {
  const u = await opFetch("/users/me");
  return mapUser(u);
}
