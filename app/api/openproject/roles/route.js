import { opFetch, withQuery } from "@/lib/openproject/client";
import { errorResponse } from "@/lib/openproject/route-utils";
import { elementsOf, mapRole } from "@/lib/openproject/mappers";
import { getCachedRoles, setCachedRoles } from "@/lib/data/redis-lookups-cache";
import { rolesCache } from "@/lib/openproject/ephemeral-caches";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const local = rolesCache.get("__all__");
    if (local) return Response.json(local);

    const redis = await getCachedRoles();
    if (redis) {
      rolesCache.set("__all__", redis);
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

    rolesCache.set("__all__", roles);
    await setCachedRoles(roles);
    return Response.json(roles);
  } catch (e) {
    return errorResponse(e);
  }
}
