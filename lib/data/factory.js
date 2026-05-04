// Server-only repository factory.
//
// Phase 1 rule: writes always go through API repos regardless of mode, so
// OpenProject's journals, notifications, derived progress, and webhooks
// stay intact (see docs/data-layer.md).

import "server-only";
import { readDataSourceMode, isHybridMode } from "./config";
import { withRepoLog } from "./logging";

import * as apiTasks from "./api/task-repository.api";
import * as apiProjects from "./api/project-repository.api";
import * as apiSprints from "./api/sprint-repository.api";
import * as apiUsers from "./api/user-repository.api";
import * as apiLookups from "./api/lookup-repository.api";
import * as apiPermissions from "./api/permission-repository.api";
import * as apiActivities from "./api/activity-repository.api";
import * as apiAttachments from "./api/attachment-repository.api";
import * as apiMemberships from "./api/membership-repository.api";
import * as apiTimeEntries from "./api/time-entry-repository.api";
import * as apiQueries from "./api/query-repository.api";
import * as apiCategories from "./api/category-repository.api";

import * as dbTasks from "./db/task-repository.db";
import * as dbProjects from "./db/project-repository.db";
import * as dbSprints from "./db/sprint-repository.db";
import * as dbUsers from "./db/user-repository.db";
import * as dbLookups from "./db/lookup-repository.db";
import * as dbPermissions from "./db/permission-repository.db";
import * as dbActivities from "./db/activity-repository.db";
import * as dbAttachments from "./db/attachment-repository.db";
import * as dbMemberships from "./db/membership-repository.db";
import * as dbTimeEntries from "./db/time-entry-repository.db";
import * as dbQueries from "./db/query-repository.db";
import * as dbCategories from "./db/category-repository.db";

let cached;

// `[opira] mode=… entity=… op=… ms=…` logging in dev only. Tests run with
// NODE_ENV=test, which skips wrapping so identity-equality assertions
// still pass. OPIRA_LOG_DATA_REPO=1 force-enables in any environment.
const SHOULD_WRAP =
  process.env.NODE_ENV === "development" ||
  String(process.env.OPIRA_LOG_DATA_REPO || "").trim() === "1";

function wrap(entity, methods) {
  if (!SHOULD_WRAP) return methods;
  const out = {};
  for (const [op, fn] of Object.entries(methods)) {
    out[op] = (...args) => withRepoLog({ entity, op }, () => fn(...args));
  }
  return out;
}

// One row per entity: { read: [methods sourced from db in hybrid, api else],
// write: [methods always sourced from api], dbModule, apiModule }.
// Adding a new entity is a one-line edit.
const ENTITIES = [
  ["tasks",       { read: ["list", "findById"], write: { create: "create", update: "update", delete: "remove" }, db: dbTasks, api: apiTasks }],
  ["projects",    { read: ["list"], db: dbProjects, api: apiProjects }],
  ["sprints",     { read: ["list"], db: dbSprints, api: apiSprints }],
  ["users",       { read: ["list", "me"], db: dbUsers, api: apiUsers }],
  ["lookups",     { read: ["statuses", "types", "priorities"], db: dbLookups, api: apiLookups }],
  ["permissions", { read: ["viewer"], db: dbPermissions, api: apiPermissions }],
  ["activities",  { read: ["list"], write: { create: "create" }, db: dbActivities, api: apiActivities }],
  ["attachments", { read: ["list"], write: { create: "create" }, db: dbAttachments, api: apiAttachments }],
  ["memberships", { read: ["list"], write: { create: "create" }, db: dbMemberships, api: apiMemberships }],
  ["timeEntries", { read: ["list"], write: { create: "create" }, db: dbTimeEntries, api: apiTimeEntries }],
  ["queries",     { read: ["list"], write: { create: "create" }, db: dbQueries, api: apiQueries }],
  ["categories",  { read: ["list"], write: { create: "create" }, db: dbCategories, api: apiCategories }],
];

function buildBundle() {
  const mode = readDataSourceMode();
  const readSource = isHybridMode() ? "db" : "api";
  const bundle = { mode };
  for (const [name, spec] of ENTITIES) {
    const methods = {};
    for (const op of spec.read) methods[op] = spec[readSource][op];
    if (spec.write) {
      for (const [exposedAs, srcOp] of Object.entries(spec.write)) {
        methods[exposedAs] = spec.api[srcOp];
      }
    }
    bundle[name] = wrap(name, methods);
  }
  return bundle;
}

export function getRepositories() {
  if (!cached) cached = buildBundle();
  return cached;
}

// For tests that flip the mode mid-process.
export function resetRepositoriesForTesting() {
  cached = null;
}
