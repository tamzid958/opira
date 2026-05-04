// Server-only PostgreSQL client. Lazy singleton Pool — `OPENPROJECT_DB_URL`
// is read on the first DB query, not at import.

import "server-only";
import { Pool, types as pgTypes } from "pg";

// PG's default parser turns every DATE column into a JS Date at *local
// midnight*. On any non-UTC host (e.g. UTC+6), `.toISOString()` then yields
// the previous day's date — every `startDate`, `dueDate`, sprint
// `start`/`end` would be off by one day. Force DATE to return as the raw
// 'YYYY-MM-DD' string so the row mappers can pass it through unchanged.
//   1082 = OID for DATE
//   1184 = OID for TIMESTAMPTZ — left alone (Date is correct, UTC-aware)
//   1114 = OID for TIMESTAMP   — left alone, but we don't use it
pgTypes.setTypeParser(1082, (v) => v);

// HMR survival: Next.js dev re-evaluates server modules on every change
// (Turbopack hot-reload). A plain `let pool = null` would create a fresh
// Pool each reload while the previous pool's idle clients are still
// holding Postgres slots — after a few edits the OP DB returns
// `sorry, too many clients already`. Pinning the pool on `globalThis`
// keeps the single instance alive across module re-evaluations.
const POOL_KEY = "__opiraPgPool__";
const SHUTDOWN_KEY = "__opiraPgShutdown__";

function readPoolMax() {
  const raw = Number(process.env.OPENPROJECT_DB_POOL_MAX);
  // 10 covers a busy dev session (board + backlog + reports open in
  // tabs, all firing parallel queries) without overwhelming a healthy
  // OP Postgres. Anything beyond is wasted unless you've also bumped
  // PG's `max_connections` and added more Next.js processes.
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 10;
}

// Decide whether to enable TLS on the connection. Three sources, in order:
//   1. `OPENPROJECT_DB_SSL=require|disable` — explicit override.
//   2. `?sslmode=require` (or stricter) on the URL itself — pg respects it.
//   3. Default — disabled, since most OP installs colocate the DB on the
//      same private network as the Rails server.
//
// When enabled we set `rejectUnauthorized: true` so a MITM with a self-
// signed cert fails closed. Operators that need self-signed certs accepted
// can set `OPENPROJECT_DB_SSL=relax` — documented as last-resort only.
function readSslConfig(url) {
  const flag = String(process.env.OPENPROJECT_DB_SSL || "").trim().toLowerCase();
  if (flag === "disable" || flag === "off" || flag === "false") return false;
  if (flag === "relax") return { rejectUnauthorized: false };
  if (flag === "require" || flag === "verify-full" || flag === "true") {
    return { rejectUnauthorized: true };
  }
  // No explicit env: defer to the URL's sslmode. pg parses it natively
  // when we don't pass an `ssl` option, so return `undefined`.
  if (url && /[?&]sslmode=/.test(url)) return undefined;
  return false;
}

export function getPool() {
  const existing = globalThis[POOL_KEY];
  if (existing) return existing;

  const url = process.env.OPENPROJECT_DB_URL;
  if (!url) {
    const err = new Error(
      "OPENPROJECT_DB_URL is not configured (required when OPIRA_DATA_SOURCE=db)",
    );
    err.code = "DATA_SOURCE_UNAVAILABLE";
    err.status = 500;
    throw err;
  }

  const ssl = readSslConfig(url);
  const pool = new Pool({
    connectionString: url,
    max: readPoolMax(),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    application_name: "opira",
    ...(ssl !== undefined ? { ssl } : {}),
  });

  pool.on("error", (e) => {
    console.error("[opira pg pool] idle client error", e.message);
  });

  globalThis[POOL_KEY] = pool;

  if (!globalThis[SHUTDOWN_KEY] && typeof process !== "undefined") {
    globalThis[SHUTDOWN_KEY] = true;
    const drain = () => {
      const p = globalThis[POOL_KEY];
      globalThis[POOL_KEY] = null;
      p?.end().catch(() => {});
    };
    process.once("SIGTERM", drain);
    process.once("SIGINT", drain);
    process.once("beforeExit", drain);
  }

  return pool;
}

// For tests: drop the singleton so a fresh URL/Pool is picked up.
export async function resetPoolForTesting() {
  const p = globalThis[POOL_KEY];
  globalThis[POOL_KEY] = null;
  if (p) await p.end().catch(() => {});
}

export async function pingDb() {
  const start = Date.now();
  await getPool().query("SELECT 1");
  return Date.now() - start;
}
