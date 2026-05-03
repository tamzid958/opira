"use client";

import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { toast } from "sonner";
import { Icon } from "@/components/icons";
import { DatePicker } from "@/components/ui/date-picker";
import { FormError } from "@/components/ui/form-error";
import { useCapacity, useUpdateVersion } from "@/lib/hooks/use-openproject-detail";

const schema = z.object({
  name: z.string().min(1, "Required"),
  start: z.string().min(1, "Pick a start date"),
  end: z.string().min(1, "Pick an end date"),
  goal: z.string().optional().default(""),
});

const INPUT =
  "w-full h-9 px-3 rounded-md border border-border bg-surface-elevated text-[13px] text-fg placeholder:text-fg-faint outline-none transition-colors focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-100)]";
const TEXTAREA =
  "w-full p-3 rounded-md border border-border bg-surface-elevated text-[13px] text-fg leading-relaxed placeholder:text-fg-faint outline-none transition-colors focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-100)] resize-y";
const LABEL = "block text-[12px] font-semibold text-fg-muted mb-1";

function todayIso() {
  return format(new Date(), "yyyy-MM-dd");
}

// ─────────────────────────────────────────────────────────────────
// Capacity panel — committed-hours vs available-hours per member,
// summed for a project-wide read at the top. Hours convert from
// points via HOURS_PER_POINT (server-side default 4)
// when a WP has no estimatedTime. Soft gate only: we surface
// "over capacity" but don't block submission — the planner is the
// source of truth.

function CapacityPanel({ capacity, overCommitted }) {
  const { totals = {}, members = [], hoursPerPoint, truncated } = capacity;
  const available = totals.availableHours || 0;
  const committed = totals.committedHours || 0;
  const utilization = available > 0 ? Math.round((committed / available) * 100) : 0;
  const tone = overCommitted
    ? "border-pri-high/40 bg-pri-high/10"
    : utilization >= 75
    ? "border-tag-backend-bg bg-tag-backend-bg/40"
    : "border-border-soft bg-surface-app";

  return (
    <div className={`rounded-lg border ${tone} p-3 grid gap-3`}>
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold text-fg-subtle uppercase tracking-wider">
            Team capacity
          </div>
          <div className="text-[13px] text-fg-muted leading-snug mt-1">
            {committed.toFixed(1)}h committed of {available.toFixed(1)}h available
            {totals.unassignedCommittedHours
              ? ` (incl. ${totals.unassignedCommittedHours.toFixed(1)}h unassigned)`
              : ""}
          </div>
        </div>
        <span
          className={`inline-flex items-center px-2 h-6 rounded-full text-[11px] font-bold tabular-nums ${
            overCommitted
              ? "bg-status-blocked-bg text-status-blocked-fg"
              : utilization >= 75
              ? "bg-tag-backend-bg text-tag-backend-fg"
              : "bg-status-done-bg text-status-done-fg"
          }`}
        >
          {utilization}%
        </span>
      </div>

      <div className="relative h-1.5 rounded-full bg-surface-muted overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ${
            overCommitted ? "bg-pri-high" : "bg-accent"
          }`}
          style={{ width: `${Math.min(utilization, 100)}%` }}
        />
        {utilization > 100 && (
          <div
            className="absolute inset-y-0 right-0 rounded-r-full bg-pri-high"
            style={{ width: `${Math.min(utilization - 100, 50)}%` }}
            title={`${utilization - 100}% over`}
          />
        )}
      </div>

      <ul className="m-0 p-0 list-none grid gap-1.5">
        {members.slice(0, 6).map((m) => {
          const memberPct =
            m.availableHours > 0
              ? Math.round((m.committedHours / m.availableHours) * 100)
              : m.committedHours > 0
              ? 999
              : 0;
          const memberOver = m.committedHours > m.availableHours;
          return (
            <li
              key={m.userId}
              className="grid items-center gap-2"
              style={{ gridTemplateColumns: "minmax(0, 120px) 1fr 80px" }}
            >
              <span className="text-[12px] text-fg truncate" title={m.name}>
                {m.name}
              </span>
              <span className="relative h-1 rounded-full bg-surface-muted overflow-hidden">
                <span
                  className={`absolute inset-y-0 left-0 rounded-full ${
                    memberOver ? "bg-pri-high" : "bg-accent/70"
                  }`}
                  style={{ width: `${Math.min(memberPct, 100)}%` }}
                />
              </span>
              <span
                className={`text-right tabular-nums text-[11px] ${
                  memberOver ? "text-pri-high font-semibold" : "text-fg-subtle"
                }`}
                title={`${m.availableDays} working days, ${m.nonWorkingDays} non-working`}
              >
                {m.committedHours.toFixed(1)} / {m.availableHours.toFixed(1)}h
              </span>
            </li>
          );
        })}
        {members.length > 6 && (
          <li className="text-[11px] text-fg-faint">
            …and {members.length - 6} more
          </li>
        )}
      </ul>

      <div className="text-[11px] text-fg-faint leading-snug">
        Hours convert from points at {hoursPerPoint}h/pt (configurable via
        HOURS_PER_POINT).{" "}
        {truncated && "Project has more than 50 members; only the first 50 were scanned. "}
        {overCommitted && "You can still start the sprint — this is a soft check."}
      </div>
    </div>
  );
}

export function SprintModal({ sprint, tasks, projectId, onClose, onStarted }) {
  const update = useUpdateVersion(projectId);
  const [submitErr, setSubmitErr] = useState(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: sprint.name,
      start: sprint.start && sprint.start !== "—" ? sprint.start : todayIso(),
      end: sprint.end && sprint.end !== "—" ? sprint.end : todayIso(),
      goal: sprint.goal || "",
    },
  });
  const start = useWatch({ control, name: "start" });
  const end = useWatch({ control, name: "end" });

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !update.isPending && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [update.isPending, onClose]);

  const sTasks = tasks.filter((t) => t.sprint === sprint.id);
  const totalIssues = sTasks.length;
  const totalPoints = sTasks.reduce((s, t) => s + (t.points || 0), 0);
  const unassigned = sTasks.filter((t) => !t.assignee).length;
  const noEstimate = sTasks.filter((t) => !t.points).length;

  // Capacity is computed against the sprint's *current* dates. The user can
  // change the form's dates above, but committed/available won't update
  // until the sprint is saved (the API reads the version's persisted dates).
  const capacityQ = useCapacity(projectId, sprint.id, !!projectId && !!sprint.id);
  const capacity = capacityQ.data || null;
  const overCommitted =
    capacity?.totals?.committedHours > capacity?.totals?.availableHours;

  const onSubmit = async (values) => {
    setSubmitErr(null);
    try {
      await update.mutateAsync({
        id: sprint.id,
        name: values.name,
        description: values.goal,
        status: "open",
        startDate: values.start,
        endDate: values.end,
      });
      toast.success(`Sprint started · ${values.name.split(" — ")[0]}`);
      onStarted?.();
    } catch (e) {
      setSubmitErr(e.message);
    }
  };

  return (
    <div
      className="fixed inset-0 z-100 grid place-items-center p-3 sm:p-6 scrim animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && !update.isPending && onClose()}
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-surface-elevated rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[calc(100vh-48px)] animate-slide-up"
      >
        <header className="px-5 pt-5 pb-3 border-b border-border">
          <h2 className="font-display text-[20px] font-semibold tracking-[-0.018em] text-fg m-0">Start Sprint</h2>
          <p className="text-[13px] text-fg-subtle leading-relaxed m-0 mt-1">
            {totalIssues} issue{totalIssues === 1 ? "" : "s"} will be included.
          </p>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 grid gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border-soft bg-surface-app p-3">
              <div className="text-[11px] font-semibold text-fg-subtle uppercase tracking-wider">
                Issues
              </div>
              <div className="text-2xl font-bold text-fg mt-1">{totalIssues}</div>
            </div>
            <div className="rounded-lg border border-border-soft bg-surface-app p-3">
              <div className="text-[11px] font-semibold text-fg-subtle uppercase tracking-wider">
                Story points
              </div>
              <div className="text-2xl font-bold text-fg mt-1">{totalPoints}</div>
            </div>
          </div>

          {(unassigned > 0 || noEstimate > 0) && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-[#fde68a] bg-tag-backend-bg text-[13px] text-tag-backend-fg">
              <Icon name="flag" size={14} className="mt-px shrink-0" aria-hidden="true" />
              <div>
                <div className="font-semibold mb-0.5">Heads up before you start</div>
                {unassigned > 0 && (
                  <div>
                    · {unassigned} {unassigned === 1 ? "issue is" : "issues are"} unassigned
                  </div>
                )}
                {noEstimate > 0 && (
                  <div>
                    · {noEstimate} {noEstimate === 1 ? "issue is" : "issues are"} unestimated
                  </div>
                )}
              </div>
            </div>
          )}

          {capacity && capacity.members && capacity.members.length > 0 && (
            <CapacityPanel capacity={capacity} overCommitted={overCommitted} />
          )}

          <FormError message={submitErr} />

          <div>
            <label className={LABEL}>Sprint name</label>
            <input
              className={INPUT}
              {...register("name")}
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <div className="text-pri-highest text-xs mt-1">{errors.name.message}</div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Start date</label>
              <DatePicker
                value={start}
                onChange={(d) => setValue("start", d || "", { shouldValidate: true })}
                clearable={false}
              />
            </div>
            <div>
              <label className={LABEL}>End date</label>
              <DatePicker
                value={end}
                onChange={(d) => setValue("end", d || "", { shouldValidate: true })}
                clearable={false}
              />
            </div>
          </div>

          <div>
            <label className={LABEL}>Sprint goal</label>
            <textarea
              {...register("goal")}
              placeholder="What outcome should this sprint achieve? Visible on the board."
              rows={3}
              className={TEXTAREA}
            />
          </div>
        </div>

        <footer className="flex justify-end gap-2 px-5 py-3 border-t border-border bg-surface-subtle rounded-b-xl">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-surface-elevated text-fg text-[13px] font-medium hover:bg-surface-subtle hover:border-border-strong disabled:opacity-50"
            onClick={onClose}
            disabled={update.isPending}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-accent text-on-accent text-[13px] font-semibold hover:bg-accent-600 disabled:opacity-50"
            disabled={update.isPending}
          >
            <Icon name="play" size={12} aria-hidden="true" />
            {update.isPending ? "Starting…" : "Start sprint"}
          </button>
        </footer>
      </form>
    </div>
  );
}
