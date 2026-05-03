// Server-only DB implementation of SprintRepository.
//
// OpenProject `versions` table:
//   versions(id, project_id, name, description, effective_date, start_date,
//            status, sharing, created_on, updated_on, wiki_page_title)

import "server-only";
import { getPool } from "./client";
import { mapSprintRow } from "./row-mappers";
import { applyProjectVisibility } from "./visibility";

export async function list(ctx, opts = {}) {
  const { projectId } = opts;
  const params = [];
  const conditions = [];

  if (projectId) {
    params.push(String(projectId));
    conditions.push(`(p.identifier = $${params.length} OR p.id::text = $${params.length})`);
  }

  applyProjectVisibility({ params, conditions }, ctx);

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT v.id, v.project_id, v.name, v.description, v.effective_date,
           v.start_date, v.status
      FROM versions v
      JOIN projects p ON p.id = v.project_id
      ${where}
     ORDER BY v.start_date ASC NULLS LAST, v.id ASC
     LIMIT 500
  `;

  const { rows } = await getPool().query(sql, params);
  return rows.map(mapSprintRow);
}
