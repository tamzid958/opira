import { readDataSourceMode, isHybridMode } from "@/lib/data/config";
import { opFetch } from "@/lib/openproject/client";

export const dynamic = "force-dynamic";

// Health probe for the active data source. In API mode pings
// /api/v3/configuration. In hybrid/db modes pings BOTH the OP API
// (writes still go through it) and the DB (reads do); returns whichever
// failed if either does. Public — no auth required.
export async function GET() {
  const mode = readDataSourceMode();
  const start = Date.now();
  try {
    if (isHybridMode()) {
      const { pingDb } = await import("@/lib/data/db/client");
      const [dbMs] = await Promise.all([pingDb(), opFetch("/configuration")]);
      return Response.json({
        mode,
        ok: true,
        dbLatencyMs: dbMs,
        apiLatencyMs: Date.now() - start,
      });
    }
    await opFetch("/configuration");
    return Response.json({ mode, ok: true, latencyMs: Date.now() - start });
  } catch (e) {
    return Response.json(
      {
        mode,
        ok: false,
        latencyMs: Date.now() - start,
        error: e?.message || "probe failed",
        code: e?.code || null,
      },
      { status: 503 },
    );
  }
}
