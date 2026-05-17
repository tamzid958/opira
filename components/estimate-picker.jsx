"use client";

import { useState } from "react";
import { TShirtPicker } from "@/components/tshirt-picker";
import { Icon } from "@/components/icons";
import { workingDaysBetween } from "@/lib/openproject/estimate";
import { workingDaySet } from "@/lib/openproject/working-days";
import { usePublicConfig } from "@/components/config-provider";

// EstimatePicker — single editor for all three estimation modes.
//
//   mode = "tshirt"   → TShirtPicker (CustomOption schema, value is the option label)
//   mode = "numeric"  → small Fibonacci dropdown (value is the number)
//   mode = "duration" → paired start/due <input type="date" /> (value is { startDate, dueDate })
//
// Callers pass the already-detected mode (via useEstimateMode) and the live
// task (or values) so the picker can show the current value. The change
// shape matches the underlying field:
//
//   tshirt:    onChange(label, href)
//   numeric:   onChange(number)
//   duration:  onChange({ startDate, dueDate })
//
// Falls back to a numeric picker while the mode is loading so the surface
// stays usable even before the schema fetch resolves.

const NUMERIC_OPTIONS = [
  { label: "—", value: null },
  { divider: true },
  ...[1, 2, 3, 5, 8, 13, 21].map((n) => ({ label: String(n), value: n })),
];

export function EstimatePicker({
  mode,
  isLoadingOptions = false,
  task,
  allowed,
  disabled = false,
  onChange,
  onChangeDates,
}) {
  if (mode === "tshirt") {
    return (
      <TShirtPicker
        value={task?.pointsRaw}
        allowed={allowed}
        isLoading={isLoadingOptions}
        onChange={onChange}
      />
    );
  }
  if (mode === "duration") {
    return (
      <DateRangeEstimate
        startDate={task?.startDate || ""}
        dueDate={task?.dueDate || ""}
        disabled={disabled}
        onChange={onChangeDates}
      />
    );
  }
  // Default: numeric. Inline native <select> so we don't fight the styling
  // of the surrounding field-row layout. The picker always offers "—" as
  // the first item so users can clear an estimate without leaving the row.
  return (
    <select
      disabled={disabled}
      value={task?.points ?? ""}
      onChange={(e) => {
        const v = e.target.value;
        onChange?.(v === "" ? null : Number(v), null);
      }}
      className="h-7 px-2 rounded-md border border-border bg-surface-elevated text-[12px] text-fg cursor-pointer disabled:opacity-50"
    >
      {NUMERIC_OPTIONS.map((it, i) =>
        it.divider ? (
          <option key={`d${i}`} disabled>
            ──────
          </option>
        ) : (
          <option key={String(it.value)} value={it.value ?? ""}>
            {it.label}
          </option>
        ),
      )}
    </select>
  );
}

// Paired date inputs. Surfaces the working-day count between the two as a
// faint badge so the user can see the resulting weight at a glance. Empty
// dates clear the estimate (weight = 0).
function DateRangeEstimate({ startDate, dueDate, disabled, onChange }) {
  const [s, setS] = useState(startDate || "");
  const [d, setD] = useState(dueDate || "");
  const { workingDays } = usePublicConfig();
  const mask = workingDaySet(workingDays);
  const days = workingDaysBetween(s || null, d || null, mask);

  const fire = (next) => {
    setS(next.start);
    setD(next.due);
    onChange?.({
      startDate: next.start || null,
      dueDate: next.due || null,
    });
  };

  return (
    <div className="inline-flex items-center gap-1.5 text-[12px]">
      <input
        type="date"
        value={s}
        disabled={disabled}
        onChange={(e) => fire({ start: e.target.value, due: d })}
        className="h-7 px-2 rounded-md border border-border bg-surface-elevated text-fg outline-none focus:border-accent disabled:opacity-50"
        aria-label="Start date"
      />
      <Icon name="chev-right" size={11} className="text-fg-subtle" aria-hidden="true" />
      <input
        type="date"
        value={d}
        disabled={disabled}
        onChange={(e) => fire({ start: s, due: e.target.value })}
        className="h-7 px-2 rounded-md border border-border bg-surface-elevated text-fg outline-none focus:border-accent disabled:opacity-50"
        aria-label="Due date"
      />
      {days > 0 && (
        <span
          className="px-1.5 h-5 inline-flex items-center rounded-full bg-surface-muted text-fg-muted text-[10.5px] font-medium tabular-nums"
          title={`${days} working day${days === 1 ? "" : "s"} between dates`}
        >
          {days}d
        </span>
      )}
    </div>
  );
}
