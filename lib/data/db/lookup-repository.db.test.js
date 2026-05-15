// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const queryMock = vi.fn();
vi.mock("./client", () => ({
  getPool: () => ({ query: queryMock }),
}));

import * as repo from "./lookup-repository.db.js";

beforeEach(() => {
  queryMock.mockReset();
});

describe("DB LookupRepository", () => {
  it("statuses() left-joins colors and orders by position", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          name: "New",
          is_closed: false,
          position: 1,
          is_default: true,
          is_readonly: false,
          color: "#aaa",
        },
      ],
    });
    const result = await repo.statuses();
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql] = queryMock.mock.calls[0];
    expect(sql).toMatch(/FROM\s+statuses\s+s/i);
    expect(sql).toMatch(/LEFT JOIN colors/i);
    expect(sql).toMatch(/ORDER BY\s+s\.position/i);
    expect(result).toEqual([
      {
        id: "1",
        name: "New",
        isClosed: false,
        color: "#aaa",
        position: 1,
        isDefault: true,
        isReadonly: false,
        defaultDoneRatio: null,
      },
    ]);
  });

  it("types({projectId}) parameterizes the project lookup", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await repo.types({}, { projectId: "demo" });
    const [, params] = queryMock.mock.calls[0];
    expect(params).toEqual(["demo"]);
  });

  it("priorities() filters enumerations by IssuePriority type", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await repo.priorities();
    const [sql] = queryMock.mock.calls[0];
    expect(sql).toMatch(/e\.type\s*=\s*'IssuePriority'/);
  });
});
