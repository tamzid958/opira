"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "@/lib/api-client";

// Subscribes to a poker room's SSE stream while `enabled` is true and
// exposes vote/reveal/reset POST helpers. The hook tears down its
// EventSource when `enabled` flips to false (panel closed) or when the
// task changes — that double duty keeps room membership tied to the
// drawer being open and pointed at a specific work package.
//
// Returns:
//   state         - latest server snapshot (or null until first message)
//   connected     - boolean, true once `ready` arrives
//   vote(value)   - POST a vote ("S", "M", null to clear, etc.)
//   reveal()      - POST reveal
//   reset()       - POST reset (wipes all votes, returns the round to voting)
//   roomReset     - true on the first state we receive after a previous
//                   `createdAt` differed (signals a server restart)
export function usePokerRoom({ taskId, enabled }) {
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(false);
  const [roomReset, setRoomReset] = useState(false);

  const roomId = taskId ? `wp-${taskId}` : null;
  const lastCreatedAt = useRef(null);
  const esRef = useRef(null);

  useEffect(() => {
    if (!enabled || !roomId) return undefined;
    if (typeof window === "undefined" || !("EventSource" in window)) {
      return undefined;
    }

    const url = `/api/poker/${encodeURIComponent(roomId)}/stream?taskId=${encodeURIComponent(taskId)}`;
    const es = new EventSource(url, { withCredentials: true });
    esRef.current = es;

    es.addEventListener("ready", () => {
      setConnected(true);
    });

    es.addEventListener("room.state", (e) => {
      try {
        const next = JSON.parse(e.data);
        if (
          lastCreatedAt.current != null &&
          next?.createdAt !== lastCreatedAt.current
        ) {
          // Server restarted between updates — surface it once so the UI
          // can show a "room reset" toast.
          setRoomReset(true);
        }
        if (next?.createdAt != null) {
          lastCreatedAt.current = next.createdAt;
        }
        setState(next);
      } catch {
        // ignore malformed payload
      }
    });

    es.onerror = () => {
      // EventSource auto-reconnects on transient errors; only act on a
      // hard close (401 from auth route → readyState CLOSED).
      if (es.readyState === EventSource.CLOSED) {
        setConnected(false);
      }
    };

    return () => {
      try {
        es.close();
      } catch {
        // ignore
      }
      esRef.current = null;
      // Reset on teardown so the next open(taskId) starts cleanly. Doing
      // this in cleanup (not the effect body) avoids the cascading-render
      // path the react-hooks/set-state-in-effect rule flags.
      lastCreatedAt.current = null;
      setConnected(false);
      setState(null);
      setRoomReset(false);
    };
  }, [enabled, roomId, taskId]);

  const post = useCallback(
    async (body) => {
      if (!roomId) return null;
      return fetchJson(`/api/poker/${encodeURIComponent(roomId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    [roomId],
  );

  const vote = useCallback((value) => post({ action: "vote", value }), [post]);
  const reveal = useCallback(() => post({ action: "reveal" }), [post]);
  const reset = useCallback(() => {
    setRoomReset(false);
    return post({ action: "reset" });
  }, [post]);

  return useMemo(
    () => ({ state, connected, vote, reveal, reset, roomReset }),
    [state, connected, vote, reveal, reset, roomReset],
  );
}
