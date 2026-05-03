"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { useIsClient } from "@/lib/hooks/use-is-client";
import { cn } from "@/lib/utils";

export function Menu({
  items,
  onSelect,
  onClose,
  anchorRect,
  align = "left",
  width = 200,
  maxHeight,
  searchable = false,
  searchPlaceholder = "Search…",
}) {
  const ref = useRef(null);
  const mounted = useIsClient();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    const t = setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Apply free-text filter when searchable. Dividers/section headers are
  // dropped while filtering so the result reads as a flat hit list.
  // Must be declared before any early return so hook order stays stable.
  const visibleItems = (() => {
    if (!searchable || !query.trim()) return items;
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (it.divider || it.section) return false;
      return String(it.label || "").toLowerCase().includes(q);
    });
  })();

  if (!mounted) return null;

  // Clamp the menu inside the viewport — without this, opening a chip near
  // the right edge or bottom of the screen crops the dropdown. The width
  // is fixed (not just a min) so long item labels truncate via CSS
  // `truncate` instead of stretching the menu past the configured size.
  const style = {
    position: "fixed",
    width: Math.min(width, (typeof window !== "undefined" ? window.innerWidth : 1024) - 16),
  };
  const MARGIN = 8;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  if (anchorRect) {
    // Horizontal: try left-anchor first; if that overflows the right edge,
    // pin to right-anchor instead. Always keep a small margin from the edge.
    let left;
    if (align === "right") {
      left = Math.max(MARGIN, anchorRect.right - width);
    } else {
      left = anchorRect.left;
      if (left + width > vw - MARGIN) left = Math.max(MARGIN, vw - width - MARGIN);
    }
    style.left = left;
    // Vertical: prefer below; if not enough room, flip above. Cap maxHeight
    // so a long list still fits inside the viewport with room to scroll.
    const below = vh - anchorRect.bottom - MARGIN;
    const above = anchorRect.top - MARGIN;
    if (below >= 200 || below >= above) {
      style.top = anchorRect.bottom + 4;
      style.maxHeight = Math.max(160, below - 4);
    } else {
      style.bottom = vh - anchorRect.top + 4;
      style.maxHeight = Math.max(160, above - 4);
    }
    // Caller can tighten the cap further (e.g. for long lists like the
    // WP picker — without this every menu fills the viewport).
    if (maxHeight && style.maxHeight > maxHeight) {
      style.maxHeight = maxHeight;
    }
  }

  return createPortal(
    <div
      ref={ref}
      style={style}
      className="bg-surface-elevated border border-border rounded-lg shadow-lg z-200 animate-pop flex flex-col overflow-hidden"
    >
      {searchable && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-border-soft shrink-0">
          <Icon name="search" size={13} className="text-fg-subtle" aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="flex-1 bg-transparent border-0 outline-none text-[13px] text-fg placeholder:text-fg-faint min-w-0"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-fg-subtle hover:text-fg shrink-0"
              aria-label="Clear search"
            >
              <Icon name="x" size={12} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      <div className="p-1 overflow-y-auto flex-1">
      {visibleItems.length === 0 && searchable && (
        <div className="px-2.5 py-3 text-[12px] text-fg-subtle text-center">
          No matches
        </div>
      )}
      {visibleItems.map((it, i) => {
        if (it.divider) return <div key={i} className="my-1 h-px bg-border-soft" />;
        if (it.section) {
          return (
            <div
              key={i}
              className="px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle"
            >
              {it.section}
            </div>
          );
        }
        return (
          <div
            key={i}
            onClick={(e) => {
              // Menu renders via portal to document.body, but React still
              // bubbles synthetic events through the React tree — so a click
              // here would otherwise reach the parent row's onClick (which
              // typically opens a detail modal). Stop propagation here so
              // every Menu use site is protected without per-call boilerplate.
              e.stopPropagation();
              if (!it.disabled) {
                onSelect(it);
                onClose();
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className={cn(
              "flex items-center gap-2 px-2.5 py-1.5 rounded text-[13px] cursor-pointer transition-colors",
              it.disabled
                ? "opacity-50 cursor-not-allowed"
                : it.active
                ? "bg-accent-50 text-accent-700"
                : it.danger
                ? "text-pri-highest hover:bg-status-blocked-bg"
                : "text-fg hover:bg-surface-subtle",
            )}
          >
            {it.icon && <Icon name={it.icon} size={14} aria-hidden="true" />}
            {it.swatch && (
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ background: it.swatch }}
              />
            )}
            {it.avatar && <Avatar user={it.avatar} size="sm" />}
            <span className="flex-1 truncate">{it.label}</span>
            {it.kbd && (
              <span className="px-1.5 py-0.5 rounded border border-border bg-surface-app text-[10px] font-mono text-fg-subtle">
                {it.kbd}
              </span>
            )}
            {it.active && (
              <Icon
                name="check"
                size={14}
                className="text-accent-700"
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
      </div>
    </div>,
    document.body,
  );
}
