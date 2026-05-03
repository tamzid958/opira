// Server-only OpenProject API client.
// Reads the OAuth access token from the NextAuth session and forwards each
// request as the signed-in user. NextAuth's JWT callback already handles
// refresh-token rotation transparently.

import "server-only";
import { auth } from "@/auth";

// `OPENPROJECT_URL` is the single source for the upstream OpenProject base
// URL. Read at request time on both server (here, auth.js) and client (via
// `usePublicConfig()` from `components/config-provider.jsx`) so the same
// build can be deployed across environments.
export const BASE = (process.env.OPENPROJECT_URL || "").replace(/\/$/, "");

export class OpError extends Error {
  constructor(message, { status, code, body } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

function ensureBase() {
  if (!BASE) {
    throw new OpError("OPENPROJECT_URL is not configured", {
      code: "NOT_CONFIGURED",
      status: 500,
    });
  }
}

async function getAccessToken() {
  const session = await auth();
  if (!session?.accessToken) {
    throw new OpError("Not signed in", { code: "REAUTH_REQUIRED", status: 401 });
  }
  if (session.error === "RefreshAccessTokenError") {
    throw new OpError("Session expired — please sign in again", {
      code: "REAUTH_REQUIRED",
      status: 401,
    });
  }
  return session.accessToken;
}

async function readBodyForError(res) {
  try {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch {
    return null;
  }
}

async function rawFetch(path, init, token) {
  // OpenProject rejects POST/PATCH/PUT requests that don't carry a
  // Content-Type — even body-less mark-as-read calls. Only skip the header
  // for FormData (the runtime needs to set its own multipart boundary) and
  // for safe methods (GET/HEAD/DELETE).
  const method = (init?.method || "GET").toUpperCase();
  const writeMethod = method !== "GET" && method !== "HEAD" && method !== "DELETE";
  const isFormData = init?.body instanceof FormData;
  return fetch(`${BASE}/api/v3${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/hal+json",
      ...(writeMethod && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
}

export async function opFetch(path, init = {}) {
  ensureBase();
  const token = await getAccessToken();
  const res = await rawFetch(path, init, token);
  if (!res.ok) {
    const body = await readBodyForError(res);
    const message =
      (body && typeof body === "object" && (body.message || body.errorIdentifier)) ||
      (typeof body === "string" ? body.slice(0, 400) : "") ||
      `OpenProject ${res.status}`;
    const code =
      res.status === 401
        ? "REAUTH_REQUIRED"
        : res.status === 409
        ? "LOCK_CONFLICT"
        : null;
    throw new OpError(`OpenProject ${res.status}: ${message}`, { status: res.status, code, body });
  }
  // 204 No Content
  if (res.status === 204) return null;
  return res.json();
}

// Returns the raw upstream Response — used to stream binary downloads back to
// the client without buffering them server-side.
export async function opFetchRaw(path, init = {}) {
  ensureBase();
  const token = await getAccessToken();
  const res = await rawFetch(path, init, token);
  if (!res.ok) {
    const body = await readBodyForError(res);
    throw new OpError(`OpenProject ${res.status}`, { status: res.status, body });
  }
  return res;
}

// Multipart upload — same auth, but no Content-Type header so the runtime
// inserts the correct multipart boundary.
export async function opFetchMultipart(path, formData) {
  ensureBase();
  const token = await getAccessToken();
  const res = await fetch(`${BASE}/api/v3${path}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/hal+json",
    },
    body: formData,
  });
  if (!res.ok) {
    const body = await readBodyForError(res);
    const upstream =
      (body && typeof body === "object" && (body.message || body.errorIdentifier)) ||
      (typeof body === "string" ? body.slice(0, 400) : "") ||
      `OpenProject ${res.status}`;
    throw new OpError(`Upload failed: ${upstream}`, { status: res.status, body });
  }
  return res.json();
}

// PATCH helper that auto-fetches lockVersion when missing and retries once on
// LOCK_CONFLICT after refetching the current state.
export async function opPatchWithLock(path, build) {
  let lockVersion;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (lockVersion == null) {
      const cur = await opFetch(path);
      lockVersion = cur.lockVersion;
    }
    const body = build(lockVersion);
    try {
      return await opFetch(path, { method: "PATCH", body: JSON.stringify(body) });
    } catch (e) {
      if (e.code === "LOCK_CONFLICT" && attempt === 0) {
        lockVersion = null;
        continue;
      }
      throw e;
    }
  }
}

export function buildFilters(filters) {
  if (!filters || filters.length === 0) return null;
  return JSON.stringify(filters);
}

export function withQuery(path, params) {
  // Preserve any existing query string on `path` (HAL hrefs like
  // `/custom_options?filters=[...]` already carry params). New keys win
  // over existing ones so `pageSize` / `offset` from `fetchAllPages` can
  // override a stale value if one was inlined in the href.
  const qIndex = path.indexOf("?");
  const base = qIndex === -1 ? path : path.slice(0, qIndex);
  const usp = new URLSearchParams(qIndex === -1 ? "" : path.slice(qIndex + 1));
  for (const [k, v] of Object.entries(params || {})) {
    if (v == null) continue;
    usp.set(k, String(v));
  }
  const qs = usp.toString();
  return qs ? `${base}?${qs}` : base;
}

// Walk every page of a HAL collection. OpenProject's maximum pageSize
// is 1000; pages are 1-indexed via `offset`. Stops when we've collected
// `total` elements (or an empty page comes back).
//
// `hardCap` defaults to 1000 — one upstream page. Callers that genuinely
// need more must opt in explicitly. This keeps "loaded the wrong filter"
// or "instance grew unexpectedly" from cascading into multi-thousand-row
// HTTP responses.
export async function fetchAllPages(basePath, params = {}, { pageSize = 1000, hardCap = 1000 } = {}) {
  const all = [];
  let offset = 1;
  while (all.length < hardCap) {
    const path = withQuery(basePath, { ...params, offset, pageSize });
    const hal = await opFetch(path);
    const els = hal?._embedded?.elements || [];
    all.push(...els);
    const total = hal?.total ?? all.length;
    if (all.length >= total) break;
    if (els.length === 0) break;
    offset += 1;
  }
  return all;
}

export function isConfigured() {
  return Boolean(
    BASE &&
      process.env.OPENPROJECT_OAUTH_CLIENT_ID &&
      process.env.OPENPROJECT_OAUTH_CLIENT_SECRET &&
      process.env.AUTH_SECRET,
  );
}
