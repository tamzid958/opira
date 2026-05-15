import "server-only";
import { flushLookupCache } from "@/lib/data/redis-lookups-cache";
import { buildAuthzContext } from "@/lib/data/authz/context";
import { errorResponse } from "@/lib/openproject/route-utils";

export const dynamic = "force-dynamic";

// Flush all opira:lookups:* keys from Redis.
// In-process caches in each pod will expire naturally (≤5 min TTL).
// Requires a valid session — prevents unauthenticated cache busting.
export async function DELETE(_req) {
  try {
    await buildAuthzContext();
    const result = await flushLookupCache();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return errorResponse(e);
  }
}
