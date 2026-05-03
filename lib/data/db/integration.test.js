// @vitest-environment node
//
// Integration tests against a real OpenProject Postgres. Skipped unless
// OPIRA_TEST_DB_URL is set so the default suite stays Docker-free.
//
// What this catches that mocks don't:
//   - column-doesn't-exist SQL errors
//   - JOIN typos (e.g. `r.permissions` vs `role_permissions.permission`)
//   - shape gaps (a SELECT'd column that the row mapper expects but isn't aliased)
//
// Run:
//   OPIRA_TEST_DB_URL=$OPENPROJECT_DB_URL npx vitest run lib/data/db/integration.test.js

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL = process.env.OPIRA_TEST_DB_URL;

const adminCtx = { isAdmin: true, projectIds: [], permsByProject: new Map() };

let resetPool;
beforeAll(async () => {
  if (!URL) return;
  process.env.OPENPROJECT_DB_URL = URL;
  ({ resetPoolForTesting: resetPool } = await import("./client.js"));
});

afterAll(async () => {
  if (resetPool) await resetPool();
});

describe.skipIf(!URL)("DB repos against live OpenProject", () => {
  it("lookups.statuses() returns at least one mapped status", async () => {
    const { statuses } = await import("./lookup-repository.db.js");
    const rows = await statuses(adminCtx);
    expect(rows.length).toBeGreaterThan(0);
    const s = rows[0];
    expect(typeof s.id).toBe("string");
    expect(typeof s.name).toBe("string");
    expect(typeof s.isClosed).toBe("boolean");
  });

  it("lookups.types() returns at least one mapped type", async () => {
    const { types } = await import("./lookup-repository.db.js");
    const rows = await types(adminCtx);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
    });
  });

  it("lookups.priorities() returns IssuePriority enumerations only", async () => {
    const { priorities } = await import("./lookup-repository.db.js");
    const rows = await priorities(adminCtx);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("users.list() returns active users with mapped shape", async () => {
    const { list } = await import("./user-repository.db.js");
    const rows = await list(adminCtx, { pageSize: 5 });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      avatar: expect.stringMatching(/^\/api\/openproject\/users\//),
    });
  });

  it("projects.list() returns visible projects for admin", async () => {
    const { list } = await import("./project-repository.db.js");
    const rows = await list(adminCtx, {});
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toMatchObject({
      id: expect.any(String),
      key: expect.any(String),
      name: expect.any(String),
      permissions: expect.any(Object),
    });
  });

  it("sprints.list() runs without error", async () => {
    const { list } = await import("./sprint-repository.db.js");
    const rows = await list(adminCtx, {});
    // Some OP instances may have zero versions; we just want no SQL error.
    expect(Array.isArray(rows)).toBe(true);
    if (rows.length) {
      expect(rows[0]).toMatchObject({
        id: expect.any(String),
        state: expect.stringMatching(/^(planned|active|closed)$/),
      });
    }
  });

  it("tasks.list() returns mapped work packages with hal-style ids", async () => {
    const { list } = await import("./task-repository.db.js");
    const result = await list(adminCtx, { pageSize: 3 });
    expect(result.paged).toBe(true);
    expect(typeof result.total).toBe("number");
    if (result.tasks.length) {
      const t = result.tasks[0];
      expect(t.id).toMatch(/^wp-\d+$/);
      expect(t.key).toMatch(/^#\d+$/);
      expect(typeof t.nativeId).toBe("number");
      expect(t.permissions).toEqual(
        expect.objectContaining({ update: true, delete: true }),
      );
    }
  });

  it("tasks.findById() round-trips a real id", async () => {
    const { list, findById } = await import("./task-repository.db.js");
    const result = await list(adminCtx, { pageSize: 1 });
    if (!result.tasks.length) return;
    const target = result.tasks[0];
    const fetched = await findById(adminCtx, target.id);
    expect(fetched).not.toBeNull();
    expect(fetched.id).toBe(target.id);
  });
});
