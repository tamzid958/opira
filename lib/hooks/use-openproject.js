"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api-client";
import {
  createTaskAction,
  deleteTaskAction,
  updateTaskAction,
} from "@/app/actions/work-packages";
import { enqueueOfflineMutation, isOnline } from "@/lib/offline/queue";

// Server Actions return `{ ok, data?, error?, code?, status? }`. This helper
// turns a failure into the same Error shape `fetchJson` throws so existing
// `onError` handlers (and `friendlyError`) keep working.
async function runAction(actionFn, input, fallback) {
  let res;
  try {
    res = await actionFn(input);
  } catch (e) {
    // Action call itself rejected — only true transport failures land here
    // (offline, server unreachable, RSC stream aborted). Tag as NETWORK_FAIL
    // so the offline queue captures and replays later.
    const err = new Error(e?.message || fallback || "Request failed");
    err.code = "NETWORK_FAIL";
    err.status = 0;
    throw err;
  }
  if (res?.ok) return res.data;
  // Structured failure from the action — preserve `code`/`status` so callers
  // can distinguish 4xx/5xx from a true network outage. Must not fall back
  // into the NETWORK_FAIL path: a null `code` here means OpenProject didn't
  // map this status to one of our known codes, NOT that the network failed.
  const err = new Error(res?.error || fallback || "Request failed");
  err.code = res?.code || null;
  err.status = res?.status || 500;
  throw err;
}

export function useApiStatus() {
  return useQuery({
    queryKey: ["op", "status"],
    queryFn: () => fetchJson("/api/openproject/status"),
    staleTime: Infinity,
  });
}

const stdOpts = (enabled) => ({
  enabled: !!enabled,
  staleTime: 30_000,
});

// Per-mount opts for high-churn collections (tasks, sprints): refetch when
// the user tabs back so stale OP changes flow in without a manual reload.
const liveOpts = (enabled) => ({
  enabled: !!enabled,
  staleTime: 15_000,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
});

export function useProjects(enabled) {
  return useQuery({
    queryKey: ["op", "projects"],
    queryFn: () => fetchJson("/api/openproject/projects"),
    ...stdOpts(enabled),
  });
}

export function useUsers(enabled) {
  return useQuery({
    queryKey: ["op", "users"],
    queryFn: () => fetchJson("/api/openproject/users"),
    ...stdOpts(enabled),
  });
}

// Single-user fetch for the in-app profile page that `<mention>` links
// resolve to. Skips when no id (avoids 404 on the `/users/[id]` route
// transition).
export function useUser(id) {
  return useQuery({
    queryKey: ["op", "user", String(id || "")],
    queryFn: () =>
      fetchJson(`/api/openproject/users/${encodeURIComponent(id)}`),
    ...stdOpts(!!id),
  });
}

export function useStatuses(enabled) {
  return useQuery({
    queryKey: ["op", "statuses"],
    queryFn: () => fetchJson("/api/openproject/statuses"),
    ...stdOpts(enabled),
  });
}

// `projectId` is optional — when provided, returns the WP types enabled for
// that project. When omitted (or empty), returns the global type list.
export function useTypes(projectIdOrEnabled, enabledArg) {
  const projectId =
    typeof projectIdOrEnabled === "string" ? projectIdOrEnabled : null;
  const enabled =
    typeof projectIdOrEnabled === "boolean" ? projectIdOrEnabled : enabledArg ?? true;
  const url = projectId
    ? `/api/openproject/types?project=${encodeURIComponent(projectId)}`
    : "/api/openproject/types";
  return useQuery({
    queryKey: ["op", "types", projectId || "global"],
    queryFn: () => fetchJson(url),
    ...stdOpts(enabled),
  });
}

export function usePriorities(enabled) {
  return useQuery({
    queryKey: ["op", "priorities"],
    queryFn: () => fetchJson("/api/openproject/priorities"),
    ...stdOpts(enabled),
  });
}

export function useSprints(projectId, enabled) {
  return useQuery({
    queryKey: ["op", "sprints", projectId],
    queryFn: () =>
      fetchJson(
        `/api/openproject/sprints${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`,
      ),
    ...liveOpts(enabled),
  });
}

// `sprintId` is optional. When provided ("all" | "backlog" | a sprint id),
// the work-package fetch is scoped server-side via the route's ?sprint=
// param. The cache key includes the sprint dimension so switching sprints
// doesn't poison a previously-cached pool.
export function useTasks(projectId, sprintId, enabled) {
  // Back-compat: useTasks(projectId, enabled) — second arg was bool.
  let sid = sprintId;
  let en = enabled;
  if (typeof sprintId === "boolean") {
    en = sprintId;
    sid = null;
  }
  const sprintKey = sid || "all";
  return useQuery({
    queryKey: ["op", "tasks", projectId, sprintKey],
    queryFn: () => {
      const params = new URLSearchParams();
      if (projectId) params.set("project", projectId);
      if (sid && sid !== "all") params.set("sprint", sid);
      const qs = params.toString();
      return fetchJson(`/api/openproject/tasks${qs ? `?${qs}` : ""}`);
    },
    ...liveOpts(en),
  });
}

// Cross-resource invalidation: any work-package mutation can change the
// per-WP detail cache, sub-task children, project-wide sprint counts,
// burndown / velocity reports, and the open-counts sidebar.
//
// We deliberately DO NOT invalidate the tasks list here. The optimistic
// patch in onMutate plus the server-response merge in onSuccess already
// keep that cache up to date — re-fetching it can briefly snap a freshly
// dragged card back to its old column when OP's GET hits an
// eventually-consistent replica that doesn't yet see the PATCH.
function invalidateAfterWpChange(qc, projectId, wpId) {
  if (projectId) {
    qc.invalidateQueries({ queryKey: ["op", "burndown", projectId] });
    qc.invalidateQueries({ queryKey: ["op", "velocity", projectId] });
  }
  qc.invalidateQueries({ queryKey: ["op", "open-counts"] });
  qc.invalidateQueries({ queryKey: ["op", "sprints"] });
  if (wpId) {
    qc.invalidateQueries({ queryKey: ["op", "wp", wpId] });
    // Children of any WP whose parent could've changed; safest is to nuke
    // every cached children list. The detail modal repopulates on demand.
    qc.invalidateQueries({
      queryKey: ["op", "wp"],
      predicate: (q) => q.queryKey[2] === "children" || q.queryKey[3] === "children",
    });
  }
}

// `projectId` scopes optimistic writes to the current project's cache so a
// mid-flight project switch can't bleed state into the wrong project. When
// undefined, falls back to the legacy wildcard for back-compat.
export function useUpdateTask(projectId) {
  const qc = useQueryClient();
  const scope = projectId ? ["op", "tasks", projectId] : ["op", "tasks"];
  return useMutation({
    mutationFn: async ({ id, patch }) => {
      // Offline-first path: when there's no network the optimistic update
      // already moved the card; persist the intent and resolve so the UI
      // doesn't toast an error. The runner will replay when we reconnect.
      if (!isOnline()) {
        await enqueueOfflineMutation({
          kind: "task.update",
          payload: { id, patch, projectId },
        });
        return { id, ...patch };
      }
      try {
        return await runAction(
          updateTaskAction,
          { id, patch, projectId },
          "Couldn't save changes",
        );
      } catch (e) {
        if (e.code === "NETWORK_FAIL") {
          await enqueueOfflineMutation({
            kind: "task.update",
            payload: { id, patch, projectId },
          });
          return { id, ...patch };
        }
        throw e;
      }
    },
    onMutate: async ({ id, patch }) => {
      // Cancel in-flight tasks refetches so a slow GET that started before
      // this drag-drop can't land *after* our optimistic write and snap the
      // card back to its old column.
      await qc.cancelQueries({ queryKey: scope });
      const prev = qc.getQueriesData({ queryKey: scope });
      for (const [key, data] of prev) {
        if (Array.isArray(data)) {
          qc.setQueryData(
            key,
            data.map((t) => (t.id === id ? { ...t, ...patch } : t)),
          );
        }
      }
      return { prev };
    },
    onSuccess: (server, vars) => {
      if (!server || typeof server !== "object") return;
      const id = vars.id;
      const all = qc.getQueriesData({ queryKey: scope });
      for (const [key, data] of all) {
        if (Array.isArray(data)) {
          qc.setQueryData(
            key,
            data.map((t) => (t.id === id ? { ...t, ...server } : t)),
          );
        }
      }
      qc.setQueryData(["op", "wp", server.nativeId ?? id], server);
    },
    onError: (_err, _vars, ctx) => {
      for (const [key, data] of ctx?.prev || []) qc.setQueryData(key, data);
    },
    onSettled: (_data, _err, vars) => {
      invalidateAfterWpChange(qc, projectId, vars?.id);
    },
  });
}

// Stable id factory for optimistic temp records.
let __tmpCounter = 0;
const tmpId = () => `tmp-${Date.now()}-${++__tmpCounter}`;

// Delete a single work package by id. Optimistic + rollback so the row
// vanishes instantly across every cached tasks list.
export function useDeleteTask(projectId) {
  const qc = useQueryClient();
  const scope = projectId ? ["op", "tasks", projectId] : ["op", "tasks"];
  return useMutation({
    mutationFn: async (id) => {
      if (!isOnline()) {
        await enqueueOfflineMutation({
          kind: "task.delete",
          payload: { id, projectId },
        });
        return null;
      }
      try {
        return await runAction(
          deleteTaskAction,
          { id, projectId },
          "Couldn't delete this issue",
        );
      } catch (e) {
        if (e.code === "NETWORK_FAIL") {
          await enqueueOfflineMutation({
            kind: "task.delete",
            payload: { id, projectId },
          });
          return null;
        }
        throw e;
      }
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: scope });
      const prev = qc.getQueriesData({ queryKey: scope });
      for (const [key, data] of prev) {
        if (Array.isArray(data)) {
          qc.setQueryData(
            key,
            data.filter((t) => t.id !== id),
          );
        }
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      for (const [key, data] of ctx?.prev || []) qc.setQueryData(key, data);
    },
    onSettled: (_data, _err, id) => {
      invalidateAfterWpChange(qc, projectId, id);
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      // Creating offline is risky — we'd need to assign a temp id that
      // OpenProject won't recognise on replay. The optimistic card stays
      // visible (added in onMutate) but on replay we just drop the
      // payload as-is into OP, which mints the canonical id. The temp
      // record is reconciled when the tasks list next refetches.
      if (!isOnline()) {
        await enqueueOfflineMutation({ kind: "task.create", payload: data });
        return null;
      }
      try {
        return await runAction(createTaskAction, data, "Couldn't create issue");
      } catch (e) {
        if (e.code === "NETWORK_FAIL") {
          await enqueueOfflineMutation({ kind: "task.create", payload: data });
          return null;
        }
        throw e;
      }
    },
    onMutate: async (vars) => {
      // Pre-pend a temp record so the new card shows up instantly. Tasks
      // are now keyed by (projectId, sprintId) — write into every variant
      // under the project so the new card is visible regardless of which
      // sprint scope the active list is using.
      await qc.cancelQueries({ queryKey: ["op", "tasks", vars.projectId] });
      const id = tmpId();
      const optimistic = {
        id,
        nativeId: id,
        key: "…",
        title: vars.title,
        description: vars.description || "",
        type: vars.type || "task",
        status: "todo",
        statusId: vars.statusId || null,
        statusName: null,
        priority: vars.priority || "medium",
        priorityId: vars.priorityId || null,
        priorityName: null,
        assignee: vars.assignee || null,
        assigneeName: null,
        sprint: vars.sprint || null,
        labels: [],
        points: null,
        comments: 0,
        attachments: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        permissions: { update: true },
        _optimistic: true,
      };
      const scope = ["op", "tasks", vars.projectId];
      const prev = qc.getQueriesData({ queryKey: scope });
      for (const [key, data] of prev) {
        if (Array.isArray(data)) {
          qc.setQueryData(key, [optimistic, ...data]);
        }
      }
      return { prev, tempId: id, projectId: vars.projectId };
    },
    onError: (_err, _vars, ctx) => {
      for (const [key, data] of ctx?.prev || []) qc.setQueryData(key, data);
    },
    onSuccess: (created, vars, ctx) => {
      // Replace the temp record with the canonical one in every variant.
      const scope = ["op", "tasks", vars.projectId];
      const all = qc.getQueriesData({ queryKey: scope });
      for (const [key, data] of all) {
        if (Array.isArray(data)) {
          qc.setQueryData(
            key,
            data.map((t) => (t.id === ctx?.tempId ? created : t)),
          );
        }
      }
    },
    onSettled: (_data, _err, vars) => {
      // Invalidate the tasks list so the canonical server-mapped record
      // (with correct status/type/priority names) replaces the optimistic
      // card. Unlike updates, creates have no snap-back risk because the
      // canonical record is already in the list from onSuccess.
      if (vars?.projectId) {
        qc.invalidateQueries({ queryKey: ["op", "tasks", vars.projectId] });
      }
      invalidateAfterWpChange(qc, vars.projectId);
    },
  });
}

// ── Time tracking — global ───────────────────────────────────────────────

export function useTimeEntryActivities(enabled = true) {
  return useQuery({
    queryKey: ["op", "time-entry-activities"],
    queryFn: () => fetchJson("/api/openproject/time-entry-activities"),
    ...stdOpts(enabled),
    staleTime: 5 * 60_000,
  });
}

export function useTimeEntryAvailableProjects(enabled = true) {
  return useQuery({
    queryKey: ["op", "time-entries", "available-projects"],
    queryFn: () => fetchJson("/api/openproject/time-entries/available-projects"),
    ...stdOpts(enabled),
    staleTime: 5 * 60_000,
  });
}

// ── Categories CRUD ─────────────────────────────────────────────────────
// Read hook lives in use-openproject-detail.js as useCategories(projectId).
// Mutations here share its `["op", "categories", projectId]` cache key.

export function useCreateCategory(projectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      fetchJson(`/api/openproject/projects/${encodeURIComponent(projectId)}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["op", "categories", projectId] }),
  });
}

export function useUpdateCategory(projectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }) =>
      fetchJson(`/api/openproject/categories/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["op", "categories", projectId] }),
  });
}

export function useDeleteCategory(projectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      fetchJson(`/api/openproject/categories/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onMutate: async (id) => {
      const key = ["op", "categories", projectId];
      const prev = qc.getQueryData(key);
      if (Array.isArray(prev)) {
        qc.setQueryData(key, prev.filter((c) => c.id !== String(id)));
      }
      return { prev, key };
    },
    onError: (_e, _id, ctx) => ctx?.prev && qc.setQueryData(ctx.key, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ["op", "categories", projectId] }),
  });
}

// ── Baseline comparisons ────────────────────────────────────────────────

export function useScopeChanges({ projectId, sprintId, since } = {}, enabled = true) {
  const usp = new URLSearchParams();
  if (since) usp.set("since", since);
  if (sprintId) usp.set("sprintId", sprintId);
  return useQuery({
    queryKey: ["op", "scope-changes", projectId || null, sprintId || null, since || null],
    queryFn: () =>
      fetchJson(
        `/api/openproject/projects/${encodeURIComponent(projectId)}/scope-changes?${usp.toString()}`,
      ),
    ...stdOpts(enabled && !!projectId && !!since),
  });
}

// ── Programs & Portfolios ───────────────────────────────────────────────

export function usePrograms(enabled = true) {
  return useQuery({
    queryKey: ["op", "programs"],
    queryFn: () => fetchJson("/api/openproject/programs"),
    ...stdOpts(enabled),
  });
}
export function useProgram(id, enabled = true) {
  return useQuery({
    queryKey: ["op", "program", id],
    queryFn: () => fetchJson(`/api/openproject/programs/${encodeURIComponent(id)}`),
    ...stdOpts(enabled && !!id),
  });
}
export function usePortfolios(enabled = true) {
  return useQuery({
    queryKey: ["op", "portfolios"],
    queryFn: () => fetchJson("/api/openproject/portfolios"),
    ...stdOpts(enabled),
  });
}
export function usePortfolio(id, enabled = true) {
  return useQuery({
    queryKey: ["op", "portfolio", id],
    queryFn: () => fetchJson(`/api/openproject/portfolios/${encodeURIComponent(id)}`),
    ...stdOpts(enabled && !!id),
  });
}

// ── Working hours / non-working times ───────────────────────────────────

export function useWorkingHours(userId, enabled = true) {
  return useQuery({
    queryKey: ["op", "working-hours", userId],
    queryFn: () =>
      fetchJson(`/api/openproject/users/${encodeURIComponent(userId)}/working-hours`),
    ...stdOpts(enabled && !!userId),
    staleTime: 5 * 60_000,
  });
}

export function useNonWorkingTimes(userId, enabled = true) {
  return useQuery({
    queryKey: ["op", "non-working-times", userId],
    queryFn: () =>
      fetchJson(`/api/openproject/users/${encodeURIComponent(userId)}/non-working-times`),
    ...stdOpts(enabled && !!userId),
    staleTime: 5 * 60_000,
  });
}

export function useAddNonWorkingTime(userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      fetchJson(`/api/openproject/users/${encodeURIComponent(userId)}/non-working-times`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["op", "non-working-times", userId] }),
  });
}

export function useDeleteNonWorkingTime(userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ntId) =>
      fetchJson(
        `/api/openproject/users/${encodeURIComponent(userId)}/non-working-times/${encodeURIComponent(ntId)}`,
        { method: "DELETE" },
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: ["op", "non-working-times", userId] }),
  });
}

// ── Wiki pages ──────────────────────────────────────────────────────────

export function useWikiPage(id, enabled = true) {
  return useQuery({
    queryKey: ["op", "wiki-page", id],
    queryFn: () => fetchJson(`/api/openproject/wiki-pages/${encodeURIComponent(id)}`),
    ...stdOpts(enabled && !!id),
    staleTime: 60_000,
  });
}

// ── My Reminders (cross-WP) ──────────────────────────────────────────────

export function useMyReminders(enabled = true) {
  return useQuery({
    queryKey: ["op", "reminders", "mine"],
    queryFn: () => fetchJson("/api/openproject/reminders"),
    ...stdOpts(enabled),
  });
}

// ── Saved Queries ────────────────────────────────────────────────────────

export function useSavedQueries({ projectId, starredOnly } = {}, enabled = true) {
  const usp = new URLSearchParams();
  if (projectId) usp.set("projectId", projectId);
  if (starredOnly) usp.set("starredOnly", "1");
  const qs = usp.toString();
  return useQuery({
    queryKey: ["op", "queries", projectId || null, !!starredOnly],
    queryFn: () => fetchJson(`/api/openproject/queries${qs ? `?${qs}` : ""}`),
    ...stdOpts(enabled),
  });
}

export function useSavedQuery(id, { execute = false } = {}, enabled = true) {
  return useQuery({
    queryKey: ["op", "queries", "one", id, execute],
    queryFn: () =>
      fetchJson(`/api/openproject/queries/${encodeURIComponent(id)}${execute ? "?execute=1" : ""}`),
    ...stdOpts(enabled && !!id),
  });
}

// Optimistic star toggle. On success the server re-emits the canonical
// query record; we only restore on error.
export function useToggleQueryStar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, starred }) =>
      fetchJson(`/api/openproject/queries/${encodeURIComponent(id)}/star`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starred }),
      }),
    onMutate: async ({ id, starred }) => {
      const all = qc.getQueriesData({ queryKey: ["op", "queries"] });
      const snapshots = [];
      for (const [key, data] of all) {
        if (Array.isArray(data)) {
          snapshots.push([key, data]);
          qc.setQueryData(
            key,
            data.map((q) => (q.id === String(id) ? { ...q, starred } : q)),
          );
        }
      }
      return { snapshots };
    },
    onError: (_e, _v, ctx) => {
      for (const [k, v] of ctx?.snapshots || []) qc.setQueryData(k, v);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["op", "queries"] }),
  });
}

export function useDeleteQuery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      fetchJson(`/api/openproject/queries/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["op", "queries"] }),
  });
}

export function useCreateQuery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      fetchJson("/api/openproject/queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["op", "queries"] }),
  });
}

// Global "Log time" mutation — POSTs the top-level /time_entries route. The
// per-WP create hook in use-openproject-detail.js stays as-is for the task
// detail panel; this one is for the sidebar-launched modal where the WP is
// picked inside the form.
export function useLogTime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      fetchJson("/api/openproject/time-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ["op", "time-entries", "mine"] });
      if (vars?.workPackageId) {
        qc.invalidateQueries({
          queryKey: ["op", "wp", String(vars.workPackageId), "time-entries"],
        });
        qc.invalidateQueries({ queryKey: ["op", "wp", String(vars.workPackageId)] });
      }
    },
  });
}
