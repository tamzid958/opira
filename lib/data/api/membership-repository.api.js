import "server-only";
import { buildFilters, opFetch, withQuery } from "@/lib/openproject/client";
import {
  buildMembershipCreateBody,
  elementsOf,
  mapMembership,
} from "@/lib/openproject/mappers";

export async function list(_ctx, { projectId, principalId } = {}) {
  const filters = [];
  if (projectId)
    filters.push({ project: { operator: "=", values: [String(projectId)] } });
  if (principalId)
    filters.push({ principal: { operator: "=", values: [String(principalId)] } });
  const path = withQuery("/memberships", {
    pageSize: 200,
    filters: buildFilters(filters),
  });
  const hal = await opFetch(path);
  return elementsOf(hal).map(mapMembership);
}

export async function create(_ctx, { projectId, principalId, roleIds, sendNotification, message }) {
  if (!projectId || !principalId || !Array.isArray(roleIds) || roleIds.length === 0) {
    throw new Error("projectId, principalId, roleIds[] required");
  }
  const body = buildMembershipCreateBody({
    projectId,
    principalId,
    roleIds,
    sendNotification,
    message,
  });
  const m = await opFetch("/memberships", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return mapMembership(m);
}
