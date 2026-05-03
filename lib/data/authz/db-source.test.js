// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const queryMock = vi.fn();
vi.mock("@/lib/data/db/client", () => ({
  getPool: () => ({ query: queryMock }),
}));

import {
  fromDbPermissions,
  invalidateDbAuthzCache,
} from "./db-source.js";

// fromDbPermissions issues per-viewer queries in parallel with the shared
// `non_member` context. After cache invalidation, the first call runs
// 4 queries: [0] admin flag, [1] memberships+perms, [2] non_member perms,
// [3] public projects. Repeat calls only re-issue the per-viewer pair (0
// and 1) — non_member context is process-cached.
function mockColdStart({
  admin = false,
  members = [],
  nonMemberPerms = [],
  publicProjects = [],
}) {
  queryMock
    .mockResolvedValueOnce({ rows: [{ admin }] })
    .mockResolvedValueOnce({ rows: members })
    .mockResolvedValueOnce({ rows: nonMemberPerms.map((p) => ({ permission: p })) })
    .mockResolvedValueOnce({ rows: publicProjects.map((id) => ({ id })) });
}

beforeEach(() => {
  queryMock.mockReset();
  invalidateDbAuthzCache();
});

describe("fromDbPermissions", () => {
  it("returns empty context when userId isn't numeric", async () => {
    const ctx = await fromDbPermissions({ user: { id: "not-a-number" } });
    expect(ctx).toEqual({
      userId: "not-a-number",
      isAdmin: false,
      projectIds: [],
      permsByProject: new Map(),
    });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("folds role_permissions rows into a Map<projectId, Set<perm>>", async () => {
    mockColdStart({
      members: [
        { project_id: 7, permission: "view_work_packages" },
        { project_id: 7, permission: "edit_work_packages" },
        { project_id: 9, permission: "view_work_packages" },
      ],
    });

    const ctx = await fromDbPermissions({ user: { id: "42" } });

    expect(ctx.userId).toBe("42");
    expect(ctx.isAdmin).toBe(false);
    expect(ctx.projectIds.sort()).toEqual([7, 9]);
    expect([...ctx.permsByProject.get(7)]).toEqual(
      expect.arrayContaining(["view_work_packages", "edit_work_packages"]),
    );
    expect(ctx.permsByProject.get(9)).toEqual(new Set(["view_work_packages"]));
  });

  it("filters work-package-level shares via entity_type IS NULL", async () => {
    mockColdStart({});
    await fromDbPermissions({ user: { id: "1" } });
    const sql = queryMock.mock.calls[1][0];
    expect(sql).toMatch(/m\.entity_type IS NULL/);
    expect(sql).toMatch(/role_permissions/);
    expect(queryMock.mock.calls[1][1]).toEqual([1]);
  });

  it("admin flag drives isAdmin", async () => {
    mockColdStart({ admin: true });
    const ctx = await fromDbPermissions({ user: { id: "1" } });
    expect(ctx.isAdmin).toBe(true);
  });

  it("non_member fold-in: public projects gain non_member perms even without a membership", async () => {
    mockColdStart({
      members: [{ project_id: 7, permission: "edit_work_packages" }],
      nonMemberPerms: ["view_work_packages"],
      publicProjects: [55, 7],
    });

    const ctx = await fromDbPermissions({ user: { id: "1" } });

    expect([...ctx.permsByProject.get(7)].sort()).toEqual([
      "edit_work_packages",
      "view_work_packages",
    ]);
    expect(ctx.permsByProject.get(55)).toEqual(new Set(["view_work_packages"]));
  });

  it("per-viewer cache: a repeat call hits no SQL", async () => {
    mockColdStart({});
    await fromDbPermissions({ user: { id: "1" } });
    await fromDbPermissions({ user: { id: "1" } });
    expect(queryMock).toHaveBeenCalledTimes(4); // 4 cold-start, 0 repeat
  });

  it("non_member cache: a different user reuses the shared non_member context", async () => {
    // First user: full cold start (4 queries).
    mockColdStart({});
    await fromDbPermissions({ user: { id: "1" } });
    expect(queryMock).toHaveBeenCalledTimes(4);

    // Second user: only the per-viewer queries fire (2 more) — non_member
    // context is process-cached.
    queryMock
      .mockResolvedValueOnce({ rows: [{ admin: false }] })
      .mockResolvedValueOnce({ rows: [] });
    await fromDbPermissions({ user: { id: "2" } });
    expect(queryMock).toHaveBeenCalledTimes(6);
  });
});
