// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Replace ioredis with the in-memory mock for this test file. The mock
// implements GET/SET/DEL/WATCH/MULTI/EXEC/PUBLISH/SUBSCRIBE faithfully
// enough that the redis-store's WATCH/MULTI retry loop and pub/sub
// dispatch can be exercised end-to-end without a running Redis.
vi.mock("ioredis", async () => {
  const mod = await import("ioredis-mock");
  return { default: mod.default };
});

const ROOM = "wp-7";
const TASK = "7";
const ALICE = { userId: "alice", name: "Alice" };
const BOB = { userId: "bob", name: "Bob" };

let store;
let client;

beforeEach(async () => {
  vi.resetModules();
  process.env.OPIRA_REDIS_URL = "redis://localhost:6379";
  store = await import("./redis-store.js");
  ({ getCommandClient: client } = await import("./redis-client.js"));
  // ioredis-mock starts with a fresh DB per import — but vi.resetModules()
  // hands us a brand-new singleton anyway, so just ensure clean.
  await client().flushall();
});

afterEach(async () => {
  const { __disconnectAll } = await import("./redis-client.js");
  await __disconnectAll();
  delete process.env.OPIRA_REDIS_URL;
});

describe("redis-store", () => {
  it("creates a room when the first player joins", async () => {
    await store.join(ROOM, TASK, ALICE);
    const state = await store.getPublicState(ROOM, ALICE.userId);
    expect(state).toMatchObject({
      roomId: ROOM,
      taskId: TASK,
      revealed: false,
      viewerId: ALICE.userId,
    });
    expect(state.players[ALICE.userId]).toMatchObject({
      userId: ALICE.userId,
      name: "Alice",
      hasVoted: false,
      vote: null,
    });
  });

  it("hides other players' votes until reveal, but always shows your own", async () => {
    await store.join(ROOM, TASK, ALICE);
    await store.join(ROOM, TASK, BOB);
    await store.vote(ROOM, ALICE.userId, "M");
    await store.vote(ROOM, BOB.userId, "L");

    const fromAlice = await store.getPublicState(ROOM, ALICE.userId);
    expect(fromAlice.players.alice.vote).toBe("M");
    expect(fromAlice.players.bob.vote).toBe(null);
    expect(fromAlice.players.bob.hasVoted).toBe(true);

    await store.reveal(ROOM);
    const revealed = await store.getPublicState(ROOM, ALICE.userId);
    expect(revealed.revealed).toBe(true);
    expect(revealed.players.alice.vote).toBe("M");
    expect(revealed.players.bob.vote).toBe("L");
  });

  it("rejects votes after reveal until reset clears them", async () => {
    await store.join(ROOM, TASK, ALICE);
    await store.vote(ROOM, ALICE.userId, "M");
    await store.reveal(ROOM);

    const blocked = await store.vote(ROOM, ALICE.userId, "L");
    expect(blocked).toEqual({ ok: false, error: "round-revealed" });

    await store.reset(ROOM);
    const state = await store.getPublicState(ROOM, ALICE.userId);
    expect(state.revealed).toBe(false);
    expect(state.players.alice.vote).toBe(null);

    const ok = await store.vote(ROOM, ALICE.userId, "L");
    expect(ok.ok).toBe(true);
  });

  it("removes a player from the room on leave", async () => {
    await store.join(ROOM, TASK, ALICE);
    await store.join(ROOM, TASK, BOB);
    await store.leave(ROOM, BOB.userId);
    const state = await store.getPublicState(ROOM, ALICE.userId);
    expect(state.players.bob).toBeUndefined();
    expect(state.players.alice).toBeDefined();
  });

  it("rejects votes from users who haven't joined", async () => {
    await store.join(ROOM, TASK, ALICE);
    const result = await store.vote(ROOM, "ghost", "M");
    expect(result).toEqual({ ok: false, error: "not-joined" });
  });

  it("returns null public state for unknown rooms", async () => {
    expect(await store.getPublicState("wp-9999", ALICE.userId)).toBeNull();
  });

  it("sets a TTL so idle rooms are evicted", async () => {
    await store.join(ROOM, TASK, ALICE);
    const ttl = await client().ttl(`opira:poker:room:${ROOM}`);
    // 30 minutes ± a tick. ioredis-mock returns ttl in seconds.
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(30 * 60);
  });
});
