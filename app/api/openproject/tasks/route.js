import { fetchAllPages, opFetch, withQuery, buildFilters } from "@/lib/openproject/client";
import { errorResponse } from "@/lib/openproject/route-utils";
import { buildCreateBody, mapWorkPackage } from "@/lib/openproject/mappers";
import { loadLookups } from "@/lib/openproject/lookups";
import { htmlToMarkdown } from "@/lib/openproject/description";

export const dynamic = "force-dynamic";

// Conservative cap on how many WPs the list endpoint will pull in one
// request. OpenProject's max page size is 1000; the default scope is
// project + sprint so this is normally a single page. The cap protects
// the client from runaway responses on huge unscoped queries — past it,
// callers should paginate using `pageSize`/`offset` (forwarded to OP).
const DEFAULT_HARD_CAP = 1000;
const MAX_HARD_CAP = 2000;

function clampInt(raw, { min, max, fallback }) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("project");
    const sprintId = url.searchParams.get("sprint");
    const pageSizeRaw = url.searchParams.get("pageSize");
    const offsetRaw = url.searchParams.get("offset");
    const limitRaw = url.searchParams.get("limit");

    // Sprint filter shape per OP v3 spec:
    //   - specific version → operator "=", values [String(id)]
    //   - "no version" / backlog → operator "!*" (none-of-the-above)
    //   - "all" / unset → still send `filters=[]` so OP doesn't apply its
    //     default "open status only" filter — we want closed WPs too so
    //     closed sprints show their members and the UI can delete them.
    const localFilters = [];
    if (sprintId === "backlog" || sprintId === "none") {
      localFilters.push({ version: { operator: "!*", values: [] } });
    } else if (sprintId && sprintId !== "all") {
      localFilters.push({ version: { operator: "=", values: [String(sprintId)] } });
    }

    const params = { filters: buildFilters(localFilters) ?? "[]" };

    const basePath = projectId
      ? `/projects/${encodeURIComponent(projectId)}/work_packages`
      : "/work_packages";

    // When the caller asks for a specific page (pageSize+offset), serve a
    // single upstream page — no walking. This is the path the UI will use
    // once it adopts infinite-scroll/pagination. Otherwise fall back to a
    // bounded walk so today's "fetch the whole sprint" callers keep working
    // without pulling unbounded data.
    if (pageSizeRaw != null) {
      const pageSize = clampInt(pageSizeRaw, { min: 1, max: 1000, fallback: 200 });
      const offset = clampInt(offsetRaw, { min: 1, max: 1_000_000, fallback: 1 });
      const [hal, lookups] = await Promise.all([
        opFetch(withQuery(basePath, { ...params, pageSize, offset })),
        loadLookups(projectId),
      ]);
      const els = hal?._embedded?.elements || [];
      const tasks = els.map((wp) => mapWorkPackage(wp, lookups));
      return Response.json({
        tasks,
        total: hal?.total ?? tasks.length,
        pageSize: hal?.pageSize ?? pageSize,
        offset: hal?.offset ?? offset,
        count: hal?.count ?? tasks.length,
      });
    }

    const hardCap = clampInt(limitRaw, {
      min: 1,
      max: MAX_HARD_CAP,
      fallback: DEFAULT_HARD_CAP,
    });
    const [wps, lookups] = await Promise.all([
      fetchAllPages(basePath, params, { hardCap }),
      loadLookups(projectId),
    ]);
    const tasks = wps.map((wp) => mapWorkPackage(wp, lookups));
    return Response.json(tasks);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { projectId } = body;
    if (!projectId) {
      return Response.json({ error: "projectId is required" }, { status: 400 });
    }
    if (body.description != null) {
      body.description = htmlToMarkdown(body.description);
    }
    const payload = buildCreateBody(body, { projectId });
    const [wp, lookups] = await Promise.all([
      opFetch(`/projects/${encodeURIComponent(projectId)}/work_packages`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
      loadLookups(projectId),
    ]);
    return Response.json(mapWorkPackage(wp, lookups));
  } catch (e) {
    return errorResponse(e);
  }
}
