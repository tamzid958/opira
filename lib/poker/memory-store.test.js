// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import {
  __test,
  join,
  leave,
  vote,
  reveal,
  reset,
  subscribe,
  getPublicState,
} from "./memory-store";

const ROOM = "wp-1234";
const TASK = "1234";
const ALICE = { userId: "alice", name: "Alice" };
const BOB = { userId: "bob", name: "Bob" };

beforeEach(() => {
  __test.reset();
});

describe("room-store", () => {
  it("creates a room when the first player joins", () => {
    join(ROOM, TASK, ALICE);
    const state = getPublicState(ROOM, ALICE.userId);
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

  it("hides other players' votes until reveal, but always shows your own", () => {
    join(ROOM, TASK, ALICE);
    join(ROOM, TASK, BOB);
    vote(ROOM, ALICE.userId, "M");
    vote(ROOM, BOB.userId, "L");

    const fromAlice = getPublicState(ROOM, ALICE.userId);
    expect(fromAlice.players.alice.vote).toBe("M");
    expect(fromAlice.players.alice.hasVoted).toBe(true);
    expect(fromAlice.players.bob.vote).toBe(null);
    expect(fromAlice.players.bob.hasVoted).toBe(true);

    const fromBob = getPublicState(ROOM, BOB.userId);
    expect(fromBob.players.bob.vote).toBe("L");
    expect(fromBob.players.alice.vote).toBe(null);
    expect(fromBob.players.alice.hasVoted).toBe(true);

    reveal(ROOM);
    const revealed = getPublicState(ROOM, ALICE.userId);
    expect(revealed.revealed).toBe(true);
    expect(revealed.players.alice.vote).toBe("M");
    expect(revealed.players.bob.vote).toBe("L");
  });

  it("rejects votes after reveal until reset clears them", () => {
    join(ROOM, TASK, ALICE);
    vote(ROOM, ALICE.userId, "M");
    reveal(ROOM);

    const blocked = vote(ROOM, ALICE.userId, "L");
    expect(blocked).toEqual({ ok: false, error: "round-revealed" });

    reset(ROOM);
    const state = getPublicState(ROOM, ALICE.userId);
    expect(state.revealed).toBe(false);
    expect(state.players.alice.vote).toBe(null);
    expect(state.players.alice.hasVoted).toBe(false);

    const ok = vote(ROOM, ALICE.userId, "L");
    expect(ok).toEqual({ ok: true });
  });

  it("replaces a previous vote rather than stacking it", () => {
    join(ROOM, TASK, ALICE);
    vote(ROOM, ALICE.userId, "S");
    vote(ROOM, ALICE.userId, "XL");
    expect(__test.rawRoom(ROOM).players.alice.vote).toBe("XL");
  });

  it("treats null vote as a clear", () => {
    join(ROOM, TASK, ALICE);
    vote(ROOM, ALICE.userId, "M");
    vote(ROOM, ALICE.userId, null);
    const state = getPublicState(ROOM, ALICE.userId);
    expect(state.players.alice.vote).toBe(null);
    expect(state.players.alice.hasVoted).toBe(false);
  });

  it("publishes to subscribers on every state-changing action", () => {
    join(ROOM, TASK, ALICE);
    let calls = 0;
    const unsub = subscribe(ROOM, () => {
      calls += 1;
    });
    vote(ROOM, ALICE.userId, "M");
    reveal(ROOM);
    reset(ROOM);
    leave(ROOM, ALICE.userId);
    unsub();
    expect(calls).toBeGreaterThanOrEqual(4);
  });

  it("removes a player from the room map on leave", () => {
    join(ROOM, TASK, ALICE);
    join(ROOM, TASK, BOB);
    leave(ROOM, BOB.userId);
    const state = getPublicState(ROOM, ALICE.userId);
    expect(state.players.bob).toBeUndefined();
    expect(state.players.alice).toBeDefined();
  });

  it("rejects votes from users who haven't joined", () => {
    join(ROOM, TASK, ALICE);
    const result = vote(ROOM, "ghost", "M");
    expect(result).toEqual({ ok: false, error: "not-joined" });
  });

  it("returns null public state for unknown rooms", () => {
    expect(getPublicState("wp-9999", ALICE.userId)).toBeNull();
  });
});
