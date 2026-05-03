import "server-only";
import { getPool } from "./client";
import { mapCategoryRow } from "./row-mappers";
import { applyProjectVisibility } from "./visibility";

export async function list(ctx, { projectId } = {}) {
  if (!projectId) throw new Error("projectId is required");
  const params = [String(projectId)];
  const conditions = ["(p.identifier = $1 OR p.id::text = $1)"];
  applyProjectVisibility({ params, conditions }, ctx);

  const { rows } = await getPool().query(
    `SELECT cat.id, cat.name, cat.assigned_to_id,
            ua.firstname AS assignee_firstname,
            ua.lastname  AS assignee_lastname,
            ua.login     AS assignee_login
       FROM categories cat
       JOIN projects p ON p.id = cat.project_id
       LEFT JOIN users ua ON ua.id = cat.assigned_to_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY cat.name ASC
      LIMIT 200`,
    params,
  );
  return rows.map(mapCategoryRow);
}
