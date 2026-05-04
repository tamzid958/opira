// Server-only DB implementation of ActivityRepository.
//
// OP's Activity v3 endpoint synthesises rows from three tables:
//   - journals (one row per change/comment, with `notes`)
//   - work_package_journals (full snapshot at each version)
//   - customizable_journals (per-CF deltas inside a journal)
//
// We approximate the API's output:
//   - `comment` activities come from journals where notes is non-empty
//   - `change` activities come from journals where notes is empty; the
//     `details` array is derived by diffing this journal's snapshot vs
//     the previous version's snapshot for the standard scalar fields
//
// Per-row enrichment (status name, type name, …) is left as id-only
// strings to avoid N×lookups; the activity feed degrades gracefully —
// the UI still shows author + timestamp + comment correctly. Components
// that read raw HTML from `commentHtml` continue to do so via
// markdown-it on the client (we leave commentHtml empty here).

import "server-only";
import { getPool } from "./client";
import { mapActivityRow } from "./row-mappers";
import { applyProjectVisibility } from "./visibility";
import { nativeIdNum } from "@/lib/openproject/route-utils";

const SNAPSHOT_FIELDS = [
  ["subject", "Subject"],
  ["description", "Description"],
  ["status_id", "Status"],
  ["type_id", "Type"],
  ["priority_id", "Priority"],
  ["assigned_to_id", "Assignee"],
  ["responsible_id", "Accountable"],
  ["version_id", "Version"],
  ["parent_id", "Parent"],
  ["category_id", "Category"],
  ["start_date", "Start date"],
  ["due_date", "Finish date"],
  ["duration", "Duration"],
  ["estimated_hours", "Estimated time"],
  ["done_ratio", "% Complete"],
  ["story_points", "Story points"],
];

function diffSnapshots(prev, curr) {
  if (!prev || !curr) return [];
  const out = [];
  for (const [col, label] of SNAPSHOT_FIELDS) {
    const a = prev[col] ?? null;
    const b = curr[col] ?? null;
    if (a === b) continue;
    if (String(a ?? "") === String(b ?? "")) continue;
    if (a == null && b != null) out.push(`${label} set to ${b}`);
    else if (a != null && b == null) out.push(`${label} cleared`);
    else out.push(`${label} changed from ${a} to ${b}`);
  }
  return out;
}

export async function list(ctx, { workPackageId } = {}) {
  if (!workPackageId) throw new Error("workPackageId is required");
  const numericWp = nativeIdNum(workPackageId);
  if (!Number.isFinite(numericWp)) return [];

  const params = [numericWp];
  const conditions = [
    "j.journable_type = 'WorkPackage'",
    "j.journable_id = $1",
  ];

  // The wp+projects JOINs only exist for visibility filtering; for admins
  // they're dead weight (Postgres can't elide an INNER JOIN without an FK
  // constraint declaration). Add them only when the viewer is non-admin,
  // and let `applyProjectVisibility` add the active/public/membership
  // predicates against the joined `p` alias.
  let visibilityJoin = "";
  if (!ctx?.isAdmin) {
    visibilityJoin =
      `JOIN work_packages wp ON wp.id = j.journable_id ` +
      `LEFT JOIN projects p ON p.id = wp.project_id `;
    applyProjectVisibility({ params, conditions }, ctx);
  }

  const { rows } = await getPool().query(
    `SELECT j.id, j.version, j.notes, j.created_at, j.user_id,
            u.firstname AS user_firstname,
            u.lastname  AS user_lastname,
            u.login     AS user_login,
            wpj.subject, wpj.description, wpj.status_id, wpj.type_id,
            wpj.priority_id, wpj.assigned_to_id, wpj.responsible_id,
            wpj.version_id, wpj.parent_id, wpj.category_id,
            wpj.start_date, wpj.due_date, wpj.duration,
            wpj.estimated_hours, wpj.done_ratio, wpj.story_points
       FROM journals j
       ${visibilityJoin}
       LEFT JOIN users u                   ON u.id  = j.user_id
       LEFT JOIN work_package_journals wpj ON wpj.id = j.data_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY j.version ASC
      LIMIT 500`,
    params,
  );

  // Walk versions to compute per-journal `details` from snapshot diffs.
  let prevSnapshot = null;
  const out = [];
  for (const r of rows) {
    const snapshot = {
      subject: r.subject,
      description: r.description,
      status_id: r.status_id,
      type_id: r.type_id,
      priority_id: r.priority_id,
      assigned_to_id: r.assigned_to_id,
      responsible_id: r.responsible_id,
      version_id: r.version_id,
      parent_id: r.parent_id,
      category_id: r.category_id,
      start_date: r.start_date,
      due_date: r.due_date,
      duration: r.duration,
      estimated_hours: r.estimated_hours,
      done_ratio: r.done_ratio,
      story_points: r.story_points,
    };
    const details = r.version === 1 ? [] : diffSnapshots(prevSnapshot, snapshot);
    out.push(mapActivityRow(r, details));
    prevSnapshot = snapshot;
  }
  return out;
}
