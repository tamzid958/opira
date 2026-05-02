"use server";

// Server Actions for work-package mutations.
//
// These run on the server, talk directly to OpenProject through the
// authenticated `opFetch` client (no extra HTTP hop), and emit a
// fan-out event on the in-process bus so every SSE-subscribed tab
// invalidates the right caches.
//
// The existing `app/api/openproject/*` route handlers stay in place —
// they're the replay surface for the offline mutation queue. Online
// mutations prefer the Server Action path because it skips a round-trip
// and lets the server publish events in the same transaction as the
// upstream PATCH.

import { opFetch, opPatchWithLock } from "@/lib/openproject/client";
import {
  buildCreateBody,
  buildPatchBody,
  mapWorkPackage,
} from "@/lib/openproject/mappers";
import { loadLookups } from "@/lib/openproject/lookups";
import {
  resolveOptionForLabel,
  FIELD as SP_FIELD,
} from "@/lib/openproject/story-points";
import { publish } from "@/lib/server/event-bus";

function nativeId(id) {
  const s = String(id);
  return s.startsWith("wp-") ? s.slice(3) : s;
}

// Translate a thrown OpError into a serialisable object so the client
// can branch on `code` / `status` the same way it does for `fetchJson`.
function toFailure(e) {
  return {
    ok: false,
    error: e?.message || "Server error",
    code: e?.code || null,
    status: e?.status || 500,
  };
}

export async function updateTaskAction({ id, patch, projectId }) {
  try {
    const nid = nativeId(id);

    if (
      patch.points !== undefined &&
      patch.pointsHref === undefined &&
      SP_FIELD.startsWith("customField")
    ) {
      const cur = await opFetch(`/work_packages/${nid}`);
      const schemaPath = (cur._links?.schema?.href || "").replace(/^\/api\/v3/, "");
      if (schemaPath) {
        const schema = await opFetch(schemaPath);
        const isCustomOption = schema?.[SP_FIELD]?.type === "CustomOption";
        if (isCustomOption) {
          let pointsHref = null;
          if (patch.points != null) {
            const opt = await resolveOptionForLabel(schemaPath, SP_FIELD, patch.points);
            if (opt?.href) pointsHref = opt.href;
          }
          patch.pointsHref = pointsHref;
          delete patch.points;
        }
      }
    }

    const [wp, lookups] = await Promise.all([
      opPatchWithLock(`/work_packages/${nid}`, (lockVersion) =>
        buildPatchBody(patch, { lockVersion }),
      ),
      loadLookups(projectId),
    ]);
    const mapped = mapWorkPackage(wp, lookups);
    publish({
      type: "wp.updated",
      projectId: projectId || mapped.projectId || null,
      ids: [String(mapped.id)],
      keys: [
        ["op", "tasks", projectId || mapped.projectId],
        ["op", "wp", String(mapped.nativeId ?? mapped.id)],
        ["op", "burndown", projectId || mapped.projectId],
        ["op", "velocity", projectId || mapped.projectId],
      ],
    });
    return { ok: true, data: mapped };
  } catch (e) {
    return toFailure(e);
  }
}

export async function createTaskAction(input) {
  try {
    const { projectId } = input;
    if (!projectId) {
      return { ok: false, error: "projectId is required", status: 400 };
    }
    const payload = buildCreateBody(input, { projectId });
    const [wp, lookups] = await Promise.all([
      opFetch(
        `/projects/${encodeURIComponent(projectId)}/work_packages`,
        { method: "POST", body: JSON.stringify(payload) },
      ),
      loadLookups(projectId),
    ]);
    const mapped = mapWorkPackage(wp, lookups);
    publish({
      type: "wp.created",
      projectId,
      ids: [String(mapped.id)],
      keys: [
        ["op", "tasks", projectId],
        ["op", "open-counts"],
      ],
    });
    return { ok: true, data: mapped };
  } catch (e) {
    return toFailure(e);
  }
}

export async function deleteTaskAction({ id, projectId }) {
  try {
    const nid = nativeId(id);
    await opFetch(`/work_packages/${nid}`, { method: "DELETE" });
    publish({
      type: "wp.deleted",
      projectId: projectId || null,
      ids: [String(id)],
      keys: [
        ["op", "tasks", projectId],
        ["op", "wp", String(nid)],
        ["op", "open-counts"],
      ],
    });
    return { ok: true };
  } catch (e) {
    return toFailure(e);
  }
}
