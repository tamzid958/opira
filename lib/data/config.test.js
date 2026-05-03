// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";

const ORIGINAL = process.env.OPIRA_DATA_SOURCE;

beforeEach(() => {
  delete process.env.OPIRA_DATA_SOURCE;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.OPIRA_DATA_SOURCE;
  else process.env.OPIRA_DATA_SOURCE = ORIGINAL;
});

describe("readDataSourceMode", () => {
  it("defaults to 'api' when unset", async () => {
    const { readDataSourceMode } = await import("./config.js?case=unset");
    expect(readDataSourceMode()).toBe("api");
  });

  it("returns 'hybrid' when set to 'hybrid'", async () => {
    process.env.OPIRA_DATA_SOURCE = "hybrid";
    const { readDataSourceMode } = await import("./config.js?case=hybrid");
    expect(readDataSourceMode()).toBe("hybrid");
  });

  it("falls back to 'api' for unknown values (including 'db')", async () => {
    process.env.OPIRA_DATA_SOURCE = "db";
    const { readDataSourceMode } = await import("./config.js?case=db");
    expect(readDataSourceMode()).toBe("api");
  });

  it("falls back to 'api' for unrelated values", async () => {
    process.env.OPIRA_DATA_SOURCE = "redis";
    const { readDataSourceMode } = await import("./config.js?case=bad");
    expect(readDataSourceMode()).toBe("api");
  });

  it("is case-insensitive and trim-tolerant", async () => {
    process.env.OPIRA_DATA_SOURCE = "  Hybrid  ";
    const { readDataSourceMode } = await import("./config.js?case=trim");
    expect(readDataSourceMode()).toBe("hybrid");
  });
});

describe("isHybridMode", () => {
  it("is true for hybrid", async () => {
    process.env.OPIRA_DATA_SOURCE = "hybrid";
    const { isHybridMode } = await import("./config.js?case=hyb-true");
    expect(isHybridMode()).toBe(true);
  });

  it("is false for api", async () => {
    process.env.OPIRA_DATA_SOURCE = "api";
    const { isHybridMode } = await import("./config.js?case=api-false");
    expect(isHybridMode()).toBe(false);
  });
});
