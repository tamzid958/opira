"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

// Mounts a single EventSource scoped to the currently-viewed project,
// listens for fan-out events from `/api/openproject/events`, and
// invalidates the TanStack Query keys named in each event payload.
//
// Reconnect strategy:
//   - The browser's built-in EventSource auto-reconnects on network
//     blips. We only need to teardown/reopen when the project the user
//     is looking at changes (sniffed from the URL pathname).
//   - When `auth` returns 401 the route closes immediately; we don't
//     loop because `EventSource` retries forever by default. Instead we
//     give up after the first 401 and let `fetchJson`'s reauth path
//     handle the redirect.
//
// We deliberately don't subscribe on every page — only on routes nested
// under `/projects/[id]`. The home picker, account, and sign-in pages
// have nothing the bus would tell them.
export function RealtimeSync() {
  const qc = useQueryClient();
  const pathname = usePathname();
  const projectId = (() => {
    if (!pathname) return null;
    const m = pathname.match(/^\/projects\/([^/]+)/);
    return m ? m[1] : null;
  })();

  const esRef = useRef(null);

  useEffect(() => {
    if (!projectId) return;
    if (typeof window === "undefined" || !("EventSource" in window)) return;

    const url = `/api/openproject/events?project=${encodeURIComponent(projectId)}`;
    const es = new EventSource(url, { withCredentials: true });
    esRef.current = es;

    let unauthorized = false;

    const handle = (raw) => {
      try {
        const event = JSON.parse(raw);
        const keys = Array.isArray(event?.keys) ? event.keys : [];
        for (const key of keys) {
          // Permissive match: invalidate every cache whose key starts
          // with the prefix the server sent. Lets the server send
          // `["op", "tasks", projectId]` and have it match every sprint
          // variant under that project.
          qc.invalidateQueries({ queryKey: key });
        }
      } catch {
        // bad payload — drop it
      }
    };

    const eventTypes = ["wp.updated", "wp.created", "wp.deleted", "message"];
    for (const t of eventTypes) {
      es.addEventListener(t, (e) => handle(e.data));
    }
    es.addEventListener("ready", () => {});

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED && !unauthorized) {
        unauthorized = true;
        try {
          es.close();
        } catch {
          // ignore
        }
      }
    };

    return () => {
      try {
        es.close();
      } catch {
        // ignore
      }
      esRef.current = null;
    };
  }, [projectId, qc]);

  return null;
}
