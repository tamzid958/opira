"use client";

import { T_SHIRT_TO_POINTS } from "@/lib/openproject/story-points-constants";
import { cn } from "@/lib/utils";

export function TShirtPicker({ value, onChange, allowed, isLoading = false }) {
  // Only render values OpenProject's schema actually accepts. Falling back
  // to a hardcoded list would let users pick sizes the field can't store
  // and the PATCH would error on save.
  if (!Array.isArray(allowed) || allowed.length === 0) {
    if (isLoading) {
      return (
        <div className="inline-flex gap-0.5" aria-hidden="true">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="min-w-6 h-6 w-8 rounded bg-surface-muted animate-pulse"
            />
          ))}
        </div>
      );
    }
    return null;
  }
  const options = allowed.map((o) => ({
    label: o.value,
    value: o.value,
    href: o.href,
  }));

  return (
    <div className="inline-flex gap-0.5">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.label}
            type="button"
            onClick={() => onChange?.(o.value, o.href)}
            title={`${T_SHIRT_TO_POINTS[String(o.value).toUpperCase()] ?? "?"} pts`}
            className={cn(
              "min-w-6 h-6 px-1.5 rounded text-[10.5px] font-semibold uppercase tracking-wider transition-colors cursor-pointer",
              active
                ? "bg-accent text-on-accent"
                : "bg-surface-muted text-fg-muted border border-transparent hover:bg-surface-subtle hover:border-border",
            )}
          >
            {o.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => onChange?.(null, null)}
        title="Clear"
        className="min-w-6 h-6 px-1.5 rounded text-[10.5px] font-semibold text-fg-subtle bg-transparent border border-transparent hover:bg-surface-subtle"
      >
        —
      </button>
    </div>
  );
}
