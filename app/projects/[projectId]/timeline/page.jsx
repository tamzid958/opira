"use client";

import { use } from "react";
import { Timeline } from "@/components/timeline";
import { LoadingPill } from "@/components/ui/loading-pill";
import {
  useApiStatus,
  useSprints,
  useTasks,
} from "@/lib/hooks/use-openproject";
import { useAvailableAssignees } from "@/lib/hooks/use-openproject-detail";
import { useUrlParams } from "@/lib/hooks/use-modal-url";
import { useQueriesSettled } from "@/lib/hooks/use-queries-settled";
import { useSetPageTasks } from "@/lib/contexts/tasks-context";

export default function TimelinePage({ params: paramsPromise }) {
  const { projectId } = use(paramsPromise);
  const { setParams } = useUrlParams();

  const status = useApiStatus();
  const configured = status.data?.configured === true;
  const tasksQ = useTasks(projectId, null, configured && !!projectId);
  const sprintsQ = useSprints(projectId, configured && !!projectId);
  const assigneesQ = useAvailableAssignees(projectId, configured && !!projectId);

  // Sprints overlay drives the lane background and assignees populate the
  // row avatars — wait for both before painting so the chart doesn't
  // re-layout once they arrive.
  const tasks = tasksQ.data || [];
  useSetPageTasks(tasks);

  const { ready: pageReady, error: pageError } = useQueriesSettled(
    tasksQ,
    sprintsQ,
    assigneesQ,
  );

  return (
    <>
      <div className="bg-surface-elevated border-b border-border px-3 sm:px-6 pt-3.5 pb-3 shrink-0">
        <h1 className="font-display text-[24px] font-semibold tracking-[-0.022em] text-fg m-0">
          Timeline
        </h1>
      </div>
      <div className="flex-1 px-3 sm:px-6 py-3 sm:py-4 overflow-auto">
        {!pageReady ? (
          <div className="grid place-items-center min-h-[40vh]">
            <LoadingPill label="loading timeline" />
          </div>
        ) : pageError ? (
          <div className="p-6 text-pri-highest">{String(pageError.message)}</div>
        ) : (
          <Timeline
            tasks={tasks}
            sprints={sprintsQ.data || []}
            assignees={assigneesQ.data || []}
            isLoading={false}
            onTaskClick={(id) => setParams({ wp: id })}
          />
        )}
      </div>
    </>
  );
}
