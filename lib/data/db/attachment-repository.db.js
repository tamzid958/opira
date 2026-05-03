// Server-only DB implementation of AttachmentRepository.
//
// `attachments` table is shared across containers (work_packages, wiki_pages,
// messages, …). We restrict to `container_type='WorkPackage'` and join on
// the WP's project for visibility filtering.

import "server-only";
import { getPool } from "./client";
import { mapAttachmentRow } from "./row-mappers";
import { applyProjectVisibility } from "./visibility";

export async function list(ctx, { workPackageId } = {}) {
  if (!workPackageId) throw new Error("workPackageId is required");
  const numericWp = Number(String(workPackageId).replace(/^wp-/, ""));
  if (!Number.isFinite(numericWp)) return [];

  const params = [numericWp];
  const conditions = [
    "a.container_type = 'WorkPackage'",
    "a.container_id = $1",
  ];

  // The wp+projects JOINs only exist for visibility filtering; skip them
  // entirely when the viewer is admin so Postgres planner doesn't even
  // consider them. `applyProjectVisibility` adds active/public/membership
  // predicates against the joined `p` alias.
  let visibilityJoin = "";
  if (!ctx?.isAdmin) {
    visibilityJoin =
      `JOIN work_packages wp ON wp.id = a.container_id ` +
      `LEFT JOIN projects p ON p.id = wp.project_id `;
    applyProjectVisibility({ params, conditions }, ctx);
  }

  const { rows } = await getPool().query(
    `SELECT a.id, a.filename, a.filesize, a.content_type, a.description,
            a.created_at, a.author_id,
            au.firstname AS author_firstname,
            au.lastname  AS author_lastname,
            au.login     AS author_login
       FROM attachments a
       ${visibilityJoin}
       LEFT JOIN users au ON au.id = a.author_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY a.created_at DESC, a.id DESC`,
    params,
  );
  return rows.map((r) => mapAttachmentRow(r, ctx));
}
