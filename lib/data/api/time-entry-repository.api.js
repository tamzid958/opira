import "server-only";
import { buildFilters, opFetch, withQuery } from "@/lib/openproject/client";
import {
  buildTimeEntryBody,
  elementsOf,
  mapTimeEntry,
} from "@/lib/openproject/mappers";
import { toIsoDuration } from "@/lib/openproject/duration";

function buildHalFilters(q) {
  const filters = [];
  if (q.from && q.to) {
    filters.push({ spentOn: { operator: "<>d", values: [q.from, q.to] } });
  } else if (q.from) {
    filters.push({ spentOn: { operator: ">=d", values: [q.from] } });
  } else if (q.to) {
    filters.push({ spentOn: { operator: "<=d", values: [q.to] } });
  }
  if (q.projectId)
    filters.push({ project: { operator: "=", values: [String(q.projectId)] } });
  if (q.userId)
    filters.push({ user: { operator: "=", values: [String(q.userId)] } });
  if (q.workPackageId)
    filters.push({ workPackage: { operator: "=", values: [String(q.workPackageId)] } });
  return filters;
}

export async function list(_ctx, query = {}) {
  const path = withQuery("/time_entries", {
    pageSize: 500,
    sortBy: JSON.stringify([["spentOn", "desc"]]),
    filters: buildFilters(buildHalFilters(query)),
  });
  const hal = await opFetch(path);
  return elementsOf(hal).map(mapTimeEntry);
}

export async function create(_ctx, input) {
  if (!input?.workPackageId) throw new Error("workPackageId is required");
  if (input.hours == null) throw new Error("hours is required");
  const hoursIso = toIsoDuration(Number(input.hours));
  if (!hoursIso) throw new Error("hours must be a positive number");
  const body = buildTimeEntryBody({
    workPackageId: input.workPackageId,
    hoursIso,
    spentOn: input.spentOn,
    comment: input.comment,
    activityId: input.activityId,
  });
  const t = await opFetch("/time_entries", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return mapTimeEntry(t);
}
