"use client";

import Link from "next/link";
import { toast } from "sonner";
import { friendlyError } from "@/lib/api-client";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/icons";
import { LoadingPill } from "@/components/ui/loading-pill";
import { TaskStatusPill } from "@/components/ui/task-meta";
import { formatEstimate, inferModeFromTasks } from "@/lib/openproject/estimate";
import {
  useDeleteQuery,
  useSavedQuery,
  useToggleQueryStar,
} from "@/lib/hooks/use-openproject";
import { useEstimateMode } from "@/lib/hooks/use-estimate-mode";
import { PEOPLE } from "@/lib/data";

export function SavedQueryView({ queryId, projectId }) {
  const q = useSavedQuery(queryId, { execute: true }, !!queryId);
  const star = useToggleQueryStar();
  const del = useDeleteQuery();
  const estimateModeQ = useEstimateMode(projectId);

  if (q.isLoading) {
    return (
      <div className="grid place-items-center min-h-[40vh]">
        <LoadingPill label="loading filter" />
      </div>
    );
  }
  if (q.error) {
    return <div className="p-6 text-pri-highest">{String(q.error.message)}</div>;
  }

  const data = q.data;
  if (!data) return null;
  const results = data.results || [];
  const estimateMode = estimateModeQ.isLoading
    ? inferModeFromTasks(results) || "numeric"
    : estimateModeQ.mode || "numeric";

  const onStar = async () => {
    try {
      await star.mutateAsync({ id: data.id, starred: !data.starred });
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't update star"));
    }
  };
  const onDelete = async () => {
    if (!confirm(`Delete saved filter "${data.name}"?`)) return;
    try {
      await del.mutateAsync(data.id);
      toast.success("Filter deleted");
      if (typeof window !== "undefined") {
        window.history.back();
      }
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't delete filter"));
    }
  };

  return (
    <div className="grid gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[20px] font-semibold tracking-[-0.02em] text-fg m-0">
            {data.name}
          </h2>
          <div className="text-[12px] text-fg-subtle mt-1 flex items-center gap-2 flex-wrap">
            {data.public ? <span>Public</span> : <span>Private</span>}
            {data.projectName ? <span>· {data.projectName}</span> : null}
            <span>· {results.length} results</span>
            {(data.filters || []).slice(0, 4).map((f, i) => {
              const field = Object.keys(f || {})[0];
              return (
                <span
                  key={i}
                  className="text-[11px] px-1.5 py-0.5 rounded bg-surface-subtle text-fg-muted"
                >
                  {field}
                </span>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {(data.permissions?.star || data.permissions?.unstar) && (
            <button
              type="button"
              onClick={onStar}
              aria-label={data.starred ? "Unstar filter" : "Star filter"}
              className="grid place-items-center w-8 h-8 rounded-md border border-border bg-surface-elevated hover:bg-surface-subtle cursor-pointer"
              title={data.starred ? "Remove from starred" : "Add to starred"}
            >
              <Icon name={data.starred ? "star-fill" : "star"} size={14} />
            </button>
          )}
          {data.permissions?.delete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete saved filter"
              className="grid place-items-center w-8 h-8 rounded-md border border-border bg-surface-elevated hover:bg-pri-highest hover:text-on-accent cursor-pointer"
            >
              <Icon name="trash" size={14} />
            </button>
          )}
        </div>
      </div>

      {results.length === 0 ? (
        <div className="text-center py-12 text-[13px] text-fg-subtle border border-dashed border-border rounded-lg">
          No work packages match this filter.
        </div>
      ) : (
        <div className="bg-surface-elevated border border-border rounded-lg overflow-hidden">
          {results.map((wp) => {
            const assignee = PEOPLE[wp.assignee];
            return (
              <Link
                key={wp.id}
                href={
                  projectId
                    ? `/projects/${projectId}/board?wp=${wp.nativeId}`
                    : `?wp=${wp.nativeId}`
                }
                className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[80px_minmax(0,1fr)_120px_28px_70px] items-start sm:items-center gap-2 sm:gap-3 px-3 py-2 border-b border-border-soft last:border-b-0 hover:bg-surface-subtle no-underline"
              >
                <span className="text-[11px] font-mono text-fg-subtle col-start-1 row-start-1 sm:col-auto sm:row-auto">{wp.key}</span>
                <span className="text-[13px] text-fg truncate col-start-1 row-start-2 sm:col-auto sm:row-auto">{wp.title || "(untitled)"}</span>
                <span className="col-start-2 row-start-1 sm:col-auto sm:row-auto">
                  <TaskStatusPill task={wp} />
                </span>
                <span className="col-start-2 row-start-2 sm:col-auto sm:row-auto justify-self-end sm:justify-self-auto">
                  <Avatar user={assignee} size="sm" />
                </span>
                <span className="hidden sm:inline text-right font-mono text-xs tabular-nums text-fg-muted">
                  {formatEstimate(wp, { mode: estimateMode }) ?? "—"}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
