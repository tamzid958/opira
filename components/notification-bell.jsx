"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";
import { LoadingPill } from "@/components/ui/loading-pill";
import { useIsClient } from "@/lib/hooks/use-is-client";
import {
  useMarkNotificationUnread,
  useMarkNotificationsRead,
  useNotifications,
} from "@/lib/hooks/use-openproject-detail";
import { cn, formatRelDate } from "@/lib/utils";

// The reason values come straight from OP v3's NotificationModel enum.
// We surface the ones a user typically wants to scope by; the rest stay
// reachable when no chip is selected (= "All").
const REASON_CHIPS = [
  { value: "mentioned", label: "Mentioned" },
  { value: "assigned", label: "Assigned" },
  { value: "responsible", label: "Accountable" },
  { value: "watched", label: "Watched" },
  { value: "commented", label: "Commented" },
  { value: "dateAlert", label: "Dates" },
];

const STORAGE_KEY = "op:notification-reasons";

function readStoredReasons() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const allowed = new Set(REASON_CHIPS.map((c) => c.value));
    return parsed.filter((v) => allowed.has(v));
  } catch {
    return [];
  }
}

function writeStoredReasons(reasons) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reasons));
  } catch {
    /* quota / disabled — ignore, scope just won't persist */
  }
}

export function NotificationBell({ onOpenWp }) {
  // Lazy init — `readStoredReasons` returns `[]` during SSR (no `window`)
  // and the persisted picks once we're on the client. Nothing rendered
  // before the popover opens depends on `reasons`, so a SSR/CSR delta here
  // doesn't show as a hydration mismatch.
  const [reasons, setReasons] = useState(readStoredReasons);

  const q = useNotifications({ reasons });
  const mark = useMarkNotificationsRead();
  const markUnread = useMarkNotificationUnread();
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState(null);
  const popoverRef = useRef(null);
  const triggerRef = useRef(null);
  const mounted = useIsClient();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (popoverRef.current?.contains(e.target)) return;
      if (triggerRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const data = q.data || { items: [], unread: 0 };
  const unread = data.unread;

  const reasonSet = new Set(reasons);
  const isFiltered = reasons.length > 0;

  const toggleReason = (value) => {
    setReasons((cur) => {
      const next = cur.includes(value)
        ? cur.filter((v) => v !== value)
        : [...cur, value];
      writeStoredReasons(next);
      return next;
    });
  };

  const clearScope = () => {
    setReasons([]);
    writeStoredReasons([]);
  };

  const handleClick = (n) => {
    setOpen(false);
    if (!n.readIAN) mark.mutate(n.id);
    if (n.workPackageId && onOpenWp) onOpenWp(`wp-${n.workPackageId}`);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title={
          isFiltered
            ? `Notifications (filtered: ${reasons
                .map((r) => REASON_CHIPS.find((c) => c.value === r)?.label || r)
                .join(", ")})`
            : "Notifications"
        }
        aria-label="Notifications"
        onClick={(e) => {
          setAnchorRect(e.currentTarget.getBoundingClientRect());
          setOpen((v) => !v);
        }}
        className="relative inline-flex items-center justify-center w-8 h-8 rounded-md border-0 bg-transparent text-fg-subtle cursor-pointer transition-colors hover:bg-surface-subtle hover:text-fg"
      >
        <Icon name="bell" size={16} aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 inline-flex items-center justify-center min-w-3.5 px-1.25 h-3.5 rounded-full bg-pri-highest text-white text-[9px] font-bold leading-none">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {mounted && open && anchorRect &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              right: Math.max(12, window.innerWidth - anchorRect.right),
              top: anchorRect.bottom + 6,
              width: "min(380px, calc(100vw - 24px))",
            }}
            className="max-h-[70vh] bg-surface-elevated border border-border rounded-lg shadow-lg z-1100 overflow-hidden flex flex-col animate-pop"
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-border-soft">
              <b className="text-xs font-semibold text-fg">Notifications</b>
              <div className="flex items-center gap-1">
                {isFiltered && (
                  <button
                    type="button"
                    onClick={clearScope}
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] text-fg-muted hover:bg-surface-subtle hover:text-fg cursor-pointer"
                    title="Show all notifications"
                  >
                    Clear filters
                  </button>
                )}
                {unread > 0 && (
                  <button
                    type="button"
                    onClick={() => mark.mutate({ all: true })}
                    disabled={mark.isPending}
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] text-fg-muted hover:bg-surface-subtle hover:text-fg cursor-pointer disabled:opacity-50"
                    title="Mark every unread notification as read"
                  >
                    Mark all read
                  </button>
                )}
              </div>
            </div>

            {/* Scope chips — multi-select. No selection = show everything. */}
            <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-border-soft">
              <button
                type="button"
                onClick={clearScope}
                aria-pressed={!isFiltered}
                className={cn(
                  "inline-flex items-center h-5.5 px-2 rounded-full text-[11px] font-medium cursor-pointer transition-colors",
                  !isFiltered
                    ? "bg-accent-50 text-accent-700"
                    : "bg-surface-subtle text-fg-subtle hover:text-fg",
                )}
              >
                All
              </button>
              {REASON_CHIPS.map((c) => {
                const active = reasonSet.has(c.value);
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => toggleReason(c.value)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex items-center h-5.5 px-2 rounded-full text-[11px] font-medium cursor-pointer transition-colors",
                      active
                        ? "bg-accent-50 text-accent-700"
                        : "bg-surface-subtle text-fg-subtle hover:text-fg",
                    )}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto">
              {q.isLoading && (
                <div className="px-4 py-6 text-center">
                  <LoadingPill label="loading notifications" />
                </div>
              )}
              {!q.isLoading && data.items.length === 0 && (
                <div className="px-6 py-6 text-center text-[13px] text-fg-subtle">
                  {isFiltered
                    ? "No notifications match the current filters."
                    : "You're all caught up 🎉"}
                </div>
              )}
              {!q.isLoading &&
                data.items.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={cn(
                      "group flex gap-2.5 px-3 py-2.5 cursor-pointer transition-colors border-b border-border-soft last:border-b-0",
                      n.readIAN ? "hover:bg-surface-subtle" : "bg-accent-50/40 hover:bg-accent-50",
                    )}
                  >
                    <Icon name="bell" size={14} className="text-fg-subtle mt-0.5" aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-fg truncate">{n.subject}</div>
                      <div className="text-[11px] text-fg-subtle truncate mt-0.5">
                        {n.actorName ? `${n.actorName} · ` : ""}
                        {n.projectName ? `${n.projectName} · ` : ""}
                        {n.reason || ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        aria-label={n.readIAN ? "Mark as unread" : "Mark as read"}
                        title={n.readIAN ? "Mark as unread" : "Mark as read"}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (n.readIAN) markUnread.mutate(n.id);
                          else mark.mutate(n.id);
                        }}
                        className="grid place-items-center w-6 h-6 rounded text-fg-subtle hover:bg-surface-subtle hover:text-fg cursor-pointer opacity-0 group-hover:opacity-100"
                      >
                        <Icon name={n.readIAN ? "eye" : "check"} size={12} aria-hidden="true" />
                      </button>
                      <div className="text-[11px] text-fg-subtle">
                        {formatRelDate(n.createdAt)}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
