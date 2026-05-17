"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { LoadingPill } from "@/components/ui/loading-pill";
import {
  useApiStatus,
  useProjects,
  useSprints,
  useTasks,
} from "@/lib/hooks/use-openproject";
import { useMe } from "@/lib/hooks/use-openproject-detail";
import { useUrlParams } from "@/lib/hooks/use-modal-url";
import { useQueriesSettled } from "@/lib/hooks/use-queries-settled";
import { useSetPageTasks } from "@/lib/contexts/tasks-context";
import { pickSprintByDate } from "@/lib/hooks/use-active-sprint";

export default function OverviewPage({ params: paramsPromise }) {
  const { projectId } = use(paramsPromise);
  const router = useRouter();
  const { setParams, params } = useUrlParams();
  const activeTab = params.get("tab") === "overview" ? "overview" : "my-work";

  const status = useApiStatus();
  const configured = status.data?.configured === true;
  const projectsQ = useProjects(configured);
  const tasksQ = useTasks(projectId, null, configured && !!projectId);
  const sprintsQ = useSprints(projectId, configured && !!projectId);
  const me = useMe();

  const project = projectsQ.data?.find((p) => p.id === projectId) || null;
  const activeSprint = pickSprintByDate(sprintsQ.data || []);
  const tasks = tasksQ.data || [];
  useSetPageTasks(tasks);

  // Wait for projects + tasks + sprints + me before rendering: the
  // dashboard hero, active-sprint band, and "your work" rail all read
  // from a different one of these and would otherwise reshuffle as each
  // lands.
  const { ready: pageReady, error: pageError } = useQueriesSettled(
    projectsQ,
    tasksQ,
    sprintsQ,
    me,
  );

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-6 pt-0 pb-6">
      {!pageReady ? (
        <div className="grid place-items-center min-h-[60vh]">
          <LoadingPill label="loading overview" />
        </div>
      ) : pageError ? (
        <div className="p-6 text-pri-highest">{String(pageError.message)}</div>
      ) : (
        <Dashboard
          currentUser={me.data?.user || null}
          project={project}
          activeSprint={activeSprint}
          sprints={sprintsQ.data || []}
          tasks={tasks}
          activeTab={activeTab}
          onTabChange={(tab) => setParams({ tab })}
          onTaskClick={(id) => setParams({ wp: id })}
          onChangeView={(view) => router.push(`/projects/${projectId}/${view}`)}
        />
      )}
    </div>
  );
}
