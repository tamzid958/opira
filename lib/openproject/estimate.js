// Centralized estimation accessor. Three estimation models live in one
// place so every aggregation, every chart, and every chip in the app reads
// from the same contract:
//
//   1. Numeric story points     — task.points already numeric; label is the number.
//   2. T-shirt sizes            — task.points is the mapped numeric (M=3, L=5),
//                                 task.pointsRaw is the human label ("L").
//   3. Date-range duration      — task.startDate + task.dueDate count working days
//                                 between them; no points are required.
//
// `weightOf(task)` is what aggregations sum.
// `labelOf(task)` / `formatEstimate(task)` is what chips render.
// `sourceOf(task, mode)` tells UI which picker to surface.
//
// The mapper already populates `task.points`, `task.pointsRaw`, `task.startDate`,
// `task.dueDate`, and `task.estimatedHours`. This module is a pure derivation
// layer — no schema lookups happen here. The auto-detected per-project mode
// is supplied by `useEstimateMode` (client) or `getEstimateMode` (server).

import { workingDaySet } from "./working-days";
import { makeCache } from "./route-cache";

export { formatPoints } from "./story-points-constants";

// Inclusive working-day count between two ISO dates. Returns 0 when either
// is missing or the range is inverted. Falls back to a Mon..Fri mask when
// `mask` is omitted; callers that want to honour `OPENPROJECT_WORKING_DAYS`
// should compute the mask via `workingDaySet(raw)` and pass it explicitly
// (server: `process.env.OPENPROJECT_WORKING_DAYS`; client: `usePublicConfig().workingDays`).
export function workingDaysBetween(startIso, endIso, mask) {
  if (!startIso || !endIso) return 0;
  if (startIso === "—" || endIso === "—") return 0;
  const wd = mask || workingDaySet(null);
  const start = new Date(`${String(startIso).slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${String(endIso).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  if (end.getTime() < start.getTime()) return 0;
  let count = 0;
  for (
    const d = new Date(start);
    d.getTime() <= end.getTime();
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    if (wd.has(d.getUTCDay())) count += 1;
  }
  return count;
}

// Numeric weight used by every aggregation (sums, averages, charts).
//
// Modes:
//   mode unset / "hybrid"               — points first; if missing, fall back to
//                                         workingDaysBetween. This is the
//                                         user-confirmed default — projects in
//                                         numeric/t-shirt mode still get the
//                                         right number (points are always set
//                                         on those projects), and projects on
//                                         start/due dates get their day count.
//   mode = "numeric" / "tshirt"         — points only; missing → 0.
//                                         The strictly-legacy behaviour, useful
//                                         when callers know the project is
//                                         points-only and want to ignore stray
//                                         dates.
//   mode = "duration"                   — skip points entirely; weight =
//                                         workingDaysBetween(startDate, dueDate).
//                                         Used by the server when it auto-
//                                         detects duration mode from WP data.
export function weightOf(task, opts = {}) {
  if (!task) return 0;
  const { mode = "hybrid", workingDayMask } = opts;
  if (mode === "duration") {
    return workingDaysBetween(task.startDate, task.dueDate, workingDayMask);
  }
  if (typeof task.points === "number" && Number.isFinite(task.points)) {
    return task.points;
  }
  if (mode === "numeric" || mode === "tshirt") {
    return 0;
  }
  return workingDaysBetween(task.startDate, task.dueDate, workingDayMask);
}

// Display label for chips and per-WP rows. Returns null when nothing to show
// (caller usually renders a "—" placeholder).
//
//   tshirt project, points=5, pointsRaw="L"  → "L"
//   numeric project, points=5                 → "5"
//   duration mode, 3 working days             → "3d"
//   no estimate                                → null
//
// Default mode is "hybrid": prefer pointsRaw, fall back to points, fall back
// to working-day count. Matches weightOf's default precedence so a chip and
// the sum it contributes to read consistently.
export function labelOf(task, opts = {}) {
  if (!task) return null;
  const { mode = "hybrid", workingDayMask } = opts;

  if (mode === "duration") {
    const days = workingDaysBetween(task.startDate, task.dueDate, workingDayMask);
    return days > 0 ? `${days}d` : null;
  }

  if (task.pointsRaw != null && task.pointsRaw !== "") {
    return String(task.pointsRaw);
  }
  if (typeof task.points === "number" && Number.isFinite(task.points)) {
    return String(task.points);
  }

  if (mode === "numeric" || mode === "tshirt") return null;

  const days = workingDaysBetween(task.startDate, task.dueDate, workingDayMask);
  return days > 0 ? `${days}d` : null;
}

// Alias so call sites that used to read `formatPoints(task)` can switch to
// `formatEstimate(task)` with no behavioural diff on numeric/tshirt projects.
export function formatEstimate(task, opts) {
  return labelOf(task, opts);
}

// Which estimation source is actually contributing for this task. Drives
// picker selection in EstimatePicker and lets reports surface "by source"
// breakdowns later.
export function sourceOf(task, opts = {}) {
  if (!task) return null;
  const { mode = "hybrid" } = opts;
  if (mode === "duration") {
    return task.startDate && task.dueDate ? "duration" : null;
  }
  if (task.pointsRaw != null && task.pointsRaw !== "") {
    return mode === "numeric" ? "numeric" : "tshirt";
  }
  if (typeof task.points === "number" && Number.isFinite(task.points)) {
    return "numeric";
  }
  if (task.startDate && task.dueDate) return "duration";
  return null;
}

// Display-suffix helper. Reports + sprint headers use this to decide
// whether a sum reads "27 pts" or "27d".
//   mode="numeric"|"tshirt" → "pts"
//   mode="duration"          → "d"
//   mode unset / "hybrid"    → "pts" (the historical default; flips to "d"
//                              only when reports are scoped to a duration
//                              project, which they detect via the unit
//                              field returned by the API routes in Wave B).
export function unitFor(mode) {
  return mode === "duration" ? "d" : "pts";
}

// Server-side schema-aware mode detection. The OP schema is the source of
// truth for "what kind of field is the configured story-points field":
//
//   schema.fields[FIELD].type === "CustomOption"        → "tshirt"
//   schema.fields[FIELD].type ∈ {"Float","Integer"}      → "numeric"
//   schema.fields[FIELD] is undefined                    → "duration"
//
// Returns null when the schema can't be fetched (no sample WP, network
// error). Callers fall back to inferModeFromTasks in that case.
//
// Caches per (project, fieldKey) so all three reporting routes share one
// schema fetch with a 10-minute TTL — schemas rarely change at runtime.
const SCHEMA_MODE_CACHE = makeCache({ ttlMs: 10 * 60 * 1000, maxEntries: 200 });

export async function getProjectEstimateMode(projectId, sampleWp, opFetch) {
  if (!projectId || !sampleWp || !opFetch) return null;
  const fieldKey =
    process.env.OPENPROJECT_STORY_POINTS_FIELD || "storyPoints";
  const cacheKey = `${projectId}::${fieldKey}`;
  const cached = SCHEMA_MODE_CACHE.get(cacheKey);
  if (cached !== undefined) return cached;

  const schemaHref = sampleWp.schemaHref;
  if (!schemaHref) return null;
  let mode = null;
  try {
    const schemaPath = String(schemaHref).replace(/^\/api\/v3/, "");
    const schema = await opFetch(schemaPath);
    const field = schema?.[fieldKey];
    if (field?.type === "CustomOption") mode = "tshirt";
    else if (field?.type === "Float" || field?.type === "Integer") mode = "numeric";
    else if (field === undefined || field === null) mode = "duration";
  } catch {
    mode = null;
  }
  SCHEMA_MODE_CACHE.set(cacheKey, mode);
  return mode;
}

// Server-side helper: given a fetched WP list, guess the project's
// estimation mode from the data alone. Used by the burndown / velocity /
// capacity routes as a fallback when the schema-aware lookup is
// unavailable, and as a tiebreaker when the schema is silent.
//
// Precedence:
//   any task with a non-numeric pointsRaw → "tshirt"
//   any task with a numeric points        → "numeric"
//   no points anywhere but at least one
//     task with both startDate and dueDate → "duration"
//   nothing at all                          → null (caller decides default)
export function inferModeFromTasks(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) return null;
  let hasTshirt = false;
  let hasNumeric = false;
  let hasDates = false;
  for (const t of tasks) {
    if (t.pointsRaw != null && t.pointsRaw !== "") {
      const asNum = Number(t.pointsRaw);
      if (Number.isNaN(asNum)) {
        hasTshirt = true;
      } else {
        hasNumeric = true;
      }
    } else if (typeof t.points === "number" && Number.isFinite(t.points)) {
      hasNumeric = true;
    }
    if (t.startDate && t.dueDate) hasDates = true;
  }
  if (hasTshirt) return "tshirt";
  if (hasNumeric) return "numeric";
  if (hasDates) return "duration";
  return null;
}
