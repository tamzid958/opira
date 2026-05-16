"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { toast } from "sonner";
import { friendlyError } from "@/lib/api-client";
import { Avatar } from "@/components/ui/avatar";
import { DatePicker } from "@/components/ui/date-picker";
import { LoadingPill } from "@/components/ui/loading-pill";
import { Icon } from "@/components/icons";
import {
  useCreateTimeEntry,
  useDeleteTimeEntry,
  useTimeEntries,
} from "@/lib/hooks/use-openproject-detail";
import { useTimeEntryActivities } from "@/lib/hooks/use-openproject";
import { formatDurationShort } from "@/lib/openproject/duration";
import { PEOPLE } from "@/lib/data";

const schema = z.object({
  hours: z
    .string()
    .min(1, "Required")
    .refine((s) => Number(s) > 0, "Must be a positive number"),
  spentOn: z.string().min(1, "Pick a date"),
  comment: z.string().optional().default(""),
  activityId: z.string().optional().default(""),
});

const INPUT =
  "w-full h-9 px-3 rounded-md border border-border bg-surface-elevated text-[13px] text-fg placeholder:text-fg-faint outline-none transition-colors focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-100)]";
const LABEL = "block text-[12px] font-semibold text-fg-muted mb-1";

export function TimeEntriesPanel({ wpId, currentUserId, canLog = true }) {
  const q = useTimeEntries(wpId);
  const activitiesQ = useTimeEntryActivities(canLog);
  const create = useCreateTimeEntry(wpId);
  const del = useDeleteTimeEntry(wpId);
  const [showForm, setShowForm] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      hours: "",
      spentOn: format(new Date(), "yyyy-MM-dd"),
      comment: "",
      activityId: "",
    },
  });
  const spentOn = useWatch({ control, name: "spentOn" });

  const onSubmit = async (values) => {
    try {
      await create.mutateAsync({
        hours: Number(values.hours),
        spentOn: values.spentOn,
        comment: values.comment,
        activityId: values.activityId || undefined,
      });
      toast.success("Time logged");
      reset({
        hours: "",
        spentOn: format(new Date(), "yyyy-MM-dd"),
        comment: "",
        activityId: "",
      });
      setShowForm(false);
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't log time — please try again."));
    }
  };

  const entries = q.data || [];
  const totalHours = entries.reduce(
    (s, e) => s + parseFloat(e.hoursIso?.match(/(\d+)/)?.[1] || 0),
    0,
  );

  return (
    <div>
      {q.isLoading && <LoadingPill label="loading work log" />}
      {!q.isLoading && entries.length === 0 && !showForm && (
        <div className="text-[13px] text-fg-subtle text-center py-4">
          No time logged yet.
          {canLog ? (
            <>
              {" "}
              <a
                role="button"
                data-inline-tap
                tabIndex={0}
                onClick={() => setShowForm(true)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setShowForm(true)}
                className="text-accent cursor-pointer hover:underline"
              >
                Log work
              </a>
            </>
          ) : null}
        </div>
      )}

      {entries.length > 0 && (
        <div className="mb-3">
          {entries.map((e) => {
            const user = PEOPLE[e.user];
            return (
              <div
                key={e.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[140px_minmax(0,1fr)_70px_28px] items-start sm:items-center gap-2 py-1.5 border-b border-border-soft last:border-b-0 text-[13px]"
              >
                <span className="inline-flex items-center gap-1.5 col-start-1 row-start-1">
                  <Avatar user={user} size="sm" />
                  <span className="text-fg-subtle text-xs">{e.spentOn}</span>
                </span>
                <span className="text-fg-muted truncate col-start-1 row-start-2 sm:col-auto sm:row-auto" title={e.comment}>
                  {e.activityName ? (
                    <span className="text-fg-subtle text-[11px] mr-1.5 px-1 py-0.5 rounded bg-surface-subtle">
                      {e.activityName}
                    </span>
                  ) : null}
                  {e.comment || (e.activityName ? "" : "—")}
                </span>
                <span className="text-right font-mono text-xs text-fg col-start-2 row-start-1 sm:col-auto sm:row-auto">
                  {formatDurationShort(e.hoursIso)}
                </span>
                {e.permissions?.delete !== false && e.user === currentUserId ? (
                  <button
                    type="button"
                    aria-label="Delete time entry"
                    onClick={async () => {
                      try {
                        await del.mutateAsync(e.id);
                        toast.success("Entry deleted");
                      } catch (err) {
                        toast.error(
                          friendlyError(err, "Couldn't delete entry — please try again."),
                        );
                      }
                    }}
                    className="grid place-items-center w-6.5 h-6.5 rounded text-fg-subtle hover:bg-surface-subtle hover:text-pri-highest cursor-pointer justify-self-end col-start-2 row-start-2 sm:col-auto sm:row-auto"
                  >
                    <Icon name="trash" size={12} aria-hidden="true" />
                  </button>
                ) : (
                  <span />
                )}
              </div>
            );
          })}
          <div className="mt-2 text-xs text-fg-subtle text-right">
            Total: <b className="text-fg">{totalHours.toFixed(1)}h</b>
          </div>
        </div>
      )}

      {!showForm && entries.length > 0 && canLog && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 h-6.5 px-2.5 rounded-md border border-border bg-surface-elevated text-fg text-xs font-medium hover:bg-surface-subtle hover:border-border-strong"
        >
          <Icon name="plus" size={12} aria-hidden="true" /> Log time
        </button>
      )}

      {showForm && canLog && (
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3 mt-3">
          <div className="grid grid-cols-1 sm:grid-cols-[120px_minmax(0,1fr)] gap-3">
            <div>
              <label className={LABEL}>Hours</label>
              <input
                type="number"
                step="0.25"
                min="0"
                placeholder="2.5"
                className={INPUT}
                {...register("hours")}
                aria-invalid={!!errors.hours}
              />
              {errors.hours && (
                <div className="text-pri-highest text-[11px] mt-0.5">
                  {errors.hours.message}
                </div>
              )}
            </div>
            <div>
              <label className={LABEL}>Date</label>
              <DatePicker
                value={spentOn}
                onChange={(d) => setValue("spentOn", d || "", { shouldValidate: true })}
                clearable={false}
              />
            </div>
          </div>
          {(activitiesQ.data?.length || 0) > 0 && (
            <div>
              <label className={LABEL}>Activity</label>
              <select
                className={INPUT}
                {...register("activityId")}
              >
                <option value="">— None —</option>
                {activitiesQ.data.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className={LABEL}>Comment</label>
            <input
              placeholder="What did you work on?"
              className={INPUT}
              {...register("comment")}
            />
          </div>
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              disabled={create.isPending}
              className="inline-flex items-center gap-1.5 h-6.5 px-2.5 rounded-md border border-transparent bg-transparent text-xs text-fg hover:bg-surface-subtle disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="inline-flex items-center gap-1.5 h-6.5 px-2.5 rounded-md bg-accent text-on-accent text-xs font-semibold hover:bg-accent-600 disabled:opacity-50"
            >
              {create.isPending ? "Logging…" : "Log time"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
