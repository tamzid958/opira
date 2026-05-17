import "server-only";
import { flushLookupCache, flushSprintCache } from "@/lib/data/redis-lookups-cache";
import { deleteCachedPerms } from "@/lib/openproject/redis-perms-cache";
import { buildAuthzContext } from "@/lib/data/authz/context";
import { errorResponse } from "@/lib/openproject/route-utils";
import { clearLocalCache as clearLookupLocalCache } from "@/lib/data/api/lookup-repository.api.cached";
import { clearLocalCache as clearLookupsJsCache } from "@/lib/openproject/lookups";
import { clearLocalCache as clearSprintLocalCache } from "@/lib/data/api/sprint-repository.api";
import { clearLocalCache as clearStoryPointsCache } from "@/lib/openproject/story-points";
import { clearEphemeralCaches } from "@/lib/openproject/ephemeral-caches";

export const dynamic = "force-dynamic";

// Flush all server-side Redis caches (lookups, sprints, permissions).
// In-process caches in each pod expire naturally within their TTL window.
// Requires a valid session — prevents unauthenticated cache busting.
export async function DELETE(_req) {
  try {
    await buildAuthzContext();
    clearLookupLocalCache();
    clearLookupsJsCache();
    clearSprintLocalCache();
    clearStoryPointsCache();
    clearEphemeralCaches();
    const [lookups, sprints] = await Promise.all([
      flushLookupCache(),
      flushSprintCache(),
      deleteCachedPerms(null), // null = flush all users
    ]);
    return Response.json({ ok: true, deleted: (lookups.deleted ?? 0) + (sprints.deleted ?? 0) });
  } catch (e) {
    return errorResponse(e);
  }
}
