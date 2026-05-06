import "server-only";

import * as memory from "./memory-store.js";
import * as redis from "./redis-store.js";
import { isRedisEnabled } from "./redis-client.js";

// Async facade. Picks the backend once at module load:
//   OPIRA_REDIS_URL set  → Redis-backed (multi-instance safe, the SSE
//                          pod that streams a vote can be a different
//                          pod from the one that wrote it).
//   OPIRA_REDIS_URL unset → in-memory single-process store (the same
//                           backend the codebase shipped with).
//
// Even the memory backend is async-shaped here so SSE/POST handlers
// don't have to branch on which backend is live. `memory-store.js`
// stays sync internally so its unit tests can read state without
// `await`.
//
// Static-importing both modules is intentional. ioredis is in the
// import graph either way (it's a runtime-conditional dependency, not
// dead code) but the connection itself is opened lazily — the first
// command call is what dials the socket, so unset deployments never
// touch the network.

const impl = isRedisEnabled() ? redis : memory;

export async function join(roomId, taskId, user) {
  return impl.join(roomId, taskId, user);
}

export async function leave(roomId, userId) {
  return impl.leave(roomId, userId);
}

export async function vote(roomId, userId, value) {
  return impl.vote(roomId, userId, value);
}

export async function reveal(roomId) {
  return impl.reveal(roomId);
}

export async function reset(roomId) {
  return impl.reset(roomId);
}

export async function getPublicState(roomId, viewerId) {
  return impl.getPublicState(roomId, viewerId);
}

// `subscribe` returns a teardown function. Memory-store's teardown is
// sync; redis-store's is async. We always return an async teardown so
// callers can await it uniformly.
export async function subscribe(roomId, handler) {
  const teardown = await impl.subscribe(roomId, handler);
  return async () => {
    await teardown?.();
  };
}
