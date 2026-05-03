// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ORIGINAL = process.env.OPIRA_DATA_SOURCE;

// Mock every repo module with sentinel functions so the factory test
// doesn't transitively load next-auth or `pg`. We only care that the
// factory wires the right sentinels into the bundle for each mode.
const apiSentinels = {
  tasksList: vi.fn(),
  tasksFindById: vi.fn(),
  tasksCreate: vi.fn(),
  tasksUpdate: vi.fn(),
  tasksRemove: vi.fn(),
  projectsList: vi.fn(),
  sprintsList: vi.fn(),
  usersList: vi.fn(),
  usersMe: vi.fn(),
  lookupsStatuses: vi.fn(),
  lookupsTypes: vi.fn(),
  lookupsPriorities: vi.fn(),
  permsViewer: vi.fn(),
};
const dbSentinels = {
  tasksList: vi.fn(),
  tasksFindById: vi.fn(),
  projectsList: vi.fn(),
  sprintsList: vi.fn(),
  usersList: vi.fn(),
  usersMe: vi.fn(),
  lookupsStatuses: vi.fn(),
  lookupsTypes: vi.fn(),
  lookupsPriorities: vi.fn(),
  permsViewer: vi.fn(),
};

vi.mock("./api/task-repository.api", () => ({
  list: apiSentinels.tasksList,
  findById: apiSentinels.tasksFindById,
  create: apiSentinels.tasksCreate,
  update: apiSentinels.tasksUpdate,
  remove: apiSentinels.tasksRemove,
}));
vi.mock("./api/project-repository.api", () => ({ list: apiSentinels.projectsList }));
vi.mock("./api/sprint-repository.api", () => ({ list: apiSentinels.sprintsList }));
vi.mock("./api/user-repository.api", () => ({
  list: apiSentinels.usersList,
  me: apiSentinels.usersMe,
}));
vi.mock("./api/lookup-repository.api", () => ({
  statuses: apiSentinels.lookupsStatuses,
  types: apiSentinels.lookupsTypes,
  priorities: apiSentinels.lookupsPriorities,
}));
vi.mock("./api/permission-repository.api", () => ({ viewer: apiSentinels.permsViewer }));
// Track A repos: stub list+create on each so the factory can wire them.
const stubListCreate = () => ({ list: vi.fn(), create: vi.fn() });
vi.mock("./api/activity-repository.api", () => stubListCreate());
vi.mock("./api/attachment-repository.api", () => stubListCreate());
vi.mock("./api/membership-repository.api", () => stubListCreate());
vi.mock("./api/time-entry-repository.api", () => stubListCreate());
vi.mock("./api/query-repository.api", () => stubListCreate());
vi.mock("./api/category-repository.api", () => stubListCreate());
vi.mock("./db/activity-repository.db", () => ({ list: vi.fn() }));
vi.mock("./db/attachment-repository.db", () => ({ list: vi.fn() }));
vi.mock("./db/membership-repository.db", () => ({ list: vi.fn() }));
vi.mock("./db/time-entry-repository.db", () => ({ list: vi.fn() }));
vi.mock("./db/query-repository.db", () => ({ list: vi.fn() }));
vi.mock("./db/category-repository.db", () => ({ list: vi.fn() }));
vi.mock("./db/task-repository.db", () => ({
  list: dbSentinels.tasksList,
  findById: dbSentinels.tasksFindById,
}));
vi.mock("./db/project-repository.db", () => ({ list: dbSentinels.projectsList }));
vi.mock("./db/sprint-repository.db", () => ({ list: dbSentinels.sprintsList }));
vi.mock("./db/user-repository.db", () => ({
  list: dbSentinels.usersList,
  me: dbSentinels.usersMe,
}));
vi.mock("./db/lookup-repository.db", () => ({
  statuses: dbSentinels.lookupsStatuses,
  types: dbSentinels.lookupsTypes,
  priorities: dbSentinels.lookupsPriorities,
}));
vi.mock("./db/permission-repository.db", () => ({ viewer: dbSentinels.permsViewer }));

beforeEach(() => {
  delete process.env.OPIRA_DATA_SOURCE;
  vi.resetModules();
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.OPIRA_DATA_SOURCE;
  else process.env.OPIRA_DATA_SOURCE = ORIGINAL;
});

describe("getRepositories", () => {
  it("returns API bundle by default", async () => {
    const { getRepositories } = await import("./factory.js");
    const repos = getRepositories();
    expect(repos.mode).toBe("api");
    expect(repos.tasks.list).toBe(apiSentinels.tasksList);
    expect(repos.projects.list).toBe(apiSentinels.projectsList);
    expect(repos.users.me).toBe(apiSentinels.usersMe);
    expect(repos.permissions.viewer).toBe(apiSentinels.permsViewer);
  });

  it("legacy 'db' value falls back to 'api' bundle", async () => {
    process.env.OPIRA_DATA_SOURCE = "db";
    const { getRepositories } = await import("./factory.js");
    const repos = getRepositories();
    expect(repos.mode).toBe("api");
    expect(repos.tasks.list).toBe(apiSentinels.tasksList);
  });

  it("hybrid mode: DB reads, API writes (Phase 1 stance)", async () => {
    process.env.OPIRA_DATA_SOURCE = "hybrid";
    const { getRepositories } = await import("./factory.js");
    const repos = getRepositories();
    expect(repos.mode).toBe("hybrid");
    expect(repos.tasks.list).toBe(dbSentinels.tasksList);
    expect(repos.tasks.findById).toBe(dbSentinels.tasksFindById);
    expect(repos.projects.list).toBe(dbSentinels.projectsList);
    expect(repos.tasks.create).toBe(apiSentinels.tasksCreate);
    expect(repos.tasks.update).toBe(apiSentinels.tasksUpdate);
    expect(repos.tasks.delete).toBe(apiSentinels.tasksRemove);
  });

  it("hybrid mode wires every Track A repo (DB list, API create)", async () => {
    process.env.OPIRA_DATA_SOURCE = "hybrid";
    const { getRepositories } = await import("./factory.js");
    const repos = getRepositories();
    for (const key of [
      "activities",
      "attachments",
      "memberships",
      "timeEntries",
      "queries",
      "categories",
    ]) {
      expect(typeof repos[key].list).toBe("function");
      expect(typeof repos[key].create).toBe("function");
    }
  });
});
