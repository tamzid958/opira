// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the OP transport before importing the SUT.
vi.mock("@/lib/openproject/client", () => {
  return {
    opFetch: vi.fn(),
    withQuery: (path, params) => {
      const usp = new URLSearchParams();
      for (const [k, v] of Object.entries(params || {})) {
        if (v != null) usp.set(k, String(v));
      }
      const qs = usp.toString();
      return qs ? `${path}?${qs}` : path;
    },
  };
});

import { opFetch } from "@/lib/openproject/client";
import * as repo from "./lookup-repository.api.js";

beforeEach(() => {
  vi.mocked(opFetch).mockReset();
});

describe("API LookupRepository", () => {
  it("statuses() hits /statuses with pageSize=100 and maps elements", async () => {
    vi.mocked(opFetch).mockResolvedValueOnce({
      _embedded: {
        elements: [
          { id: 1, name: "New", isClosed: false, position: 1, isDefault: true, color: "#aaa" },
        ],
      },
    });
    const result = await repo.statuses({});
    expect(opFetch).toHaveBeenCalledWith("/statuses?pageSize=100");
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

  it("types() with projectId hits the project-scoped path", async () => {
    vi.mocked(opFetch).mockResolvedValueOnce({ _embedded: { elements: [] } });
    await repo.types({}, { projectId: "demo" });
    expect(opFetch).toHaveBeenCalledWith("/projects/demo/types");
  });

  it("types() without projectId hits the global path", async () => {
    vi.mocked(opFetch).mockResolvedValueOnce({ _embedded: { elements: [] } });
    await repo.types({}, {});
    expect(opFetch).toHaveBeenCalledWith("/types?pageSize=100");
  });
});
