"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/api-client";
import { Icon } from "@/components/icons";
import {
  useCreateVersion,
  useUpdateVersion,
} from "@/lib/hooks/use-openproject-detail";
import { useUpdateTask } from "@/lib/hooks/use-openproject";
import { buildClosedStatusIdSet } from "@/lib/openproject/task-state";
import { CreateSprintModal } from "@/components/create-sprint";
import { AiSuggestButton } from "@/components/ui/ai-suggest-button";
import { usePublicConfig } from "@/components/config-provider";
import { formatEstimate, weightOf } from "@/lib/openproject/estimate";
import { cn } from "@/lib/utils";

const TICKETS_PER_PAGE = 5;

export function CompleteSprintModal({
  sprint,
  tasks,
  projectId,
  sprints,
  statuses,
  onClose,
  onCompleted,
}) {
  const [destination, setDestination] = useState("backlog");
  const [page, setPage] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [releaseNotesHtml, setReleaseNotesHtml] = useState("");
  const updateVersion = useUpdateVersion(projectId);
  const updateTask = useUpdateTask(projectId);
  const createVersion = useCreateVersion(projectId);
  const [busy, setBusy] = useState(false);
  const { aiEnabled } = usePublicConfig();

  const closedStatusIds = buildClosedStatusIdSet(statuses);

  const inSprint = tasks.filter((t) => t.sprint === sprint.id);
  const open = inSprint.filter(
    (t) => !closedStatusIds.has(String(t.statusId)),
  );
  const future = sprints.filter(
    (s) =>
      s.id !== sprint.id &&
      s.status !== "closed" &&
      (s.name || "").trim().toLowerCase() !== "backlog",
  );

  const totalPoints = open.reduce((sum, t) => sum + weightOf(t), 0);

  const pageCount = Math.max(1, Math.ceil(open.length / TICKETS_PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * TICKETS_PER_PAGE;
  const pageItems = open.slice(pageStart, pageStart + TICKETS_PER_PAGE);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && !showCreate && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, showCreate, onClose]);

  const handleCreate = async (cfg) => {
    try {
      const created = await createVersion.mutateAsync({
        name: cfg.name,
        description: cfg.goal,
        startDate: cfg.start,
        endDate: cfg.end,
      });
      const newId = created?.id;
      if (newId) setDestination(newId);
      toast.success(`Sprint created · ${cfg.name}`);
      setShowCreate(false);
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't create sprint — please try again."));
      throw e;
    }
  };

  const handle = async () => {
    setBusy(true);
    try {
      for (const t of open) {
        const target = destination === "backlog" ? null : destination;
        await updateTask.mutateAsync({ id: t.id, patch: { sprint: target } });
      }
      await updateVersion.mutateAsync({ id: sprint.id, status: "closed" });
      toast.success(`Sprint completed · ${sprint.name}`);
      onCompleted?.();
      onClose?.();
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't complete the sprint — please try again."));
    } finally {
      setBusy(false);
    }
  };

  const destinationLabel =
    destination === "backlog"
      ? "the backlog"
      : future.find((s) => s.id === destination)?.name?.split(" — ")[0] ||
        "the selected sprint";

  return (
    <div
      className="fixed inset-0 z-100 grid place-items-center p-3 sm:p-6 scrim animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-surface-elevated rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-4 sm:p-6 animate-slide-up"
      >
        <h2 className="font-display text-[20px] font-semibold tracking-[-0.018em] text-fg m-0 mb-2">
          Complete {sprint.name.split(" — ")[0]}
        </h2>
        <p className="text-[13px] text-fg-subtle leading-relaxed m-0 mb-3">
          {open.length} of {inSprint.length} issues are still open
          {totalPoints > 0 ? ` · ${totalPoints} pts` : ""}. They will move to{" "}
          <span className="text-fg font-medium">{destinationLabel}</span>.
        </p>

        {open.length > 0 && (
          <div className="rounded-lg border border-border-soft bg-surface-subtle/50 mb-4 overflow-hidden">
            <ul className="divide-y divide-border-soft">
              {pageItems.map((t) => (
                <li key={t.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="text-[11px] font-mono text-fg-faint shrink-0">
                    {t.key}
                  </span>
                  <span className="text-[13px] text-fg truncate flex-1" title={t.title}>
                    {t.title || "(no title)"}
                  </span>
                  {t.statusName && (
                    <span className="text-[11px] text-fg-subtle shrink-0 px-1.5 py-0.5 rounded bg-surface-elevated border border-border-soft">
                      {t.statusName}
                    </span>
                  )}
                  {formatEstimate(t) && (
                    <span className="text-[11px] font-medium text-fg-muted shrink-0 tabular-nums">
                      {formatEstimate(t)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {pageCount > 1 && (
              <div className="flex items-center justify-between px-3 py-2 border-t border-border-soft bg-surface-elevated">
                <span className="text-[11px] text-fg-subtle">
                  {pageStart + 1}–{Math.min(pageStart + TICKETS_PER_PAGE, open.length)} of{" "}
                  {open.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={safePage === 0}
                    className="grid place-items-center w-7 h-7 rounded-md text-fg-muted hover:bg-surface-subtle hover:text-fg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    aria-label="Previous page"
                  >
                    <Icon name="chev-left" size={12} aria-hidden="true" />
                  </button>
                  <span className="text-[11px] text-fg-subtle tabular-nums px-1">
                    {safePage + 1} / {pageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    disabled={safePage >= pageCount - 1}
                    className="grid place-items-center w-7 h-7 rounded-md text-fg-muted hover:bg-surface-subtle hover:text-fg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    aria-label="Next page"
                  >
                    <Icon name="chev-right" size={12} aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-2 mb-3">
          <label
            className={cn(
              "flex items-center gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors",
              destination === "backlog"
                ? "border-accent bg-accent-50"
                : "border-border bg-transparent hover:bg-surface-subtle",
            )}
          >
            <input
              type="radio"
              checked={destination === "backlog"}
              onChange={() => setDestination("backlog")}
              className="accent-accent"
            />
            <div>
              <div className="font-semibold text-[13px] text-fg">Move to backlog</div>
              <div className="text-xs text-fg-subtle">Open issues become unscheduled.</div>
            </div>
          </label>
          {future.map((s) => (
            <label
              key={s.id}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors",
                destination === s.id
                  ? "border-accent bg-accent-50"
                  : "border-border bg-transparent hover:bg-surface-subtle",
              )}
            >
              <input
                type="radio"
                checked={destination === s.id}
                onChange={() => setDestination(s.id)}
                className="accent-accent"
              />
              <div>
                <div className="font-semibold text-[13px] text-fg">
                  {s.name.split(" — ")[0]}
                </div>
                <div className="text-xs text-fg-subtle">
                  {s.start} – {s.end}
                </div>
              </div>
            </label>
          ))}
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            disabled={busy}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-border text-fg-muted text-[13px] font-medium hover:border-accent hover:text-accent hover:bg-accent-50/40 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Icon name="plus" size={12} aria-hidden="true" />
            {future.length === 0
              ? "No future sprint yet — create one"
              : "Create new sprint…"}
          </button>
        </div>

        {aiEnabled && (
          <div className="mb-4">
            <AiSuggestButton
              mode="release-notes"
              label="Generate release notes"
              payload={{
                sprintName: sprint.name?.split(" — ")[0] || sprint.name,
                completedTasks: inSprint
                  .filter((t) => !open.includes(t))
                  .map((t) => t.title),
              }}
              onAccept={(html) => {
              setReleaseNotesHtml(html);
              const plain = html.replace(/<\/p>/gi, "\n").replace(/<\/li>/gi, "\n").replace(/<[^>]*>/g, "").replace(/\n{3,}/g, "\n\n").trim();
              updateVersion.mutate({ id: sprint.id, description: plain });
            }}
            />
            {releaseNotesHtml && (
              <div className="mt-2 rounded-md border border-border bg-surface-subtle p-3">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-fg-subtle mb-2">Release notes</span>
                <div
                  className="op-html prose-comment text-[13px] leading-relaxed text-fg max-h-40 overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: releaseNotesHtml }}
                />
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-surface-elevated text-fg text-[13px] font-medium hover:bg-surface-subtle hover:border-border-strong disabled:opacity-50"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-accent text-on-accent text-[13px] font-semibold hover:bg-accent-600 disabled:opacity-50"
            onClick={handle}
            disabled={busy}
          >
            <Icon name="check" size={12} aria-hidden="true" />
            {busy ? "Completing…" : "Complete sprint"}
          </button>
        </div>
      </div>

      {showCreate && (
        <CreateSprintModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
