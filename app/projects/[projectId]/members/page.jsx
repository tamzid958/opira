"use client";

import { use } from "react";
import { Members } from "@/components/members";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { useApiStatus, useProjects } from "@/lib/hooks/use-openproject";
import { useProjectMembers } from "@/lib/hooks/use-openproject-detail";
import { useQueriesSettled } from "@/lib/hooks/use-queries-settled";

export default function MembersPage({ params: paramsPromise }) {
  const { projectId } = use(paramsPromise);
  const status = useApiStatus();
  const configured = status.data?.configured === true;
  const projectsQ = useProjects(configured);
  const membersQ = useProjectMembers(projectId, configured && !!projectId);
  const project = projectsQ.data?.find((p) => p.id === projectId) || null;

  // Hold the body until both projects (for the project name in the hero)
  // and the membership list are settled — otherwise the chip strip
  // ("All N / Member M") flashes empty before counts arrive.
  const { ready: pageReady, error: pageError } = useQueriesSettled(
    projectsQ,
    membersQ,
  );

  if (!pageReady) return <PageSkeleton title="Members" />;

  return (
    <>
      <div className="bg-surface-elevated border-b border-border px-3 sm:px-6 pt-3.5 pb-3 shrink-0">
        <h1 className="font-display text-[24px] font-semibold tracking-[-0.022em] text-fg m-0">
          Members
        </h1>
      </div>
      <div className="flex-1 px-3 sm:px-6 py-3 sm:py-4 overflow-auto">
        {pageError ? (
          <div className="p-6 text-pri-highest">{String(pageError.message)}</div>
        ) : (
          <Members projectId={projectId} projectName={project?.name} />
        )}
      </div>
    </>
  );
}
