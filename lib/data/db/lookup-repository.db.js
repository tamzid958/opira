// Server-only DB implementation of LookupRepository.
//
// OpenProject schema (verified by schema canary):
//   statuses(id, name, is_closed, position, default_done_ratio, color_id, is_default, is_readonly)
//   types(id, name, position, is_default, color_id)
//   enumerations(id, name, position, is_default, type, color_id)  -- priorities are type='IssuePriority'
//   colors(id, hexcode)
//   projects_types(project_id, type_id)                            -- enabled types per project

import "server-only";
import { getPool } from "./client";
import {
  mapStatusRow,
  mapTypeRow,
  mapPriorityRow,
} from "./row-mappers";

export async function statuses(_ctx) {
  const { rows } = await getPool().query(
    `SELECT s.id, s.name, s.is_closed, s.position, s.is_default, s.is_readonly,
            s.default_done_ratio,
            c.hexcode AS color
       FROM statuses s
       LEFT JOIN colors c ON c.id = s.color_id
      ORDER BY s.position ASC NULLS LAST, s.id ASC`,
  );
  return rows.map(mapStatusRow);
}

export async function types(_ctx, opts = {}) {
  const { projectId } = opts;
  if (projectId) {
    const { rows } = await getPool().query(
      `SELECT t.id, t.name, t.position, t.is_default, c.hexcode AS color
         FROM types t
         JOIN projects_types pt ON pt.type_id = t.id
         JOIN projects p        ON p.id       = pt.project_id
         LEFT JOIN colors c     ON c.id       = t.color_id
        WHERE p.identifier = $1 OR p.id::text = $1
        ORDER BY t.position ASC NULLS LAST, t.id ASC`,
      [String(projectId)],
    );
    return rows.map(mapTypeRow);
  }
  const { rows } = await getPool().query(
    `SELECT t.id, t.name, t.position, t.is_default, c.hexcode AS color
       FROM types t
       LEFT JOIN colors c ON c.id = t.color_id
      ORDER BY t.position ASC NULLS LAST, t.id ASC`,
  );
  return rows.map(mapTypeRow);
}

export async function priorities(_ctx) {
  const { rows } = await getPool().query(
    `SELECT e.id, e.name, e.position, e.is_default, c.hexcode AS color
       FROM enumerations e
       LEFT JOIN colors c ON c.id = e.color_id
      WHERE e.type = 'IssuePriority'
      ORDER BY e.position ASC NULLS LAST, e.id ASC`,
  );
  return rows.map(mapPriorityRow);
}
