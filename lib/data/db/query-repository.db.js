// Server-only DB implementation of QueryRepository.
//
// OP `queries` table is generally text-serialized (filters, sort_criteria,
// column_names are YAML/serialized arrays). The DB read is a coarse
// projection — we surface enough to render the saved-query picker (id,
// name, public, starred, projectId, projectName), but the *full* filter
// shape stays better-served by the API path because the YAML deserializer
// lives Ruby-side. Components that drive results from the query (running
// the query) keep using `query.resultsHref` which only API mode populates.

import "server-only";
import { getPool } from "./client";
import { mapQueryRow } from "./row-mappers";

export async function list(ctx, { projectId, starredOnly } = {}) {
  const params = [];
  const conditions = [];

  if (projectId) {
    params.push(String(projectId));
    conditions.push(
      `(p.identifier = $${params.length} OR p.id::text = $${params.length})`,
    );
  }
  if (starredOnly) {
    conditions.push("q.starred = TRUE");
  }

  // Visibility: a query is visible when it's public, owned by the viewer,
  // or attached to a project the viewer can see. Project-scoped queries
  // additionally require `p.active = TRUE` — archived projects don't leak
  // their saved queries even to former members. Admins see everything.
  if (!ctx?.isAdmin) {
    const viewerId = ctx?.userId ? Number(ctx.userId) : null;
    // A query passes if any of:
    //   - it's marked public AND its project (if any) is active
    //   - the viewer owns it
    //   - it's project-scoped and the project is active + visible to viewer
    //   - it's NOT project-scoped and is public (already covered above)
    const projectActive = "(q.project_id IS NULL OR p.active = TRUE)";

    if (viewerId) {
      params.push(viewerId);
      const userIdx = params.length;
      if (!ctx?.projectIds || ctx.projectIds.length === 0) {
        conditions.push(
          `((q.public = TRUE AND ${projectActive}) OR q.user_id = $${userIdx} OR (${projectActive} AND p.public = TRUE))`,
        );
      } else {
        params.push(ctx.projectIds);
        const pidsIdx = params.length;
        conditions.push(
          `((q.public = TRUE AND ${projectActive}) OR q.user_id = $${userIdx} OR (${projectActive} AND (p.public = TRUE OR q.project_id = ANY($${pidsIdx}::int[]))))`,
        );
      }
    } else {
      conditions.push(`q.public = TRUE AND ${projectActive}`);
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await getPool().query(
    `SELECT q.id, q.name, q.public, q.starred, q.user_id, q.group_by,
            q.project_id, p.name AS project_name,
            q.filters, q.sort_criteria, q.column_names
       FROM queries q
       LEFT JOIN projects p ON p.id = q.project_id
       ${where}
      ORDER BY q.starred DESC, q.name ASC
      LIMIT 200`,
    params,
  );
  return rows.map(mapQueryRow);
}
