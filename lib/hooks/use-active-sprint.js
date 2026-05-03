"use client";

// Pick the "active" sprint by date from a list of versions. Used by Board's
// header and by Reports/Overview when no explicit sprint is selected.
//
// Order of preference:
//   1. An open sprint whose [start, end] contains today.
//   2. The latest open sprint that has started (even if its end has slipped).
//   3. Closest upcoming open sprint.
//   4. Most recent past sprint.
//   5. First sprint in the list.
export function pickSprintByDate(sprints) {
  const list = Array.isArray(sprints) ? sprints : [];
  const dated = list.filter(
    (s) => s.start && s.start !== "—" && s.end && s.end !== "—",
  );
  const today = new Date().toISOString().slice(0, 10);
  return (
    dated.find(
      (s) => s.status !== "closed" && s.start <= today && today <= s.end,
    ) ||
    dated
      .filter((s) => s.status !== "closed" && s.start <= today)
      .sort((a, b) => b.start.localeCompare(a.start))[0] ||
    dated
      .filter((s) => s.status !== "closed" && s.start > today)
      .sort((a, b) => a.start.localeCompare(b.start))[0] ||
    dated
      .filter((s) => s.end < today)
      .sort((a, b) => b.end.localeCompare(a.end))[0] ||
    list[0] ||
    null
  );
}

// `sprintId` is either a real id, "all", "backlog", or null. Returns the
// matching sprint object if a real id is selected, otherwise falls back to
// the date-based pick so headers always have something to show.
export function useActiveSprint(sprints, sprintId) {
  const list = Array.isArray(sprints) ? sprints : [];
  if (sprintId && sprintId !== "all" && sprintId !== "backlog") {
    const match = list.find((s) => s.id === sprintId);
    if (match) return match;
  }
  return pickSprintByDate(list);
}
