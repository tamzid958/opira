"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DayPicker } from "react-day-picker";
import { format, parseISO } from "date-fns";
import { Icon } from "@/components/icons";
import { useIsClient } from "@/lib/hooks/use-is-client";

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  clearable = true,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
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

  const selected = value ? parseISO(value) : undefined;

  const handleSelect = (d) => {
    onChange?.(d ? format(d, "yyyy-MM-dd") : null);
    setOpen(false);
  };

  const handleOpen = (e) => {
    setAnchorRect(e.currentTarget.getBoundingClientRect());
    setOpen(true);
  };

  const POPOVER_HEIGHT = 320;
  const POPOVER_WIDTH = 320;

  const popoverStyle = anchorRect
    ? (() => {
        const spaceBelow = window.innerHeight - anchorRect.bottom - 4;
        const top =
          spaceBelow >= POPOVER_HEIGHT
            ? anchorRect.bottom + 4
            : Math.max(8, anchorRect.top - POPOVER_HEIGHT - 4);
        const left = Math.min(
          Math.max(8, anchorRect.left),
          window.innerWidth - POPOVER_WIDTH - 8,
        );
        return { position: "fixed", left, top, zIndex: 1100 };
      })()
    : {};

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={[
          "inline-flex items-center gap-1.5 w-full min-w-0 h-9 px-2.5 rounded-md border border-border bg-surface-elevated text-[13px] text-fg text-left transition-colors hover:bg-surface-subtle hover:border-border-strong",
          disabled && "opacity-60 cursor-default hover:bg-surface-elevated hover:border-border",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={handleOpen}
        disabled={disabled}
        aria-disabled={disabled || undefined}
        title={disabled ? "You don't have permission to do that." : undefined}
      >
        <Icon name="calendar" size={13} className="text-fg-subtle shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">
          {value ? (
            format(parseISO(value), "MMM d, yyyy")
          ) : (
            <span className="text-fg-faint">{placeholder}</span>
          )}
        </span>
      </button>
      {mounted && open &&
        createPortal(
          <div
            ref={popoverRef}
            style={popoverStyle}
            className="bg-surface-elevated border border-border rounded-lg shadow-lg p-2"
          >
            <DayPicker
              mode="single"
              selected={selected}
              onSelect={handleSelect}
              showOutsideDays
            />
            {clearable && value && (
              <div className="border-t border-border-soft pt-1.5 mt-1">
                <button
                  type="button"
                  className="w-full h-7 px-2.5 rounded-md text-[13px] font-medium text-fg-muted hover:bg-surface-subtle"
                  onClick={() => handleSelect(null)}
                >
                  Clear date
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
