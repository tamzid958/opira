import "server-only";

import { getCommandClient, getSubscriberClient } from "./redis-client.js";

// Redis-backed planning-poker rooms. Whole-room state stored as a single
// JSON-encoded string per room with a 30-minute idle TTL refreshed on
// every write. Mutations use WATCH/MULTI for atomic read-modify-write so
// concurrent votes from different players never clobber each other.
// Each write publishes to a per-room pub/sub channel; SSE handlers
// subscribe to that channel and re-fetch the snapshot when notified.

const KEY_PREFIX = "opira:poker:room:";
const CHANNEL_PREFIX = "opira:poker:room:";
const CHANNEL_SUFFIX = ":events";
const ROOM_TTL_SECONDS = 30 * 60;
const MUTATION_RETRIES = 5;

const roomKey = (roomId) => `${KEY_PREFIX}${roomId}`;
const channelKey = (roomId) => `${CHANNEL_PREFIX}${roomId}${CHANNEL_SUFFIX}`;

function now() {
  return Date.now();
}

// channel → Set<handler> for the shared subscriber connection. ioredis
// emits a single 'message' event for every subscribed channel; we
// dispatch to local handlers based on the channel name.
const subscriberHandlers = new Map();
let subscriberWired = false;

function ensureSubscriberWired() {
  if (subscriberWired) return;
  const sub = getSubscriberClient();
  sub.on("message", (channel) => {
    const set = subscriberHandlers.get(channel);
    if (!set) return;
    for (const handler of set) {
      try {
        handler();
      } catch {
        // Don't let one bad handler kill fan-out.
      }
    }
  });
  subscriberWired = true;
}

// Atomic read → mutate → write → publish using WATCH/MULTI. `fn` receives
// the current room (or null when missing) and returns one of:
//   { next, payload? }     — write the new state and publish
//   { payload? }           — no write (e.g. a no-op or a rejection)
// Retries on WATCH conflict up to MUTATION_RETRIES times.
async function mutate(roomId, fn) {
  const client = getCommandClient();
  const key = roomKey(roomId);
  const channel = channelKey(roomId);

  for (let attempt = 0; attempt < MUTATION_RETRIES; attempt += 1) {
    await client.watch(key);
    const raw = await client.get(key);
    let current = null;
    if (raw) {
      try {
        current = JSON.parse(raw);
      } catch {
        // Corrupt blob — treat as missing. The next write will overwrite it.
        current = null;
      }
    }
    const result = fn(current);
    if (!result || result.next === undefined) {
      await client.unwatch();
      return result?.payload ?? { ok: true };
    }
    const next = result.next;
    next.lastActivityAt = now();
    const tx = client.multi();
    tx.set(key, JSON.stringify(next), "EX", ROOM_TTL_SECONDS);
    tx.publish(channel, "1");
    const exec = await tx.exec();
    if (exec) {
      return result.payload ?? { ok: true, room: next };
    }
    // null exec → another writer changed the key between WATCH and MULTI.
    // Loop and retry.
  }
  return { ok: false, error: "contention" };
}

function freshRoom(roomId, taskId) {
  const ts = now();
  return {
    roomId,
    taskId: String(taskId),
    createdAt: ts,
    lastActivityAt: ts,
    revealed: false,
    players: {},
  };
}

export async function join(roomId, taskId, user) {
  if (!user?.userId) return null;
  return mutate(roomId, (current) => {
    const room = current ?? freshRoom(roomId, taskId);
    const existing = room.players[user.userId];
    room.players[user.userId] = {
      userId: user.userId,
      name: user.name || existing?.name || "Anonymous",
      vote: existing?.vote ?? null,
      lastSeenAt: now(),
    };
    return { next: room, payload: { ok: true } };
  });
}

export async function leave(roomId, userId) {
  return mutate(roomId, (current) => {
    if (!current || !current.players[userId]) {
      return { payload: { ok: true } };
    }
    delete current.players[userId];
    return { next: current, payload: { ok: true } };
  });
}

export async function vote(roomId, userId, value) {
  return mutate(roomId, (current) => {
    if (!current) return { payload: { ok: false, error: "room-missing" } };
    if (current.revealed) {
      return { payload: { ok: false, error: "round-revealed" } };
    }
    const player = current.players[userId];
    if (!player) return { payload: { ok: false, error: "not-joined" } };
    player.vote = value == null ? null : String(value);
    player.lastSeenAt = now();
    return { next: current, payload: { ok: true } };
  });
}

export async function reveal(roomId) {
  return mutate(roomId, (current) => {
    if (!current) return { payload: { ok: false, error: "room-missing" } };
    current.revealed = true;
    return { next: current, payload: { ok: true } };
  });
}

export async function reset(roomId) {
  return mutate(roomId, (current) => {
    if (!current) return { payload: { ok: false, error: "room-missing" } };
    current.revealed = false;
    for (const p of Object.values(current.players)) {
      p.vote = null;
    }
    return { next: current, payload: { ok: true } };
  });
}

export async function subscribe(roomId, handler) {
  ensureSubscriberWired();
  const sub = getSubscriberClient();
  const channel = channelKey(roomId);
  let set = subscriberHandlers.get(channel);
  if (!set) {
    set = new Set();
    subscriberHandlers.set(channel, set);
    await sub.subscribe(channel);
  }
  set.add(handler);
  return async () => {
    set.delete(handler);
    if (set.size === 0) {
      subscriberHandlers.delete(channel);
      try {
        await sub.unsubscribe(channel);
      } catch {
        // ignore — connection may have already closed
      }
    }
  };
}

export async function getPublicState(roomId, viewerId) {
  const client = getCommandClient();
  const raw = await client.get(roomKey(roomId));
  if (!raw) return null;
  let room;
  try {
    room = JSON.parse(raw);
  } catch {
    return null;
  }
  const players = {};
  for (const [id, p] of Object.entries(room.players || {})) {
    const isViewer = id === viewerId;
    players[id] = {
      userId: p.userId,
      name: p.name,
      hasVoted: p.vote != null,
      vote: room.revealed || isViewer ? p.vote : null,
    };
  }
  return {
    roomId: room.roomId,
    taskId: room.taskId,
    createdAt: room.createdAt,
    revealed: room.revealed,
    viewerId,
    players,
  };
}
