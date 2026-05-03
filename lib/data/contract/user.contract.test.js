// @vitest-environment node
import { describe, it, expect } from "vitest";
import { mapUser } from "@/lib/openproject/mappers";
import { mapUserRow } from "@/lib/data/db/row-mappers";

describe("User shape parity", () => {
  it("HAL .name and DB firstname+lastname produce identical UI shape", () => {
    const hal = {
      id: 42,
      name: "Ada Lovelace",
      firstName: "Ada",
      lastName: "Lovelace",
      login: "ada",
    };
    const row = {
      id: 42,
      firstname: "Ada",
      lastname: "Lovelace",
      login: "ada",
    };
    expect(mapUserRow(row)).toEqual(mapUser(hal));
  });

  it("falls back to login when name parts are missing", () => {
    const hal = { id: 99, login: "ghost" };
    const row = { id: 99, login: "ghost" };
    expect(mapUserRow(row)).toEqual(mapUser(hal));
  });

  it("returns null for null input on both sides", () => {
    expect(mapUserRow(null)).toBeNull();
    expect(mapUser(null)).toBeNull();
  });
});
