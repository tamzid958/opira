// @vitest-environment node
//
// Contract test: a HAL work-package response and a DB row representing the
// same logical entity must produce identical UI shapes through their
// respective mappers. This is the most fragile parity point in the project
// because the WP shape has ~40 fields.

import { describe, it, expect } from "vitest";
import { mapWorkPackage } from "@/lib/openproject/mappers";
import { mapWorkPackageRow } from "@/lib/data/db/row-mappers";

const sharedLookups = {
  statuses: [
    { id: "1", name: "New", isClosed: false, color: "#aaa", position: 1 },
    { id: "5", name: "Done", isClosed: true, color: "#0a0", position: 5 },
  ],
  types: [
    { id: "2", name: "Task", color: "#222", position: 1 },
    { id: "3", name: "Bug", color: "#b22", position: 2 },
  ],
  priorities: [
    { id: "8", name: "Normal", color: "#888", position: 5 },
    { id: "9", name: "High", color: "#f80", position: 7 },
  ],
};

const authzAdmin = { isAdmin: true, permsByProject: new Map() };

describe("WorkPackage shape parity (admin viewer)", () => {
  it("matches API mapper field-for-field for a fully-populated WP", () => {
    const projectId = 42;
    const typeId = 2;
    const statusId = 5;
    const priorityId = 9;
    const wpId = 1234;

    const hal = {
      id: wpId,
      lockVersion: 7,
      subject: "Implement feature",
      description: { raw: "do the thing", html: "", format: "markdown" },
      startDate: "2026-04-01",
      dueDate: "2026-04-15",
      duration: 14,
      estimatedTime: null,
      percentageDone: 30,
      createdAt: "2026-03-01T00:00:00Z",
      updatedAt: "2026-04-02T00:00:00Z",
      _links: {
        type: { href: `/api/v3/types/${typeId}`, title: "Task" },
        status: { href: `/api/v3/statuses/${statusId}`, title: "Done" },
        priority: { href: `/api/v3/priorities/${priorityId}`, title: "High" },
        assignee: { href: "/api/v3/users/11", title: "Alice Smith" },
        author: { href: "/api/v3/users/22", title: "Bob Jones" },
        version: { href: "/api/v3/versions/77", title: "Sprint 3" },
        parent: { href: `/api/v3/work_packages/999`, title: "Big epic" },
        category: { href: `/api/v3/categories/3`, title: "Backend" },
        project: { href: `/api/v3/projects/${projectId}` },
        schema: { href: `/api/v3/work_packages/schemas/${projectId}-${typeId}` },
      },
    };

    const row = {
      id: wpId,
      project_id: projectId,
      subject: "Implement feature",
      description: "do the thing",
      type_id: typeId,
      type_name: "Task",
      type_color: "#222",
      status_id: statusId,
      status_name: "Done",
      status_is_closed: true,
      status_color: "#0a0",
      priority_id: priorityId,
      priority_name: "High",
      priority_position: 7,
      priority_color: "#f80",
      assigned_to_id: 11,
      assignee_firstname: "Alice",
      assignee_lastname: "Smith",
      assignee_login: "alice",
      author_id: 22,
      author_firstname: "Bob",
      author_lastname: "Jones",
      author_login: "bob",
      parent_id: 999,
      parent_subject: "Big epic",
      has_children: false,
      version_id: 77,
      version_name: "Sprint 3",
      category_id: 3,
      category_name: "Backend",
      created_at: new Date("2026-03-01T00:00:00Z"),
      updated_at: new Date("2026-04-02T00:00:00Z"),
      start_date: "2026-04-01",
      due_date: "2026-04-15",
      duration: 14,
      estimated_hours: null,
      done_ratio: 30,
      lock_version: 7,
      sp_value: null,
      sp_label: null,
    };

    const halShape = mapWorkPackage(hal, sharedLookups);
    const rowShape = mapWorkPackageRow(row, sharedLookups, authzAdmin);

    // Identifier-style fields:
    expect(rowShape.id).toBe(halShape.id);
    expect(rowShape.nativeId).toBe(halShape.nativeId);
    expect(rowShape.key).toBe(halShape.key);

    // Type / status / priority resolved via lookups:
    expect(rowShape.typeId).toBe(halShape.typeId);
    expect(rowShape.typeName).toBe(halShape.typeName);
    expect(rowShape.typeColor).toBe(halShape.typeColor);
    expect(rowShape.statusId).toBe(halShape.statusId);
    expect(rowShape.statusName).toBe(halShape.statusName);
    expect(rowShape.statusIsClosed).toBe(halShape.statusIsClosed);
    expect(rowShape.statusColor).toBe(halShape.statusColor);
    expect(rowShape.priorityId).toBe(halShape.priorityId);
    expect(rowShape.priorityName).toBe(halShape.priorityName);
    expect(rowShape.priorityColor).toBe(halShape.priorityColor);
    expect(rowShape.priorityPosition).toBe(halShape.priorityPosition);
    expect(rowShape.priorityTotal).toBe(halShape.priorityTotal);

    // People — IDs as strings, names as separate fields:
    expect(rowShape.assignee).toBe(halShape.assignee);
    expect(rowShape.assigneeName).toBe(halShape.assigneeName);
    expect(rowShape.reporter).toBe(halShape.reporter);
    expect(rowShape.reporterName).toBe(halShape.reporterName);

    // Sprint / hierarchy:
    expect(rowShape.sprint).toBe(halShape.sprint);
    expect(rowShape.sprintName).toBe(halShape.sprintName);
    expect(rowShape.epic).toBe(halShape.epic);
    expect(rowShape.epicName).toBe(halShape.epicName);
    expect(rowShape.hasChildren).toBe(halShape.hasChildren);

    // Category:
    expect(rowShape.categoryId).toBe(halShape.categoryId);
    expect(rowShape.categoryName).toBe(halShape.categoryName);
    expect(rowShape.labels).toEqual(halShape.labels);

    // Hrefs:
    expect(rowShape.projectHref).toBe(halShape.projectHref);
    expect(rowShape.schemaHref).toBe(halShape.schemaHref);

    // Timing / metadata:
    expect(rowShape.title).toBe(halShape.title);
    expect(rowShape.description).toBe(halShape.description);
    expect(rowShape.descriptionFormat).toBe(halShape.descriptionFormat);
    expect(rowShape.startDate).toBe(halShape.startDate);
    expect(rowShape.dueDate).toBe(halShape.dueDate);
    expect(rowShape.duration).toBe(halShape.duration);
    expect(rowShape.percentageDone).toBe(halShape.percentageDone);
    expect(rowShape.lockVersion).toBe(halShape.lockVersion);

    // Permissions: admin viewer → all keys true, identical on both sides.
    expect(rowShape.permissions.update).toBe(true);
    expect(rowShape.permissions.delete).toBe(true);
  });

  it("CustomOption story-points: DB resolves option label, parses to numeric", () => {
    const row = {
      id: 1,
      project_id: 1,
      subject: "x",
      description: "",
      type_id: 1,
      sp_value: "7",   // option_id stored in custom_values.value
      sp_label: "L",   // resolved from custom_options.value
    };
    const shape = mapWorkPackageRow(row, sharedLookups, authzAdmin);
    expect(shape.pointsRaw).toBe("L");
    expect(shape.points).toBe(5); // T_SHIRT_TO_POINTS["L"] === 5
  });

  it("Native numeric story-points: passes through unchanged", () => {
    const row = {
      id: 1,
      project_id: 1,
      subject: "x",
      description: "",
      type_id: 1,
      sp_value: "5",
      sp_label: null,
    };
    const shape = mapWorkPackageRow(row, sharedLookups, authzAdmin);
    expect(shape.points).toBe(5);
    expect(shape.pointsRaw).toBe("5");
  });
});
