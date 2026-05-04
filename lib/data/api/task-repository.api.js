import "server-only";
import {
  opFetch,
  opPatchWithLock,
  fetchAllPages,
  withQuery,
  buildFilters,
} from "@/lib/openproject/client";
import {
  mapWorkPackage,
  buildPatchBody,
  buildCreateBody,
} from "@/lib/openproject/mappers";
import { loadLookups } from "@/lib/openproject/lookups";
import { htmlToMarkdown } from "@/lib/openproject/description";
import {
  resolveOptionForLabel,
  FIELD as SP_FIELD,
} from "@/lib/openproject/story-points";
import { nativeId } from "@/lib/openproject/route-utils";

const DEFAULT_HARD_CAP = 1000;

function buildSprintFilters(sprintId) {
  const out = [];
  if (sprintId === "backlog" || sprintId === "none") {
    out.push({ version: { operator: "!*", values: [] } });
  } else if (sprintId && sprintId !== "all") {
    out.push({ version: { operator: "=", values: [String(sprintId)] } });
  }
  return out;
}

export async function list(_ctx, query = {}) {
  const { projectId, sprintId, pageSize, offset, limit } = query;
  const filters = { filters: buildFilters(buildSprintFilters(sprintId)) ?? "[]" };
  const basePath = projectId
    ? `/projects/${encodeURIComponent(projectId)}/work_packages`
    : "/work_packages";

  if (pageSize != null) {
    const [hal, lookups] = await Promise.all([
      opFetch(withQuery(basePath, { ...filters, pageSize, offset: offset ?? 1 })),
      loadLookups(projectId),
    ]);
    const els = hal?._embedded?.elements || [];
    return {
      paged: true,
      tasks: els.map((wp) => mapWorkPackage(wp, lookups)),
      total: hal?.total ?? els.length,
      pageSize: hal?.pageSize ?? pageSize,
      offset: hal?.offset ?? (offset ?? 1),
      count: hal?.count ?? els.length,
    };
  }

  const hardCap = Number.isFinite(limit) ? limit : DEFAULT_HARD_CAP;
  const [wps, lookups] = await Promise.all([
    fetchAllPages(basePath, filters, { hardCap }),
    loadLookups(projectId),
  ]);
  return {
    paged: false,
    tasks: wps.map((wp) => mapWorkPackage(wp, lookups)),
  };
}

export async function findById(_ctx, id, opts = {}) {
  const nid = nativeId(id);
  const [wp, lookups] = await Promise.all([
    opFetch(`/work_packages/${nid}`),
    opts.skipLookups ? null : loadLookups(opts.projectId),
  ]);
  if (!wp) return null;
  return mapWorkPackage(wp, lookups || {});
}

export async function create(_ctx, input) {
  const { projectId } = input;
  if (!projectId) throw new Error("projectId is required");
  const body = { ...input };
  if (body.description != null) body.description = htmlToMarkdown(body.description);
  const payload = buildCreateBody(body, { projectId });
  const [wp, lookups] = await Promise.all([
    opFetch(`/projects/${encodeURIComponent(projectId)}/work_packages`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
    loadLookups(projectId),
  ]);
  return mapWorkPackage(wp, lookups);
}

export async function update(_ctx, id, patch) {
  const nid = nativeId(id);
  const work = { ...patch };
  if (work.description != null) work.description = htmlToMarkdown(work.description);

  if (
    work.points !== undefined &&
    work.pointsHref === undefined &&
    SP_FIELD.startsWith("customField")
  ) {
    const cur = await opFetch(`/work_packages/${nid}`);
    const schemaPath = (cur._links?.schema?.href || "").replace(/^\/api\/v3/, "");
    if (schemaPath) {
      const schema = await opFetch(schemaPath);
      if (schema?.[SP_FIELD]?.type === "CustomOption") {
        let pointsHref = null;
        if (work.points != null) {
          const opt = await resolveOptionForLabel(schemaPath, SP_FIELD, work.points);
          if (opt?.href) pointsHref = opt.href;
        }
        work.pointsHref = pointsHref;
        delete work.points;
      }
    }
  } else if (work.points !== undefined) {
    work.pointsField = SP_FIELD;
  }

  const [wp, lookups] = await Promise.all([
    opPatchWithLock(`/work_packages/${nid}`, (lockVersion) =>
      buildPatchBody(work, { lockVersion }),
    ),
    loadLookups(),
  ]);
  return mapWorkPackage(wp, lookups);
}

export async function remove(_ctx, id) {
  await opFetch(`/work_packages/${nativeId(id)}`, { method: "DELETE" });
}
