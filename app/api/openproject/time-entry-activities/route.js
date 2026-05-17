import { opFetch, withQuery } from "@/lib/openproject/client";
import { elementsOf, mapTimeEntryActivity } from "@/lib/openproject/mappers";
import { errorResponse } from "@/lib/openproject/route-utils";
import { getCachedTimeActivities, setCachedTimeActivities } from "@/lib/data/redis-lookups-cache";
import { timeActivitiesCache } from "@/lib/openproject/ephemeral-caches";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const local = timeActivitiesCache.get("__all__");
    if (local) return Response.json(local);

    const redis = await getCachedTimeActivities();
    if (redis) {
      timeActivitiesCache.set("__all__", redis);
      return Response.json(redis);
    }

    const hal = await opFetch(withQuery("/time_entries/activities", { pageSize: "100" }));
    const result = elementsOf(hal).map(mapTimeEntryActivity);

    timeActivitiesCache.set("__all__", result);
    await setCachedTimeActivities(result);
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
