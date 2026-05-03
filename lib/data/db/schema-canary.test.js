// @vitest-environment node
//
// Schema canary — connects to a real OpenProject Postgres and asserts the
// columns the DB repos rely on still exist. Skipped when OPIRA_TEST_DB_URL
// is not set so the default suite stays runnable without Docker.
//
// Run locally:
//   OPIRA_TEST_DB_URL=postgres://user:pass@host:5432/db npm run test:run

import { describe, it, expect, afterAll } from "vitest";

const URL = process.env.OPIRA_TEST_DB_URL;

const REQUIRED_COLUMNS = {
  users: ["id", "type", "status", "firstname", "lastname", "login", "admin"],
  projects: ["id", "name", "identifier", "description", "active", "public"],
  members: ["id", "user_id", "project_id", "entity_type", "entity_id"],
  member_roles: ["member_id", "role_id"],
  roles: ["id", "name"],
  // OP stores role permissions as one row per (role, permission), not as a
  // serialized column on `roles`.
  role_permissions: ["role_id", "permission"],
  statuses: ["id", "name", "is_closed", "position", "color_id"],
  types: ["id", "name", "position", "color_id"],
  enumerations: ["id", "name", "position", "type", "color_id"],
  colors: ["id", "hexcode"],
  versions: [
    "id",
    "project_id",
    "name",
    "description",
    "effective_date",
    "start_date",
    "status",
  ],
  work_packages: [
    "id",
    "project_id",
    "type_id",
    "status_id",
    "priority_id",
    "assigned_to_id",
    "author_id",
    "subject",
    "description",
    "parent_id",
    "start_date",
    "due_date",
    "duration",
    "estimated_hours",
    "done_ratio",
    "version_id",
    "category_id",
    "lock_version",
    "created_at",
    "updated_at",
  ],
  custom_values: ["customized_type", "customized_id", "custom_field_id", "value"],
  categories: ["id", "name"],
};

let pool;
async function getPool() {
  if (pool) return pool;
  const { Pool } = await import("pg");
  pool = new Pool({ connectionString: URL, max: 2 });
  return pool;
}

afterAll(async () => {
  if (pool) await pool.end().catch(() => {});
});

describe.skipIf(!URL)("OpenProject schema canary", () => {
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    it(`${table} exposes ${columns.length} required columns`, async () => {
      const p = await getPool();
      const { rows } = await p.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1`,
        [table],
      );
      const present = new Set(rows.map((r) => r.column_name));
      const missing = columns.filter((c) => !present.has(c));
      expect(missing).toEqual([]);
    });
  }
});
