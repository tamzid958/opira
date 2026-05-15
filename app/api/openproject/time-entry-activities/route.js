import { opFetch, withQuery } from "@/lib/openproject/client";
import { elementsOf, mapTimeEntryActivity } from "@/lib/openproject/mappers";
import { errorResponse } from "@/lib/openproject/route-utils";
import { makeCache } from "@/lib/openproject/route-cache";
import { getCachedTimeActivities, setCachedTimeActivities } from "@/lib/data/redis-lookups-cache";

export const dynamic = "force-dynamic";

// Global, admin-configured list ("Development", "Meeting", "Design", etc).
// Changes only when an admin edits OP's time-entry activity settings.
const LOCAL = makeCache({ ttlMs: 60 * 60_000 }); // 1 hour in-process

export async function GET() {
  try {
    const local = LOCAL.get("__all__");
    if (local) return Response.json(local);

    const redis = await getCachedTimeActivities();
    if (redis) {
      LOCAL.set("__all__", redis);
      return Response.json(redis);
    }

    const hal = await opFetch(withQuery("/time_entries/activities", { pageSize: "100" }));
    const result = elementsOf(hal).map(mapTimeEntryActivity);

    LOCAL.set("__all__", result);
    await setCachedTimeActivities(result);
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
