// Server-only DB implementation of TimeEntryRepository.
//
// OP `time_entries` table:
//   time_entries(id, project_id, user_id, work_package_id, hours,
//                comments, activity_id, spent_on, created_at, updated_at)
// Activities are `enumerations` rows where type='TimeEntryActivity'.

import "server-only";
import { getPool } from "./client";
import { mapTimeEntryRow } from "./row-mappers";
import { applyProjectVisibility } from "./visibility";

export async function list(ctx, query = {}) {
  const params = [];
  const conditions = [];

  if (query.from && query.to) {
    params.push(query.from, query.to);
    conditions.push(
      `te.spent_on BETWEEN $${params.length - 1} AND $${params.length}`,
    );
  } else if (query.from) {
    params.push(query.from);
    conditions.push(`te.spent_on >= $${params.length}`);
  } else if (query.to) {
    params.push(query.to);
    conditions.push(`te.spent_on <= $${params.length}`);
  }

  if (query.projectId) {
    params.push(String(query.projectId));
    conditions.push(
      `(p.identifier = $${params.length} OR p.id::text = $${params.length})`,
    );
  }

  if (query.userId) {
    params.push(Number(query.userId));
    conditions.push(`te.user_id = $${params.length}`);
  }

  if (query.workPackageId) {
    const numericWp = Number(String(query.workPackageId).replace(/^wp-/, ""));
    params.push(numericWp);
    conditions.push(`te.work_package_id = $${params.length}`);
  }

  applyProjectVisibility({ params, conditions }, ctx);

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await getPool().query(
    `SELECT te.id, te.spent_on, te.hours, te.comments, te.created_at,
            te.user_id, u.firstname AS user_firstname,
            u.lastname AS user_lastname, u.login AS user_login,
            te.activity_id, e.name AS activity_name,
            te.work_package_id, wp.subject AS wp_subject,
            te.project_id, p.name AS project_name
       FROM time_entries te
       LEFT JOIN users u           ON u.id  = te.user_id
       LEFT JOIN enumerations e    ON e.id  = te.activity_id AND e.type = 'TimeEntryActivity'
       LEFT JOIN work_packages wp  ON wp.id = te.work_package_id
       LEFT JOIN projects p        ON p.id  = te.project_id
       ${where}
      ORDER BY te.spent_on DESC, te.id DESC
      LIMIT 500`,
    params,
  );
  return rows.map(mapTimeEntryRow);
}
