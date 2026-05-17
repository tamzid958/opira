"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { Tags } from "@/components/tags";
import { LoadingPill } from "@/components/ui/loading-pill";
import { useApiStatus, useProjects, useTasks } from "@/lib/hooks/use-openproject";
import { useQueriesSettled } from "@/lib/hooks/use-queries-settled";
import { useSetPageTasks } from "@/lib/contexts/tasks-context";

export default function TagsPage({ params: paramsPromise }) {
  const { projectId } = use(paramsPromise);
  const router = useRouter();

  const status = useApiStatus();
  const configured = status.data?.configured === true;
  const projectsQ = useProjects(configured);
  const tasksQ = useTasks(projectId, null, configured && !!projectId);
  const project = projectsQ.data?.find((p) => p.id === projectId) || null;
  const tasks = tasksQ.data || [];
  useSetPageTasks(tasks);

  const { ready: pageReady, error: pageError } = useQueriesSettled(
    tasksQ,
    projectsQ,
  );

  return (
    <>
      <div className="bg-surface-elevated border-b border-border px-3 sm:px-6 pt-3.5 pb-3 shrink-0">
        <h1 className="font-display text-[24px] font-semibold tracking-[-0.022em] text-fg m-0">
          Tags
        </h1>
      </div>
      <div className="flex-1 px-3 sm:px-6 py-3 sm:py-4 overflow-auto">
        {!pageReady ? (
          <div className="grid place-items-center min-h-[40vh]">
            <LoadingPill label="loading tags" />
          </div>
        ) : pageError ? (
          <div className="p-6 text-pri-highest">{String(pageError.message)}</div>
        ) : (
          <Tags
            projectId={projectId}
            projectName={project?.name}
            tasks={tasks}
            onFilter={(name) =>
              router.push(
                `/projects/${projectId}/backlog?label=${encodeURIComponent(name)}`,
              )
            }
          />
        )}
      </div>
    </>
  );
}
