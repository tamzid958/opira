// Server-only DB implementation of MembershipRepository.
//
// `members` table holds project memberships AND work-package shares (via
// entity_type='WorkPackage'). For the canonical "members of project" view
// we filter `entity_type IS NULL` to keep WP-level shares out.
//
// Roles are aggregated in SQL via `array_agg` so a 3-role member returns
// one row from Postgres instead of three — saves bandwidth and avoids the
// JS folding loop that the previous version of this file did.

import "server-only";
import { getPool } from "./client";
import { mapMembershipRow } from "./row-mappers";
import { applyProjectVisibility } from "./visibility";

export async function list(ctx, { projectId, principalId } = {}) {
  const params = [];
  const conditions = ["m.entity_type IS NULL", "m.project_id IS NOT NULL"];

  if (projectId) {
    params.push(String(projectId));
    conditions.push(
      `(p.identifier = $${params.length} OR p.id::text = $${params.length})`,
    );
  }
  if (principalId) {
    params.push(Number(principalId));
    conditions.push(`m.user_id = $${params.length}`);
  }

  applyProjectVisibility({ params, conditions }, ctx);

  const where = `WHERE ${conditions.join(" AND ")}`;

  const { rows } = await getPool().query(
    `SELECT m.id AS member_id, m.user_id, m.project_id,
            m.created_at, m.updated_at,
            p.identifier AS project_identifier, p.name AS project_name,
            u.type     AS principal_type,
            u.firstname AS principal_firstname,
            u.lastname  AS principal_lastname,
            u.login     AS principal_login,
            u.mail      AS principal_email,
            COALESCE(
              array_agg(r.id   ORDER BY r.id) FILTER (WHERE r.id IS NOT NULL),
              ARRAY[]::bigint[]
            ) AS role_ids,
            COALESCE(
              array_agg(r.name ORDER BY r.id) FILTER (WHERE r.id IS NOT NULL),
              ARRAY[]::varchar[]
            ) AS role_names
       FROM members m
       JOIN projects p     ON p.id = m.project_id
       LEFT JOIN users u   ON u.id = m.user_id
       LEFT JOIN member_roles mr ON mr.member_id = m.id
       LEFT JOIN roles r   ON r.id = mr.role_id
       ${where}
      GROUP BY m.id, m.user_id, m.project_id, m.created_at, m.updated_at,
               p.identifier, p.name,
               u.type, u.firstname, u.lastname, u.login, u.mail
      ORDER BY m.id ASC
      LIMIT 1000`,
    params,
  );

  return rows.map((r) => mapMembershipRow(r, ctx));
}
