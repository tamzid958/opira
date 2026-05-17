"use client";

import { use } from "react";
import { Documents } from "@/components/documents";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { useApiStatus, useProjects } from "@/lib/hooks/use-openproject";
import { useProjectDocuments } from "@/lib/hooks/use-openproject-detail";
import { useQueriesSettled } from "@/lib/hooks/use-queries-settled";

export default function DocumentsPage({ params: paramsPromise }) {
  const { projectId } = use(paramsPromise);
  const status = useApiStatus();
  const configured = status.data?.configured === true;
  const projectsQ = useProjects(configured);
  const documentsQ = useProjectDocuments(projectId, configured && !!projectId);
  const project = projectsQ.data?.find((p) => p.id === projectId) || null;

  const { ready: pageReady, error: pageError } = useQueriesSettled(
    projectsQ,
    documentsQ,
  );

  if (!pageReady) return <PageSkeleton title="Documents" />;

  return (
    <>
      <div className="bg-surface-elevated border-b border-border px-3 sm:px-6 pt-3.5 pb-3 shrink-0">
        <h1 className="font-display text-[24px] font-semibold tracking-[-0.022em] text-fg m-0">
          Documents
        </h1>
      </div>
      <div className="flex-1 px-3 sm:px-6 py-3 sm:py-4 overflow-auto">
        {pageError ? (
          <div className="p-6 text-pri-highest">{String(pageError.message)}</div>
        ) : (
          <Documents projectId={projectId} projectName={project?.name} />
        )}
      </div>
    </>
  );
}
