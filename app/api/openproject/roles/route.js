import { opFetch, withQuery } from "@/lib/openproject/client";
import { errorResponse } from "@/lib/openproject/route-utils";
import { elementsOf, mapRole } from "@/lib/openproject/mappers";
import { makeCache } from "@/lib/openproject/route-cache";
import { getCachedRoles, setCachedRoles } from "@/lib/data/redis-lookups-cache";

export const dynamic = "force-dynamic";

// Read-only roles list — used to power the role multi-select on the
// Members page. Filters out the "Anonymous" / "Non member" built-ins
// since they can't be assigned to a project membership.
// Global, admin-configured — changes only when an OP admin edits roles.
const LOCAL = makeCache({ ttlMs: 60 * 60_000 }); // 1 hour in-process

export async function GET() {
  try {
    const local = LOCAL.get("__all__");
    if (local) return Response.json(local);

    const redis = await getCachedRoles();
    if (redis) {
      LOCAL.set("__all__", redis);
      return Response.json(redis);
    }

    const path = withQuery("/roles", { pageSize: "200" });
    const hal = await opFetch(path);
    const roles = elementsOf(hal)
      .map(mapRole)
      .filter((r) => {
        const n = (r.name || "").toLowerCase();
        return n !== "anonymous" && n !== "non member";
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    LOCAL.set("__all__", roles);
    await setCachedRoles(roles);
    return Response.json(roles);
  } catch (e) {
    return errorResponse(e);
  }
}
