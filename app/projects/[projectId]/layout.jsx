"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { notFound, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Topbar } from "@/components/topbar";
import { Sidebar } from "@/components/sidebar";
import { TaskDetail } from "@/components/task-detail";
import { CreateTask } from "@/components/create-task";
import { CommandPalette } from "@/components/command-palette";
import {
  CenterError,
  CenterLoader,
  CenterNotConfigured,
  CenterStatus,
} from "@/components/ui/center-status";
import {
  useApiStatus,
  useCreateTask,
  usePriorities,
  useProjects,
  useSprints,
  useStatuses,
  useTasks,
  useTypes,
  useUpdateTask,
  useUsers,
} from "@/lib/hooks/use-openproject";
import {
  useAvailableAssignees,
  useCategories,
  useMe,
} from "@/lib/hooks/use-openproject-detail";
import { usePermission } from "@/lib/hooks/use-permissions";
import { PERM } from "@/lib/openproject/permission-keys";
import { resolveApiPatch } from "@/lib/openproject/resolve-patch";
import { useUrlParams } from "@/lib/hooks/use-modal-url";
import { syncPeople, syncProjects } from "@/lib/data";
import { friendlyError } from "@/lib/api-client";

// `[projectId]/layout.jsx` owns chrome and the modals that genuinely cross
// pages (TaskDetail via `?wp=`, CreateTask via `?create=1`, CommandPalette
// via Cmd+K). Page-level modals (sprint actions on Backlog, etc.) live in
// the page that triggers them — no shared state, no context.
export default function ProjectLayout({ children, params: paramsPromise }) {
  const params = use(paramsPromise);
  const projectId = params.projectId;
  const router = useRouter();
  const { params: urlParams, setParams } = useUrlParams();

  const wpId = urlParams.get("wp") || null;
  const createOpen = urlParams.get("create") === "1";
  const createDefaultSprint = urlParams.get("createSprint") || null;
  const createDefaultStatus = urlParams.get("createStatus") || null;

  const status = useApiStatus();
  const me = useMe();
  const configured = status.data?.configured === true;

  const projectsQ = useProjects(configured);
  const usersQ = useUsers(configured);
  const sprintsQ = useSprints(projectId, configured && !!projectId);
  const tasksQ = useTasks(projectId, configured && !!projectId);
  const statusesQ = useStatuses(configured);
  const typesQ = useTypes(projectId, configured && !!projectId);
  const prioritiesQ = usePriorities(configured);
  const categoriesQ = useCategories(projectId, configured && !!projectId);
  const assigneesQ = useAvailableAssignees(projectId, configured && !!projectId);

  const updateTaskMutation = useUpdateTask(projectId);
  const createTaskMutation = useCreateTask();
  const canCreateIssue = usePermission(projectId, PERM.ADD_WORK_PACKAGES);

  // Keep PROJECTS / PEOPLE module-level caches populated for components that
  // still read from them directly (Avatar, sidebar swatches, card author
  // labels). The torn-render risk is small in practice — both are written
  // here once per query update, before any nested page renders.
  useEffect(() => {
    if (projectsQ.data) syncProjects(projectsQ.data);
  }, [projectsQ.data]);
  useEffect(() => {
    if (usersQ.data) syncPeople(usersQ.data);
  }, [usersQ.data]);

  // Persist the "last project I looked at" so /projects can route back here
  // on next visit. Cleared by the picker if the project disappears.
  useEffect(() => {
    if (typeof window === "undefined" || !projectId) return;
    try {
      window.localStorage.setItem("op:current-project", projectId);
    } catch {
      // Ignore quota / privacy-mode errors.
    }
  }, [projectId]);

  const project = projectsQ.data?.find((p) => p.id === projectId) || null;
  const sprintsList = sprintsQ.data || [];
  const tasks = tasksQ.data || [];
  // Epics surface from the OpenProject hierarchy: any work package that
  // has children and isn't itself a child. Type names play no role.
  const epicsList = tasks
    .filter((t) => t.hasChildren && !t.epic)
    .map((t) => ({
      id: String(t.nativeId),
      nativeId: String(t.nativeId),
      key: t.key,
      title: t.title,
      name: t.title,
      color: "var(--accent)",
    }));
  const currentUser = me.data?.user || null;

  const updateTask = (id, patch) =>
    updateTaskMutation.mutate({
      id,
      patch: resolveApiPatch(patch, {
        statuses: statusesQ.data,
        priorities: prioritiesQ.data,
        types: typesQ.data,
      }),
    });

  const closeWp = useCallback(() => setParams({ wp: null }), [setParams]);
  const closeCreate = useCallback(
    () => setParams({ create: null, createSprint: null, createStatus: null }),
    [setParams],
  );

  const createIssue = (data) => {
    if (!projectId) {
      toast.error("Pick a project first");
      return;
    }
    const isExistingId = (list, value) =>
      Array.isArray(list) && list.some((x) => String(x.id) === String(value));
    const defaultId = (list) =>
      list?.find((x) => x.isDefault)?.id ?? list?.[0]?.id ?? null;
    // The CreateTask form sends OpenProject IDs for type/priority. When a
    // status ID isn't supplied (column-less create flow), fall back to the
    // OpenProject-configured default status — `isDefault` is API truth.
    createTaskMutation.mutate(
      {
        projectId,
        title: data.title,
        description: data.description,
        typeId: isExistingId(typesQ.data, data.type) ? data.type : defaultId(typesQ.data),
        statusId:
          data.status && isExistingId(statusesQ.data, data.status)
            ? data.status
            : defaultId(statusesQ.data),
        priorityId: isExistingId(prioritiesQ.data, data.priority)
          ? data.priority
          : defaultId(prioritiesQ.data),
        assignee: data.assignee,
        sprint: data.sprint,
        categoryIds: data.categoryIds,
      },
      {
        onSuccess: (created) => {
          toast.success(`Created ${created?.key || "issue"}`);
          closeCreate();
        },
        onError: (e) =>
          toast.error(friendlyError(e, "Couldn't create issue — please try again.")),
      },
    );
  };

  // Global keyboard shortcuts. The `g` prefix arms a one-shot follow-up
  // listener (g-then-b, g-then-d…) that auto-disarms after 1s. We track it
  // in refs so a repeat `g` (or unmount) cancels the previous arming.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const gPrefixHandlerRef = useRef(null);
  const gPrefixTimerRef = useRef(null);
  useEffect(() => {
    const disarmGPrefix = () => {
      if (gPrefixHandlerRef.current) {
        window.removeEventListener("keydown", gPrefixHandlerRef.current);
        gPrefixHandlerRef.current = null;
      }
      if (gPrefixTimerRef.current) {
        clearTimeout(gPrefixTimerRef.current);
        gPrefixTimerRef.current = null;
      }
    };
    const goView = (view) => router.push(`/projects/${projectId}/${view}`);
    const onKey = (e) => {
      const tag = e.target?.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable;
      const isCmd = e.metaKey || e.ctrlKey;
      if (e.key === "k" && isCmd) {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (inField) return;
      if (e.key === "c" && !isCmd) {
        e.preventDefault();
        setParams({ create: "1" });
      }
      if (e.key === "b" && !isCmd) {
        e.preventDefault();
        goView("board");
      }
      if (e.key === "g" && !isCmd) {
        disarmGPrefix();
        const handler = (e2) => {
          const t2 = e2.target?.tagName;
          if (t2 === "INPUT" || t2 === "TEXTAREA" || e2.target?.isContentEditable) {
            disarmGPrefix();
            return;
          }
          if (e2.key === "b") goView("backlog");
          else if (e2.key === "d") goView("overview");
          else if (e2.key === "r") goView("reports");
          else if (e2.key === "t") goView("timeline");
          disarmGPrefix();
        };
        gPrefixHandlerRef.current = handler;
        window.addEventListener("keydown", handler);
        gPrefixTimerRef.current = setTimeout(disarmGPrefix, 1000);
      }
      if (e.key === "Escape") {
        setPaletteOpen(false);
        if (wpId) closeWp();
        if (createOpen) closeCreate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      disarmGPrefix();
    };
  }, [projectId, router, setParams, wpId, createOpen, closeWp, closeCreate]);

  // ── Render gates ─────────────────────────────────────────────────────
  if (status.isLoading) return <CenterLoader label="Connecting…" />;
  if (!configured) return <CenterNotConfigured />;
  if (projectsQ.isLoading && !projectsQ.data) return <CenterLoader label="Loading projects…" />;
  if (projectsQ.error)
    return <CenterError title="Couldn't load projects" message={String(projectsQ.error.message)} />;
  if ((projectsQ.data || []).length === 0)
    return (
      <CenterStatus>
        <h2 className="font-display font-bold text-[18px] text-fg m-0 mb-2">No projects</h2>
        <p className="text-fg-muted m-0">
          Your OpenProject account doesn&apos;t have any visible projects.
        </p>
      </CenterStatus>
    );
  if (!project) {
    // Project id from URL is stale or unauthorised — render the segment's
    // not-found.jsx instead of silently redirecting.
    notFound();
  }

  return (
    <div
      data-app-shell
      className="grid grid-cols-[224px_minmax(0,1fr)] grid-rows-[48px_minmax(0,1fr)] h-screen w-screen overflow-hidden"
    >
      <Topbar
        canCreate={canCreateIssue}
        onCreate={() => setParams({ create: "1" })}
        onOpenWp={(id) => setParams({ wp: id })}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        currentUser={currentUser}
      />
      <div
        className="sidebar-overlay"
        data-open={sidebarOpen ? "true" : "false"}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      <Sidebar
        data-open={sidebarOpen ? "true" : "false"}
        currentProjectId={projectId}
        onSwitchProject={() => setSidebarOpen(false)}
        projects={projectsQ.data || []}
      />
      <div className="row-start-2 row-end-3 col-start-2 col-end-3 overflow-hidden flex flex-col bg-surface-app">
        {children}
      </div>

      {wpId && (
        <TaskDetail
          taskId={wpId}
          tasks={tasks}
          projectName={project?.name}
          projectId={projectId}
          currentUser={currentUser}
          categories={categoriesQ.data || []}
          statuses={statusesQ.data || []}
          priorities={prioritiesQ.data || []}
          types={typesQ.data || []}
          sprints={sprintsList}
          epics={epicsList}
          assignees={assigneesQ.data || []}
          onClose={closeWp}
          onUpdate={updateTask}
          onChange={(msg) => toast.success(msg)}
          onSelectTask={(id) => setParams({ wp: id })}
        />
      )}
      {createOpen && (
        <CreateTask
          onClose={closeCreate}
          onCreate={createIssue}
          projectName={project?.name}
          defaultSprint={createDefaultSprint}
          defaultStatus={createDefaultStatus}
          categories={categoriesQ.data || []}
          types={typesQ.data || []}
          priorities={prioritiesQ.data || []}
          sprints={sprintsList}
          epics={epicsList}
          assignees={assigneesQ.data || []}
          tasks={tasks}
          currentUser={currentUser}
        />
      )}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenWp={(id) => setParams({ wp: id })}
        onSwitchProject={(id) => router.push(`/projects/${id}/board`)}
      />
    </div>
  );
}
