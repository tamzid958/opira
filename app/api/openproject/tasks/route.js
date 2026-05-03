import { errorResponse } from "@/lib/openproject/route-utils";
import { getRepositories } from "@/lib/data/factory";
import { buildAuthzContext } from "@/lib/data/authz/context";

export const dynamic = "force-dynamic";

const DEFAULT_HARD_CAP = 1000;
const MAX_HARD_CAP = 2000;

function clampInt(raw, { min, max, fallback }) {
  // `Number(null)` is 0 (not NaN), so a missing query param would slip
  // through `isFinite` and return `min` from the clamp — making `?limit=`
  // omitted behave the same as `?limit=1`. Reject empty values up front.
  if (raw == null || raw === "") return fallback;
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

    const ctx = await buildAuthzContext();
    const { tasks: repo } = getRepositories();

    if (pageSizeRaw != null) {
      const pageSize = clampInt(pageSizeRaw, { min: 1, max: 1000, fallback: 200 });
      const offset = clampInt(offsetRaw, { min: 1, max: 1_000_000, fallback: 1 });
      const result = await repo.list(ctx, { projectId, sprintId, pageSize, offset });
      return Response.json({
        tasks: result.tasks,
        total: result.total,
        pageSize: result.pageSize,
        offset: result.offset,
        count: result.count,
      });
    }

    const limit = clampInt(limitRaw, {
      min: 1,
      max: MAX_HARD_CAP,
      fallback: DEFAULT_HARD_CAP,
    });
    const result = await repo.list(ctx, { projectId, sprintId, limit });
    return Response.json(result.tasks);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    if (!body.projectId) {
      return Response.json({ error: "projectId is required" }, { status: 400 });
    }
    const ctx = await buildAuthzContext();
    const { tasks: repo } = getRepositories();
    const created = await repo.create(ctx, body);
    return Response.json(created);
  } catch (e) {
    return errorResponse(e);
  }
}
