"use client";

import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { DatePicker } from "@/components/ui/date-picker";
import { FormError } from "@/components/ui/form-error";
import { Icon } from "@/components/icons";

const schema = z
  .object({
    name: z.string().trim().min(1, "Sprint needs a name"),
    start: z.string().min(1, "Pick a start date"),
    end: z.string().min(1, "Pick an end date"),
    goal: z.string().optional().default(""),
  })
  .refine((v) => v.end >= v.start, {
    path: ["end"],
    message: "End date must be on or after start",
  });

const isoDay = (d) => format(d, "yyyy-MM-dd");

const INPUT =
  "w-full h-10 px-3 rounded-lg border border-border bg-surface-elevated text-[14px] text-fg placeholder:text-fg-faint outline-none transition-colors focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-100)]";
const LABEL = "block text-[12px] font-medium text-fg-muted mb-1.5";

// Compact "Create sprint" modal. Senior-designer pass: one column, soft
// chrome, minimum required input. Smart defaults pre-fill name + a 2-week
// range so the user can tap Create with zero edits. The optional goal
// field lives behind progressive disclosure to keep the default state
// short and make the primary action obvious.
export function CreateSprintModal({ onClose, onCreate, defaultName }) {
  const [submitErr, setSubmitErr] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showGoal, setShowGoal] = useState(false);

  const today = new Date();
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name:
        defaultName ||
        `Sprint ${today.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
      start: isoDay(today),
      end: isoDay(addDays(today, 13)),
      goal: "",
    },
  });

  const start = useWatch({ control, name: "start" });
  const end = useWatch({ control, name: "end" });
  const goal = useWatch({ control, name: "goal" });

  // Inline duration label so the user sees the planned length update as
  // they edit the dates — avoids a separate "Duration" field.
  const duration = (() => {
    try {
      if (!start || !end) return null;
      const days = differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
      if (days <= 0) return null;
      if (days % 7 === 0) return `${days / 7} ${days === 7 ? "week" : "weeks"}`;
      return `${days} days`;
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onSubmit = async (values) => {
    setSubmitErr(null);
    setSubmitting(true);
    try {
      await onCreate(values);
    } catch (e) {
      setSubmitErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-100 grid place-items-center p-3 sm:p-6 scrim animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-surface-elevated rounded-2xl shadow-2xl w-full max-w-md flex flex-col animate-slide-up"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <h2 className="font-display text-[20px] font-semibold tracking-[-0.018em] text-fg m-0">New sprint</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid place-items-center w-8 h-8 rounded-md text-fg-subtle hover:bg-surface-subtle hover:text-fg cursor-pointer"
          >
            <Icon name="x" size={14} aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 pb-4 grid gap-4">
          {submitErr && <FormError message={submitErr} />}

          <div>
            <label className={LABEL} htmlFor="sp-name">
              Name
            </label>
            <input
              id="sp-name"
              autoFocus
              placeholder="Sprint 24"
              className={INPUT}
              {...register("name")}
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <div className="text-pri-highest text-[12px] mt-1.5">{errors.name.message}</div>
            )}
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[12px] font-medium text-fg-muted">Dates</span>
              {duration && (
                <span className="text-[11px] text-fg-subtle">{duration}</span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <DatePicker
                value={start}
                onChange={(d) => setValue("start", d || "", { shouldValidate: true })}
                clearable={false}
              />
              <DatePicker
                value={end}
                onChange={(d) => setValue("end", d || "", { shouldValidate: true })}
                clearable={false}
              />
            </div>
            {errors.end && (
              <div className="text-pri-highest text-[12px] mt-1.5">{errors.end.message}</div>
            )}
          </div>

          {showGoal || goal ? (
            <div>
              <label className={LABEL} htmlFor="sp-goal">
                Goal <span className="text-fg-faint font-normal">(optional)</span>
              </label>
              <textarea
                id="sp-goal"
                {...register("goal")}
                placeholder="What outcome should this sprint deliver?"
                rows={2}
                className="w-full p-3 rounded-lg border border-border bg-surface-elevated text-[14px] text-fg leading-relaxed placeholder:text-fg-faint outline-none transition-colors focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-100)] resize-y"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowGoal(true)}
              className="inline-flex items-center gap-1.5 self-start text-[12px] font-medium text-accent hover:text-accent-700 cursor-pointer"
            >
              <Icon name="plus" size={12} aria-hidden="true" />
              Add a sprint goal
            </button>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border-soft">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex items-center h-9 px-3 rounded-lg text-fg-muted text-[13px] font-medium hover:bg-surface-subtle hover:text-fg cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center h-9 px-4 rounded-lg bg-accent text-on-accent text-[13px] font-semibold hover:bg-accent-600 cursor-pointer disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create sprint"}
          </button>
        </div>
      </form>
    </div>
  );
}
