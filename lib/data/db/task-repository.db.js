import "server-only";
import { getPool } from "./client";
import { loadDbLookups } from "./lookups-cache";
import { mapWorkPackageRow } from "./row-mappers";
import { applyProjectVisibility } from "./visibility";
import { FIELD as SP_FIELD } from "@/lib/openproject/story-points";
import { nativeIdNum } from "@/lib/openproject/route-utils";

const SP_CUSTOM_FIELD_ID = SP_FIELD.startsWith("customField")
  ? Number(SP_FIELD.replace("customField", ""))
  : null;

// Story-points join + select pair. Two LEFT JOINs (one custom_values lookup,
// one custom_options resolution) replace the previous two correlated
// subqueries — Postgres scans `custom_values(customized_type, customized_id,
// custom_field_id)` once per row instead of twice.
const SP_JOINS = SP_CUSTOM_FIELD_ID
  ? `
  LEFT JOIN custom_values sp_cv
    ON sp_cv.customized_type = 'WorkPackage'
   AND sp_cv.customized_id   = wp.id
   AND sp_cv.custom_field_id = ${Number(SP_CUSTOM_FIELD_ID)}
  LEFT JOIN custom_options sp_co
    ON sp_co.id = NULLIF(sp_cv.value, '')::bigint`
  : "";

const SP_SELECT = SP_CUSTOM_FIELD_ID
  ? `NULLIF(sp_cv.value, '') AS sp_value, sp_co.value AS sp_label`
  : `wp.story_points::text AS sp_value, NULL::text AS sp_label`;

const SELECT_COLUMNS = `
  wp.id, wp.project_id, wp.subject, wp.description,
  wp.type_id, t.name AS type_name, tc.hexcode AS type_color,
  wp.status_id, s.name AS status_name, s.is_closed AS status_is_closed,
  sc.hexcode AS status_color,
  wp.priority_id, e.name AS priority_name, e.position AS priority_position,
  ec.hexcode AS priority_color,
  wp.assigned_to_id,
  ua.firstname AS assignee_firstname,
  ua.lastname  AS assignee_lastname,
  ua.login     AS assignee_login,
  wp.author_id,
  uauth.firstname AS author_firstname,
  uauth.lastname  AS author_lastname,
  uauth.login     AS author_login,
  wp.parent_id,
  wpp.subject AS parent_subject,
  EXISTS (SELECT 1 FROM work_packages c WHERE c.parent_id = wp.id) AS has_children,
  wp.version_id,
  v.name AS version_name,
  wp.category_id, cat.name AS category_name,
  wp.created_at, wp.updated_at,
  wp.start_date, wp.due_date, wp.duration, wp.estimated_hours, wp.done_ratio,
  wp.lock_version,
  ${SP_SELECT}
`;

const FROM_JOINS = `
  FROM work_packages wp
  LEFT JOIN projects p        ON p.id = wp.project_id
  LEFT JOIN types t           ON t.id = wp.type_id
  LEFT JOIN colors tc         ON tc.id = t.color_id
  LEFT JOIN statuses s        ON s.id = wp.status_id
  LEFT JOIN colors sc         ON sc.id = s.color_id
  LEFT JOIN enumerations e    ON e.id = wp.priority_id AND e.type = 'IssuePriority'
  LEFT JOIN colors ec         ON ec.id = e.color_id
  LEFT JOIN users ua          ON ua.id = wp.assigned_to_id
  LEFT JOIN users uauth       ON uauth.id = wp.author_id
  LEFT JOIN work_packages wpp ON wpp.id = wp.parent_id
  LEFT JOIN versions v        ON v.id = wp.version_id
  LEFT JOIN categories cat    ON cat.id = wp.category_id
  ${SP_JOINS}
`;

// Slim FROM for COUNT(*): only `projects` is referenced by the WHERE clause,
// so dropping the lookup joins shaves the planner's work in half on the
// count query (paged path runs count + data in parallel).
const COUNT_FROM = `
  FROM work_packages wp
  LEFT JOIN projects p ON p.id = wp.project_id
`;

function buildWhere(ctx, query) {
  const params = [];
  const conditions = [];

  if (query.projectId) {
    params.push(String(query.projectId));
    conditions.push(`(p.identifier = $${params.length} OR p.id::text = $${params.length})`);
  }

  if (query.sprintId === "backlog" || query.sprintId === "none") {
    conditions.push("wp.version_id IS NULL");
  } else if (query.sprintId && query.sprintId !== "all") {
    params.push(Number(query.sprintId));
    conditions.push(`wp.version_id = $${params.length}`);
  }

  applyProjectVisibility({ params, conditions }, ctx);

  return {
    whereSql: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

export async function list(ctx, query = {}) {
  const lookups = await loadDbLookups(query.projectId);
  const { whereSql, params } = buildWhere(ctx, query);
  // Mirror OP's API default: ascending by id. Project 45 in this deploy has
  // 4631 WPs; the bounded walk cap is 1000, so DESC would slice off all the
  // top-level epics (low ids) and return only the latest sub-tasks — board
  // and backlog would render a hierarchy missing every parent.
  const orderSql = "ORDER BY wp.id ASC";

  if (query.pageSize != null) {
    const pageSize = Math.max(1, Math.min(1000, Number(query.pageSize) || 200));
    const offset = Math.max(1, Number(query.offset) || 1);
    const dbOffset = (offset - 1) * pageSize;

    const dataParams = [...params, pageSize, dbOffset];
    const limitIdx = dataParams.length - 1;
    const offsetIdx = dataParams.length;

    const [dataRes, countRes] = await Promise.all([
      getPool().query(
        `SELECT ${SELECT_COLUMNS} ${FROM_JOINS} ${whereSql} ${orderSql}
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        dataParams,
      ),
      getPool().query(
        `SELECT COUNT(*)::int AS total ${COUNT_FROM} ${whereSql}`,
        params,
      ),
    ]);

    const tasks = dataRes.rows.map((r) => mapWorkPackageRow(r, lookups, ctx));
    return {
      paged: true,
      tasks,
      total: countRes.rows[0]?.total ?? tasks.length,
      pageSize,
      offset,
      count: tasks.length,
    };
  }

  const hardCap = Math.max(1, Math.min(2000, Number(query.limit) || 1000));
  const dataParams = [...params, hardCap];
  const limitIdx = dataParams.length;
  const { rows } = await getPool().query(
    `SELECT ${SELECT_COLUMNS} ${FROM_JOINS} ${whereSql} ${orderSql} LIMIT $${limitIdx}`,
    dataParams,
  );
  return {
    paged: false,
    tasks: rows.map((r) => mapWorkPackageRow(r, lookups, ctx)),
  };
}

export async function findById(ctx, id) {
  const lookups = await loadDbLookups();
  const numeric = nativeIdNum(id);
  if (!Number.isFinite(numeric)) return null;

  const params = [numeric];
  const conditions = ["wp.id = $1"];
  applyProjectVisibility({ params, conditions }, ctx);

  const { rows } = await getPool().query(
    `SELECT ${SELECT_COLUMNS} ${FROM_JOINS}
     WHERE ${conditions.join(" AND ")}
     LIMIT 1`,
    params,
  );
  if (rows.length === 0) return null;
  return mapWorkPackageRow(rows[0], lookups, ctx);
}
