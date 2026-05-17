"use client";

import { use } from "react";
import { Milestones } from "@/components/milestones";
import { LoadingPill } from "@/components/ui/loading-pill";
import { useApiStatus, useSprints, useTasks } from "@/lib/hooks/use-openproject";
import { useUrlParams } from "@/lib/hooks/use-modal-url";
import { useQueriesSettled } from "@/lib/hooks/use-queries-settled";
import { useSetPageTasks } from "@/lib/contexts/tasks-context";

export default function MilestonesPage({ params: paramsPromise }) {
  const { projectId } = use(paramsPromise);
  const { setParams } = useUrlParams();

  const status = useApiStatus();
  const configured = status.data?.configured === true;
  const tasksQ = useTasks(projectId, null, configured && !!projectId);
  const sprintsQ = useSprints(projectId, configured && !!projectId);

  const tasks = tasksQ.data || [];
  useSetPageTasks(tasks);

  const { ready: pageReady, error: pageError } = useQueriesSettled(tasksQ, sprintsQ);

  return (
    <>
      <div className="bg-surface-elevated border-b border-border px-3 sm:px-6 pt-3.5 pb-3 shrink-0">
        <h1 className="font-display text-[24px] font-semibold tracking-[-0.022em] text-fg m-0">
          Milestones
        </h1>
      </div>
      <div className="flex-1 px-3 sm:px-6 py-3 sm:py-4 overflow-auto">
        {!pageReady ? (
          <div className="grid place-items-center min-h-[40vh]">
            <LoadingPill label="loading milestones" />
          </div>
        ) : pageError ? (
          <div className="p-6 text-pri-highest">{String(pageError.message)}</div>
        ) : (
          <Milestones
            tasks={tasks}
            sprints={sprintsQ.data || []}
            onTaskClick={(id) => setParams({ wp: id })}
          />
        )}
      </div>
    </>
  );
}
