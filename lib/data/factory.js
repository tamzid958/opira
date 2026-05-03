// Server-only repository factory.
//
// Picks API or DB implementations from the OPIRA_DATA_SOURCE env var. Phase 1
// rule: writes always go through API repos regardless of mode, because DB
// writes require journal/notification replication that we deliberately do
// not implement (see docs/data-layer.md).

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

// Wraps repo methods with `[opira] mode=… entity=… op=… ms=…` logging in
// dev only — production stays quiet, tests use NODE_ENV=test and skip
// wrapping so identity-equality assertions still pass. Set
// OPIRA_LOG_DATA_REPO=1 to force-enable in any environment.
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

function buildBundle() {
  const mode = readDataSourceMode();
  // The `pg` module is required eagerly by the DB module graph, but the
  // singleton Pool inside lib/data/db/client.js is lazy — no connections
  // open until a DB repo method actually runs. In API mode, no DB repo is
  // ever invoked, so the cost is just the JS bytes (small).

  if (isHybridMode()) {
    return {
      mode,
      // DB reads, API writes (Phase 1).
      tasks: wrap("tasks", {
        list: dbTasks.list,
        findById: dbTasks.findById,
        create: apiTasks.create,
        update: apiTasks.update,
        delete: apiTasks.remove,
      }),
      projects: wrap("projects", { list: dbProjects.list }),
      sprints: wrap("sprints", { list: dbSprints.list }),
      users: wrap("users", { list: dbUsers.list, me: dbUsers.me }),
      lookups: wrap("lookups", {
        statuses: dbLookups.statuses,
        types: dbLookups.types,
        priorities: dbLookups.priorities,
      }),
      permissions: wrap("permissions", { viewer: dbPermissions.viewer }),
      activities: wrap("activities", { list: dbActivities.list, create: apiActivities.create }),
      attachments: wrap("attachments", { list: dbAttachments.list, create: apiAttachments.create }),
      memberships: wrap("memberships", { list: dbMemberships.list, create: apiMemberships.create }),
      timeEntries: wrap("timeEntries", { list: dbTimeEntries.list, create: apiTimeEntries.create }),
      queries: wrap("queries", { list: dbQueries.list, create: apiQueries.create }),
      categories: wrap("categories", { list: dbCategories.list, create: apiCategories.create }),
    };
  }

  return {
    mode,
    tasks: wrap("tasks", {
      list: apiTasks.list,
      findById: apiTasks.findById,
      create: apiTasks.create,
      update: apiTasks.update,
      delete: apiTasks.remove,
    }),
    projects: wrap("projects", { list: apiProjects.list }),
    sprints: wrap("sprints", { list: apiSprints.list }),
    users: wrap("users", { list: apiUsers.list, me: apiUsers.me }),
    lookups: wrap("lookups", {
      statuses: apiLookups.statuses,
      types: apiLookups.types,
      priorities: apiLookups.priorities,
    }),
    permissions: wrap("permissions", { viewer: apiPermissions.viewer }),
    activities: wrap("activities", { list: apiActivities.list, create: apiActivities.create }),
    attachments: wrap("attachments", { list: apiAttachments.list, create: apiAttachments.create }),
    memberships: wrap("memberships", { list: apiMemberships.list, create: apiMemberships.create }),
    timeEntries: wrap("timeEntries", { list: apiTimeEntries.list, create: apiTimeEntries.create }),
    queries: wrap("queries", { list: apiQueries.list, create: apiQueries.create }),
    categories: wrap("categories", { list: apiCategories.list, create: apiCategories.create }),
  };
}

export function getRepositories() {
  if (!cached) cached = buildBundle();
  return cached;
}

// For tests that flip the mode mid-process.
export function resetRepositoriesForTesting() {
  cached = null;
}
