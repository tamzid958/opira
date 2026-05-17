import { opFetch } from "@/lib/openproject/client";
import { buildVersionCreateBody, mapVersionFull } from "@/lib/openproject/mappers";
import { errorResponse } from "@/lib/openproject/route-utils";
import { flushSprintCache } from "@/lib/data/redis-lookups-cache";
import { clearLocalCache as clearSprintLocalCache } from "@/lib/data/api/sprint-repository.api";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const data = await req.json();
    if (!data.name) {
      return Response.json({ error: "name is required" }, { status: 400 });
    }
    if (!data.projectId) {
      return Response.json({ error: "projectId is required" }, { status: 400 });
    }
    // OpenProject's POST /api/v3/versions resolves _links.definingProject
    // by numeric ID only — passing a project identifier (slug) fails with
    // "Project can't be blank". Resolve it server-side.
    const project = await opFetch(`/projects/${encodeURIComponent(data.projectId)}`);
    const numericProjectId = project?.id;
    if (!numericProjectId) {
      return Response.json({ error: "project not found" }, { status: 404 });
    }
    const body = buildVersionCreateBody({ ...data, projectId: numericProjectId });
    const v = await opFetch("/versions", {
      method: "POST",
      body: JSON.stringify(body),
    });
    clearSprintLocalCache();
    void flushSprintCache();
    return Response.json(mapVersionFull(v));
  } catch (e) {
    return errorResponse(e);
  }
}
