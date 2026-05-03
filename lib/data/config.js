// Server-only data-source mode resolver.
//
// `OPIRA_DATA_SOURCE` selects how Opira talks to OpenProject:
//   "api"     — every read and every write goes through the OP HAL+JSON API.
//                Default. Safest. Slower on large reads.
//   "hybrid"  — reads run against OP's PostgreSQL directly (fast, joinable);
//                writes still go through the OP API so journals,
//                notifications, parent progress, and webhooks stay intact.
//                Phase 2 will graduate selected writes here under an
//                explicit per-field flag — `hybrid` itself stays read-only
//                in the write path until then.
//
// Read at request time so the same Docker image can be deployed across
// environments without rebuild.

import "server-only";

const VALID_MODES = new Set(["api", "hybrid"]);

export function readDataSourceMode() {
  const raw = (process.env.OPIRA_DATA_SOURCE || "api").trim().toLowerCase();
  return VALID_MODES.has(raw) ? raw : "api";
}

export function isHybridMode() {
  return readDataSourceMode() === "hybrid";
}
