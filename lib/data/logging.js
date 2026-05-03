// Server-only request observability for the repository layer.
//
// Wraps any async repo call so route handlers can opt into a single line
// per request: `[opira] mode=hybrid entity=tasks op=list ms=42`. Production
// builds strip console.log/info, so dev-only by default; in prod set
// `OPIRA_LOG_DATA_REPO=1` to keep the lines (uses console.warn so they
// survive the next.config.mjs strip).

import "server-only";
import { readDataSourceMode } from "./config";

const ENABLED_IN_PROD =
  String(process.env.OPIRA_LOG_DATA_REPO || "").trim() === "1";
const enabled =
  process.env.NODE_ENV !== "production" || ENABLED_IN_PROD;

const log = ENABLED_IN_PROD ? console.warn : console.log;

/**
 * @template T
 * @param {{entity: string, op: string}} meta
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withRepoLog(meta, fn) {
  if (!enabled) return fn();
  const start = Date.now();
  try {
    const out = await fn();
    log(
      `[opira] mode=${readDataSourceMode()} entity=${meta.entity} op=${meta.op} ms=${Date.now() - start}`,
    );
    return out;
  } catch (e) {
    log(
      `[opira] mode=${readDataSourceMode()} entity=${meta.entity} op=${meta.op} ms=${Date.now() - start} ERR=${e?.code || e?.message || "unknown"}`,
    );
    throw e;
  }
}
