"use client";

import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { friendlyError } from "@/lib/api-client";
import { DatePicker } from "@/components/ui/date-picker";
import { FormError } from "@/components/ui/form-error";
import { useUpdateVersion } from "@/lib/hooks/use-openproject-detail";

const schema = z
  .object({
    name: z.string().trim().min(1, "Sprint needs a name"),
    start: z.string().optional().default(""),
    end: z.string().optional().default(""),
    goal: z.string().optional().default(""),
  })
  .refine(
    (v) => {
      // Either both dates are empty or both are filled.
      if (!v.start && !v.end) return true;
      return !!v.start && !!v.end;
    },
    { path: ["end"], message: "Set both dates or leave both empty" },
  )
  .refine((v) => !v.start || !v.end || v.end >= v.start, {
    path: ["end"],
    message: "End date must be on or after start",
  });

const INPUT =
  "w-full h-9 px-3 rounded-md border border-border bg-surface-elevated text-[13px] text-fg placeholder:text-fg-faint outline-none transition-colors focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-100)]";
const TEXTAREA =
  "w-full p-3 rounded-md border border-border bg-surface-elevated text-[13px] text-fg leading-relaxed placeholder:text-fg-faint outline-none transition-colors focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-100)] resize-y";
const LABEL = "block text-[12px] font-semibold text-fg-muted mb-1";

export function EditSprintModal({ sprint, projectId, onClose }) {
  const update = useUpdateVersion(projectId);
  const [submitErr, setSubmitErr] = useState(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: sprint.name || "",
      start: sprint.start && sprint.start !== "—" ? sprint.start : "",
      end: sprint.end && sprint.end !== "—" ? sprint.end : "",
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

  const onSubmit = async (values) => {
    setSubmitErr(null);
    try {
      await update.mutateAsync({
        id: sprint.id,
        name: values.name,
        description: values.goal,
        startDate: values.start || null,
        endDate: values.end || null,
      });
      toast.success("Sprint updated");
      onClose?.();
    } catch (e) {
      setSubmitErr(friendlyError(e, "Couldn't update sprint — please try again."));
    }
  };

  return (
    <div
      className="fixed inset-0 z-100 grid place-items-center p-3 sm:p-6 scrim animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && !update.isPending && onClose?.()}
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-surface-elevated rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[calc(100vh-48px)] animate-slide-up"
      >
        <header className="px-5 pt-5 pb-3 border-b border-border">
          <h2 className="font-display text-[20px] font-semibold tracking-[-0.018em] text-fg m-0">Edit sprint</h2>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4 grid gap-4">
          <FormError message={submitErr} />
          <div>
            <label className={LABEL}>Sprint name</label>
            <input className={INPUT} {...register("name")} aria-invalid={!!errors.name} />
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
              />
            </div>
            <div>
              <label className={LABEL}>End date</label>
              <DatePicker
                value={end}
                onChange={(d) => setValue("end", d || "", { shouldValidate: true })}
              />
              {errors.end && (
                <div className="text-pri-highest text-xs mt-1">{errors.end.message}</div>
              )}
            </div>
          </div>
          <div>
            <label className={LABEL}>Sprint goal</label>
            <textarea
              {...register("goal")}
              placeholder="What outcome should this sprint achieve?"
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
            disabled={isSubmitting || update.isPending}
          >
            {update.isPending ? "Saving…" : "Save changes"}
          </button>
        </footer>
      </form>
    </div>
  );
}
