import "server-only";

import IORedis from "ioredis";

// Lazy singletons. We keep two clients:
//   `command` — issues HSET/GET/MULTI/PUBLISH and answers reads.
//   `subscriber` — used exclusively for `SUBSCRIBE`. ioredis (and Redis
//                  itself) won't accept other commands on a subscribed
//                  connection, so the two responsibilities can't share.
//
// Connecting is deferred until the first call. If `OPIRA_REDIS_URL` is
// unset both getters throw, so the facade in `room-store.js` falls back
// to the in-memory implementation cleanly without ioredis ever touching
// the network.

let command = null;
let subscriber = null;

function makeClient() {
  const url = process.env.OPIRA_REDIS_URL;
  if (!url) {
    throw new Error("OPIRA_REDIS_URL is not set");
  }
  // `lazyConnect: false` so the first command auto-connects. Retries are
  // exponentially backed off but capped at 5 attempts; after that we
  // surface the error to the caller (the SSE/POST handler turns it into
  // a 503 — the FAB shows "Room offline" and the regular TShirtPicker
  // continues to work).
  return new IORedis(url, {
    maxRetriesPerRequest: 5,
    enableReadyCheck: true,
    reconnectOnError: () => true,
  });
}

export function getCommandClient() {
  if (!command) command = makeClient();
  return command;
}

export function getSubscriberClient() {
  if (!subscriber) subscriber = makeClient();
  return subscriber;
}

// Exposed for tests so each test run starts with no leaked connections.
export async function __disconnectAll() {
  const tasks = [];
  if (command) {
    tasks.push(command.quit().catch(() => {}));
    command = null;
  }
  if (subscriber) {
    tasks.push(subscriber.quit().catch(() => {}));
    subscriber = null;
  }
  await Promise.all(tasks);
}

export function isRedisEnabled() {
  return !!process.env.OPIRA_REDIS_URL;
}
