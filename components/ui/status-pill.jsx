"use client";

import { cn } from "@/lib/utils";

// Renders an OpenProject status as a pill. All visual state is API-driven:
// - `color` comes from the status resource (`/api/v3/statuses[*].color`).
// - `isClosed` comes from the same resource and switches the pill into the
//   closed look (line-through on supporting browsers; muted background).
// - `name` is the human label.
//
// No keyword-based bucket classification.
export function StatusPill({ name, isClosed = false, color }) {
  if (!name) return null;
  const style = color
    ? {
        backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
        color,
        borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
      }
    : undefined;
  return (
    <span
      title={name}
      className={cn(
        "inline-flex items-center h-5.5 px-2 rounded text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap max-w-full border",
        !color && "bg-surface-subtle text-fg border-border-soft",
        isClosed && "opacity-80",
      )}
      style={style}
    >
      <span className="truncate">{name}</span>
    </span>
  );
}
