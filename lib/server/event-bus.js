import "server-only";

// Pub/sub bus used by Server Actions to fan out cache-invalidation events
// to every connected SSE client (see `app/api/openproject/events/route.js`).
//
// Two modes, selected at startup based on `OPIRA_REDIS_URL`:
//
//   in-process  — single module-level Set of handlers. Zero latency for the
//                 publishing instance; mutations from another pod don't cross
//                 process boundaries.  TanStack Query's window-focus refetch
//                 is the safety net for cross-instance staleness.
//
//   Redis       — when OPIRA_REDIS_URL is set, `publish` serialises the event
//                 and calls Redis PUBLISH on `opira:events`. A shared ioredis
//                 subscriber connection (initialised lazily on the first
//                 `subscribe()` call) listens to the same channel and
//                 dispatches to every in-process handler.  This fans out
//                 across all pods without a dedicated fanout service.
//
// Event shape:
//   { type, projectId?, ids?, keys? }
//
// `keys` is a list of TanStack Query key prefixes the client should
// invalidate. Lets the server tell the client exactly what to refetch
// instead of guessing on the client side.

import {
  getCommandClient,
  getSubscriberClient,
  isRedisEnabled,
} from "@/lib/poker/redis-client";

const REDIS_CHANNEL = "opira:events";

// ── in-process subscriber registry ─────────────────────────────────────────

const subscribers = new Set();
const MAX_SUBSCRIBERS = 1000;

// ── Redis subscriber (lazy, shared across all subscribe() calls) ────────────

let redisWired = false;

function ensureRedisSubscriber() {
  if (redisWired) return;
  redisWired = true;
  const sub = getSubscriberClient();
  sub.on("message", (_channel, raw) => {
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }
    dispatchToLocal(event);
  });
  // Fire-and-forget — errors are surfaced by ioredis reconnect logic.
  sub.subscribe(REDIS_CHANNEL).catch((err) => {
    console.error("[event-bus] Redis subscribe failed:", err?.message);
    redisWired = false;
  });
}

// ── internal dispatch ───────────────────────────────────────────────────────

function dispatchToLocal(event) {
  for (const { filter, handler } of subscribers) {
    if (
      filter.projectId &&
      event.projectId &&
      filter.projectId !== event.projectId
    ) {
      continue;
    }
    try {
      handler(event);
    } catch {
      // Don't let a single broken handler kill fan-out.
    }
  }
}

// ── public API ──────────────────────────────────────────────────────────────

export function subscribe(filter, handler) {
  const entry = { filter, handler };
  subscribers.add(entry);
  if (subscribers.size > MAX_SUBSCRIBERS) {
    console.warn(
      `[event-bus] subscriber count exceeded ${MAX_SUBSCRIBERS} (now ${subscribers.size}); possible leak`,
    );
  }
  if (isRedisEnabled()) {
    ensureRedisSubscriber();
  }
  return () => subscribers.delete(entry);
}

export function publish(event) {
  if (isRedisEnabled()) {
    // Fan out to all instances via Redis. The publishing instance also
    // receives the message through the subscriber connection so we don't
    // call dispatchToLocal here — that would double-fire on this pod.
    getCommandClient()
      .publish(REDIS_CHANNEL, JSON.stringify(event))
      .catch((err) => {
        // Redis publish failed — fall back to in-process so at least the
        // current user's tab gets the invalidation.
        console.error("[event-bus] Redis publish failed:", err?.message);
        dispatchToLocal(event);
      });
  } else {
    dispatchToLocal(event);
  }
}
