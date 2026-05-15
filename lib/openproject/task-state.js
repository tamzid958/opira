// API-truth helpers for asking questions about a task's state.
//
// OpenProject is the source of truth for whether a status is closed, what a
// priority's relative weight is, etc. Components should never compare task
// state against keyword-derived bucket strings ("done", "high", "epic"); they
// should ask one of these helpers, passing the live `/statuses`, `/priorities`
// list (already cached via `useStatuses` / `usePriorities`).

export function buildClosedStatusIdSet(statuses) {
  const set = new Set();
  for (const s of statuses || []) {
    if (s?.isClosed) set.add(String(s.id));
  }
  return set;
}

export function isStatusClosed(statusId, statuses) {
  if (statusId == null) return false;
  for (const s of statuses || []) {
    if (String(s?.id) === String(statusId)) return !!s.isClosed;
  }
  return false;
}

export function isTaskClosed(task, statuses) {
  return isStatusClosed(task?.statusId, statuses);
}

// Returns the completion ratio [0, 1] for a task based on its status's
// defaultDoneRatio. Falls back to isClosed boolean if no ratio is set.
export function ratioOf(task) {
  if (task?.statusDefaultDoneRatio != null) return task.statusDefaultDoneRatio / 100;
  return task?.statusIsClosed ? 1 : 0;
}

// Ordering: lower `position` = higher rank (matches OpenProject UI). Returns
// `Infinity` when the priority is unknown so unranked items sort to the end.
export function priorityRank(task, priorities) {
  const id = task?.priorityId;
  if (id == null) return Infinity;
  for (const p of priorities || []) {
    if (String(p?.id) === String(id)) {
      return typeof p.position === "number" ? p.position : Infinity;
    }
  }
  return Infinity;
}
