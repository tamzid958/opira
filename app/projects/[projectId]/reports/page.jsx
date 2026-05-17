"use client";

import { use } from "react";
import { Reports } from "@/components/reports";
import { Icon } from "@/components/icons";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { Menu } from "@/components/ui/menu";
import { useState } from "react";
import {
  useApiStatus,
  useSprints,
  useTasks,
} from "@/lib/hooks/use-openproject";
import { useUrlParams } from "@/lib/hooks/use-modal-url";
import { useQueriesSettled } from "@/lib/hooks/use-queries-settled";
import { useSetPageTasks } from "@/lib/contexts/tasks-context";
import { pickSprintByDate } from "@/lib/hooks/use-active-sprint";

export default function ReportsPage({ params: paramsPromise }) {
  const { projectId } = use(paramsPromise);
  const { params: urlParams, setParams } = useUrlParams();
  const sprintFilter = urlParams.get("s") || null;

  const status = useApiStatus();
  const configured = status.data?.configured === true;
  const sprintsQ = useSprints(projectId, configured && !!projectId);
  const tasksQ = useTasks(projectId, null, configured && !!projectId);

  const sprintsList = sprintsQ.data || [];
  const activeSprint = (() => {
    if (sprintFilter && sprintFilter !== "all") {
      const match = sprintsList.find((s) => s.id === sprintFilter);
      if (match) return match;
    }
    return pickSprintByDate(sprintsList);
  })();

  const allTasks = tasksQ.data || [];
  useSetPageTasks(allTasks);

  const [sprintMenu, setSprintMenu] = useState(null);

  // Reports infers an active sprint from the sprints list and filters
  // tasks against it. If tasks resolves before sprints, the "no active
  // sprint" empty state flashes for a tick — gate on both.
  const { ready: pageReady, error: pageError } = useQueriesSettled(
    tasksQ,
    sprintsQ,
  );

  if (!pageReady) return <PageSkeleton title="Reports" />;

  if (pageError) {
    return (
      <>
        <div className="bg-surface-elevated border-b border-border px-3 sm:px-6 pt-3.5 pb-3 shrink-0">
          <h1 className="font-display text-[24px] font-semibold tracking-[-0.022em] text-fg m-0">
            Reports
          </h1>
        </div>
        <div className="flex-1 p-6 text-pri-highest">
          {String(pageError.message)}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="bg-surface-elevated border-b border-border px-3 sm:px-6 pt-3.5 pb-3 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-display text-[24px] font-semibold tracking-[-0.022em] text-fg m-0">
            Reports
          </h1>
          <div className="ml-auto">
            <button
              type="button"
              onClick={(e) =>
                setSprintMenu({ rect: e.currentTarget.getBoundingClientRect() })
              }
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-surface-elevated text-[13px] font-medium text-fg hover:bg-surface-subtle hover:border-border-strong transition-colors"
            >
              <Icon name="sprint" size={13} aria-hidden="true" />
              <span className="truncate max-w-40">
                {activeSprint?.name?.split(" — ")[0] || "Pick a sprint"}
              </span>
              <Icon name="chev-down" size={12} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {sprintMenu && (
        <Menu
          anchorRect={sprintMenu.rect}
          onClose={() => setSprintMenu(null)}
          onSelect={(it) => setParams({ s: it.value === "auto" ? null : it.value })}
          items={[
            { label: "Auto (active sprint)", value: "auto", active: !sprintFilter },
            { divider: true },
            ...sprintsList.map((s) => ({
              label: s.name,
              value: s.id,
              active: sprintFilter === s.id,
            })),
          ]}
        />
      )}

      <div className="flex-1 px-3 sm:px-6 py-3 sm:py-4 overflow-auto">
        {!activeSprint ? (
          <div className="p-10 text-center text-fg-muted">
            Reports require an active sprint.
          </div>
        ) : (
          <Reports
            sprint={activeSprint}
            tasks={allTasks}
            sprints={sprintsList}
            projectId={projectId}
          />
        )}
      </div>
    </>
  );
}
