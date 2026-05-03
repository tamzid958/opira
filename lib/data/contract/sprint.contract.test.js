// @vitest-environment node
import { describe, it, expect } from "vitest";
import { mapVersionToSprint } from "@/lib/openproject/mappers";
import { mapSprintRow } from "@/lib/data/db/row-mappers";

describe("Sprint (Version) shape parity", () => {
  it("closed sprint maps identically (full shape including days/dayIn)", () => {
    const hal = {
      id: 5,
      name: "v1",
      status: "closed",
      startDate: "2026-01-01",
      endDate: "2026-01-14",
      description: { raw: "Release 1" },
    };
    const row = {
      id: 5,
      name: "v1",
      status: "closed",
      start_date: "2026-01-01",
      effective_date: "2026-01-14",
      description: "Release 1",
    };
    expect(mapSprintRow(row)).toEqual(mapVersionToSprint(hal));
  });

  it("open future-dated sprint is 'planned' in both", () => {
    const hal = {
      id: 6,
      name: "next",
      status: "open",
      startDate: "2099-01-01",
      endDate: "2099-01-14",
    };
    const row = {
      id: 6,
      name: "next",
      status: "open",
      start_date: "2099-01-01",
      effective_date: "2099-01-14",
    };
    expect(mapSprintRow(row)).toEqual(mapVersionToSprint(hal));
  });

  it("missing dates render as '—' in both", () => {
    const hal = { id: 7, name: "no-dates", status: "open" };
    const row = { id: 7, name: "no-dates", status: "open" };
    expect(mapSprintRow(row)).toEqual(mapVersionToSprint(hal));
  });
});
