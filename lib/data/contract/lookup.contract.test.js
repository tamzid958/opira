// @vitest-environment node
//
// Contract test: API mappers (HAL → UI shape) and DB row mappers (PG row →
// UI shape) must produce IDENTICAL output for the same logical entity. If
// this fails, switching OPIRA_DATA_SOURCE will silently change the UI.

import { describe, it, expect } from "vitest";
import {
  mapStatus,
  mapType,
  mapPriority,
} from "@/lib/openproject/mappers";
import {
  mapStatusRow,
  mapTypeRow,
  mapPriorityRow,
} from "@/lib/data/db/row-mappers";

describe("Status shape parity", () => {
  it("HAL and DB row produce identical UI shape", () => {
    const hal = {
      _type: "Status",
      id: 7,
      name: "In progress",
      isClosed: false,
      color: "#1A67A3",
      position: 3,
      isDefault: false,
      isReadonly: false,
    };
    const row = {
      id: 7,
      name: "In progress",
      is_closed: false,
      color: "#1A67A3",
      position: 3,
      is_default: false,
      is_readonly: false,
    };
    expect(mapStatusRow(row)).toEqual(mapStatus(hal));
  });

  it("treats missing color as null on both sides", () => {
    const hal = { id: 1, name: "X", isClosed: true };
    const row = { id: 1, name: "X", is_closed: true };
    expect(mapStatusRow(row)).toEqual(mapStatus(hal));
  });
});

describe("Type shape parity", () => {
  it("HAL and DB row produce identical UI shape", () => {
    const hal = {
      _type: "Type",
      id: 4,
      name: "Bug",
      position: 2,
      color: "#D81B60",
      isDefault: true,
    };
    const row = {
      id: 4,
      name: "Bug",
      position: 2,
      color: "#D81B60",
      is_default: true,
    };
    expect(mapTypeRow(row)).toEqual(mapType(hal));
  });
});

describe("Priority shape parity", () => {
  it("HAL and DB row produce identical UI shape", () => {
    const hal = {
      _type: "Priority",
      id: 9,
      name: "High",
      position: 5,
      color: "#FB8C00",
      isDefault: false,
    };
    const row = {
      id: 9,
      name: "High",
      position: 5,
      color: "#FB8C00",
      is_default: false,
    };
    expect(mapPriorityRow(row)).toEqual(mapPriority(hal));
  });
});
