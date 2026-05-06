import { auth } from "@/auth";
import {
  subscribe,
  join,
  leave,
  getPublicState,
} from "@/lib/poker/room-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// SSE stream for one poker room. Mirrors `app/api/openproject/events/route.js`:
// auth-gated, 25s heartbeat to keep proxies from killing the pipe, and
// teardown via `req.signal.aborted`. On connect we add the user to the
// room's player map and emit the first snapshot. On disconnect we remove
// them and let remaining players' streams pick up the change.
//
// When the room-store is backed by Redis (OPIRA_REDIS_URL set) and the
// Redis connection isn't reachable, the initial join() rejects and we
// return 503 — the client surfaces "Room offline" and the regular
// TShirtPicker continues to work for solo estimation.
export async function GET(req, { params }) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = session.user.id || session.user.email;
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userName =
    session.user.name || session.user.login || session.user.email || "User";

  const { roomId } = await params;
  const url = new URL(req.url);
  const taskId = url.searchParams.get("taskId") || roomId.replace(/^wp-/, "");

  // Pre-flight the join so a Redis outage fails as 503 instead of an
  // empty stream that hangs the FAB.
  try {
    await join(roomId, taskId, { userId, name: userName });
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[poker stream] join failed", e?.message || e);
    }
    return new Response("Poker store unavailable", { status: 503 });
  }

  const encoder = new TextEncoder();
  let unsubscribePromise = null;
  let heartbeat = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          cleanup();
        }
      };

      const sendState = async () => {
        try {
          const state = await getPublicState(roomId, userId);
          if (!state) return;
          send(`event: room.state\ndata: ${JSON.stringify(state)}\n\n`);
        } catch {
          // Don't tear down on a transient read failure — the next
          // pub/sub notification will retry. ioredis auto-reconnects.
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        if (unsubscribePromise) {
          unsubscribePromise
            .then((unsub) => unsub?.())
            .catch(() => {});
        }
        leave(roomId, userId).catch(() => {});
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      send(`event: ready\ndata: ${JSON.stringify({ roomId, ts: Date.now() })}\n\n`);
      await sendState();

      unsubscribePromise = subscribe(roomId, () => {
        sendState().catch(() => {});
      });

      heartbeat = setInterval(() => {
        send(`: ping ${Date.now()}\n\n`);
      }, 25_000);

      const signal = req.signal;
      if (signal) {
        if (signal.aborted) cleanup();
        else signal.addEventListener("abort", cleanup);
      }
    },
    cancel() {
      clearInterval(heartbeat);
      if (unsubscribePromise) {
        unsubscribePromise
          .then((unsub) => unsub?.())
          .catch(() => {});
      }
      leave(roomId, userId).catch(() => {});
      closed = true;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
