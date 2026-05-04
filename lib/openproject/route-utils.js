// Shared route-handler helpers.

export function errorResponse(e) {
  const status = e?.status || 500;
  const code = e?.code || null;
  const message = e?.message || "Server error";
  // Log unexpected 5xx with the upstream body so dev can see *what*
  // OpenProject actually said (the user-facing JSON only carries the
  // message). 4xx already carries useful context in `message`.
  if (status >= 500 && process.env.NODE_ENV !== "production") {
    console.error("[OP route 5xx]", {
      status,
      code,
      message,
      upstream: e?.body,
      stack: e?.stack,
    });
  }
  // `status` is duplicated in the body so the client can branch on it without
  // having to inspect the Response object (mutation `onError` in TanStack
  // Query receives the parsed payload, not the raw response).
  return Response.json({ error: message, code, status, upstream: e?.body }, { status });
}

export function nativeId(id) {
  const s = String(id);
  return s.startsWith("wp-") ? s.slice(3) : s;
}

// Numeric variant for DB query params; returns NaN for non-numeric ids.
export function nativeIdNum(id) {
  return Number(nativeId(id));
}
