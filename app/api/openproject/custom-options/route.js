import { fetchAllPages } from "@/lib/openproject/client";
import { errorResponse } from "@/lib/openproject/route-utils";
import { getCachedCustomOptions, setCachedCustomOptions } from "@/lib/data/redis-lookups-cache";
import { customOptionsCache } from "@/lib/openproject/ephemeral-caches";

export const dynamic = "force-dynamic";

// Resolves an allowedValues collection from a schema field. Caller passes the
// HAL href via ?href=/api/v3/...
//
// `fetchAllPages` is critical here: OpenProject custom-option collections
// paginate at a default page size of 30, so a single-page fetch would
// silently drop any field with more than 30 options.
export async function GET(req) {
  try {
    const href = new URL(req.url).searchParams.get("href");
    if (!href) {
      return Response.json({ error: "href is required" }, { status: 400 });
    }

    const local = customOptionsCache.get(href);
    if (local) return Response.json(local);

    const redis = await getCachedCustomOptions(href);
    if (redis) {
      customOptionsCache.set(href, redis);
      return Response.json(redis);
    }

    const path = href.replace(/^\/api\/v3/, "");
    const els = await fetchAllPages(path);
    const result = els.map((o) => ({ id: String(o.id), value: o.value, href: o._links?.self?.href }));

    customOptionsCache.set(href, result);
    await setCachedCustomOptions(href, result);
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
