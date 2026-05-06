import "server-only";

// Planning-Poker room store. Pure in-memory, single-process. Rooms are
// created on first join, evicted after 30 minutes of no activity, and
// never persisted — restart clears everything. This is by design (see
// docs/plan: "no DB, ephemeral by definition"). Same scope caveat as
// `lib/server/event-bus.js` — multi-instance deploys won't share rooms
// across pods.

const ROOM_TTL_MS = 30 * 60 * 1000;
const MAX_ROOMS = 200;

// Map<roomId, RoomState>
const rooms = new Map();
// Map<roomId, Set<{ handler }>>
const subs = new Map();
// Map<roomId, NodeJS.Timeout>
const evictionTimers = new Map();

function now() {
  return Date.now();
}

function scheduleEviction(roomId) {
  const existing = evictionTimers.get(roomId);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    rooms.delete(roomId);
    subs.delete(roomId);
    evictionTimers.delete(roomId);
  }, ROOM_TTL_MS);
  // Don't keep the Node process alive for an idle room.
  if (typeof t?.unref === "function") t.unref();
  evictionTimers.set(roomId, t);
}

function touch(room) {
  room.lastActivityAt = now();
  scheduleEviction(room.roomId);
}

function getOrCreate(roomId, taskId) {
  let room = rooms.get(roomId);
  if (room) {
    touch(room);
    return room;
  }
  if (rooms.size >= MAX_ROOMS) {
    console.warn(
      `[poker] room cap exceeded (${rooms.size}); refusing to create ${roomId}`,
    );
    return null;
  }
  room = {
    roomId,
    taskId: String(taskId),
    createdAt: now(),
    lastActivityAt: now(),
    revealed: false,
    players: {},
  };
  rooms.set(roomId, room);
  subs.set(roomId, new Set());
  scheduleEviction(roomId);
  return room;
}

function publish(roomId) {
  const set = subs.get(roomId);
  if (!set) return;
  for (const entry of set) {
    try {
      entry.handler();
    } catch {
      // Don't let one bad subscriber kill fan-out.
    }
  }
}

export function subscribe(roomId, handler) {
  let set = subs.get(roomId);
  if (!set) {
    set = new Set();
    subs.set(roomId, set);
  }
  const entry = { handler };
  set.add(entry);
  return () => set.delete(entry);
}

export function join(roomId, taskId, user) {
  if (!user?.userId) return null;
  const room = getOrCreate(roomId, taskId);
  if (!room) return null;
  const existing = room.players[user.userId];
  room.players[user.userId] = {
    userId: user.userId,
    name: user.name || existing?.name || "Anonymous",
    vote: existing?.vote ?? null,
    lastSeenAt: now(),
  };
  touch(room);
  publish(roomId);
  return room;
}

export function leave(roomId, userId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  if (room.players[userId]) {
    delete room.players[userId];
    touch(room);
    publish(roomId);
  }
  // If the room is empty, let the eviction timer clean it up — don't
  // tear it down immediately because a single-tab user reload would
  // race the unmount and lose the room before they reconnect.
  return room;
}

export function vote(roomId, userId, value) {
  const room = rooms.get(roomId);
  if (!room) return { ok: false, error: "room-missing" };
  if (room.revealed) return { ok: false, error: "round-revealed" };
  const player = room.players[userId];
  if (!player) return { ok: false, error: "not-joined" };
  player.vote = value == null ? null : String(value);
  player.lastSeenAt = now();
  touch(room);
  publish(roomId);
  return { ok: true };
}

export function reveal(roomId) {
  const room = rooms.get(roomId);
  if (!room) return { ok: false, error: "room-missing" };
  room.revealed = true;
  touch(room);
  publish(roomId);
  return { ok: true };
}

export function reset(roomId) {
  const room = rooms.get(roomId);
  if (!room) return { ok: false, error: "room-missing" };
  room.revealed = false;
  for (const p of Object.values(room.players)) {
    p.vote = null;
  }
  touch(room);
  publish(roomId);
  return { ok: true };
}

// Public snapshot. Strips other players' votes when the round hasn't
// been revealed — viewer always sees their own vote so the picker can
// reflect a re-load.
export function getPublicState(roomId, viewerId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  const players = {};
  for (const [id, p] of Object.entries(room.players)) {
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

// Exported for tests only.
export const __test = {
  reset() {
    for (const t of evictionTimers.values()) clearTimeout(t);
    rooms.clear();
    subs.clear();
    evictionTimers.clear();
  },
  rawRoom(roomId) {
    return rooms.get(roomId);
  },
  ROOM_TTL_MS,
};
