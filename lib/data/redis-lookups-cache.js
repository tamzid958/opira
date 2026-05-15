import "server-only";
import { isRedisEnabled, getCommandClient } from "@/lib/poker/redis-client";

const TTL_LOOKUPS_S    = 30 * 24 * 60 * 60; // 30 days — statuses/types/priorities barely change
const TTL_SCHEMA_S     =  7 * 24 * 60 * 60; // 7 days
const TTL_OPTIONS_S    =  7 * 24 * 60 * 60; // 7 days
const TTL_SPRINTS_S    =       30 * 60;      // 30 min — invalidated on every version mutation
const TTL_REF_S        = 30 * 24 * 60 * 60; // 30 days — roles/time-entry-activities (admin-configured)
const TTL_ASSIGNEES_S  =       15 * 60;      // 15 min — invalidated on membership mutations
const TTL_CATEGORIES_S = 24 * 60 * 60;       // 1 day — invalidated on category mutations

const KEY_PREFIX           = "opira:lookups";
const SPRINT_KEY_PREFIX    = "opira:sprints";
const ASSIGNEES_KEY_PREFIX = "opira:assignees";
const CATEGORIES_KEY_PREFIX = "opira:categories";

/** @param {string} key @returns {Promise<any|undefined>} */
async function redisGet(key) {
  if (!isRedisEnabled()) return undefined;
  try {
    const raw = await getCommandClient().get(key);
    return raw == null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** @param {string} key @param {any} value @param {number} ttlSeconds @returns {Promise<void>} */
async function redisSet(key, value, ttlSeconds) {
  if (!isRedisEnabled()) return;
  try {
    await getCommandClient().set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // non-fatal: in-process cache serves as fallback
  }
}

function statusesKey()          { return `${KEY_PREFIX}:statuses`; }
function typesKey(pid)          { return pid ? `${KEY_PREFIX}:types:${pid}` : `${KEY_PREFIX}:types:__global__`; }
function prioritiesKey()        { return `${KEY_PREFIX}:priorities`; }
function schemaKey(schema)      { return `${KEY_PREFIX}:schema:${schema}`; }
function customOptionsKey(href) { return `${KEY_PREFIX}:custom-options:${encodeURIComponent(href)}`; }

export async function getCachedStatuses()              { return redisGet(statusesKey()); }
export async function setCachedStatuses(v)             { return redisSet(statusesKey(), v, TTL_LOOKUPS_S); }

export async function getCachedTypes(projectId)        { return redisGet(typesKey(projectId)); }
export async function setCachedTypes(projectId, v)     { return redisSet(typesKey(projectId), v, TTL_LOOKUPS_S); }

export async function getCachedPriorities()            { return redisGet(prioritiesKey()); }
export async function setCachedPriorities(v)           { return redisSet(prioritiesKey(), v, TTL_LOOKUPS_S); }

export async function getCachedSchema(schema)          { return redisGet(schemaKey(schema)); }
export async function setCachedSchema(schema, v)       { return redisSet(schemaKey(schema), v, TTL_SCHEMA_S); }

export async function getCachedCustomOptions(href)     { return redisGet(customOptionsKey(href)); }
export async function setCachedCustomOptions(href, v)  { return redisSet(customOptionsKey(href), v, TTL_OPTIONS_S); }

function rolesKey()                 { return `${KEY_PREFIX}:roles`; }
function timeActivitiesKey()        { return `${KEY_PREFIX}:time-entry-activities`; }
function assigneesKey(pid)          { return `${ASSIGNEES_KEY_PREFIX}:${pid}`; }
function categoriesKey(pid)         { return `${CATEGORIES_KEY_PREFIX}:${pid}`; }
function sprintsKey(pid)            { return pid ? `${SPRINT_KEY_PREFIX}:${pid}` : `${SPRINT_KEY_PREFIX}:__global__`; }

export async function getCachedRoles()                       { return redisGet(rolesKey()); }
export async function setCachedRoles(v)                      { return redisSet(rolesKey(), v, TTL_REF_S); }

export async function getCachedTimeActivities()              { return redisGet(timeActivitiesKey()); }
export async function setCachedTimeActivities(v)             { return redisSet(timeActivitiesKey(), v, TTL_REF_S); }

export async function getCachedAssignees(projectId)          { return redisGet(assigneesKey(projectId)); }
export async function setCachedAssignees(projectId, v)       { return redisSet(assigneesKey(projectId), v, TTL_ASSIGNEES_S); }
export async function flushAssigneesCache() {
  if (!isRedisEnabled()) return { deleted: 0 };
  const redis = getCommandClient();
  try {
    const keys = await redis.keys(`${ASSIGNEES_KEY_PREFIX}:*`);
    if (keys.length === 0) return { deleted: 0 };
    const pipeline = redis.pipeline();
    for (const k of keys) pipeline.del(k);
    await pipeline.exec();
    return { deleted: keys.length };
  } catch {
    return { deleted: 0 };
  }
}

export async function getCachedCategories(projectId)         { return redisGet(categoriesKey(projectId)); }
export async function setCachedCategories(projectId, v)      { return redisSet(categoriesKey(projectId), v, TTL_CATEGORIES_S); }
export async function flushCategoriesCache(projectId) {
  if (!isRedisEnabled()) return { deleted: 0 };
  const redis = getCommandClient();
  try {
    if (projectId) {
      await redis.del(categoriesKey(projectId));
      return { deleted: 1 };
    }
    const keys = await redis.keys(`${CATEGORIES_KEY_PREFIX}:*`);
    if (keys.length === 0) return { deleted: 0 };
    const pipeline = redis.pipeline();
    for (const k of keys) pipeline.del(k);
    await pipeline.exec();
    return { deleted: keys.length };
  } catch {
    return { deleted: 0 };
  }
}

export async function getCachedSprints(projectId)        { return redisGet(sprintsKey(projectId)); }
export async function setCachedSprints(projectId, v)     { return redisSet(sprintsKey(projectId), v, TTL_SPRINTS_S); }

export async function flushSprintCache() {
  if (!isRedisEnabled()) return { deleted: 0 };
  const redis = getCommandClient();
  try {
    const keys = await redis.keys(`${SPRINT_KEY_PREFIX}:*`);
    if (keys.length === 0) return { deleted: 0 };
    const pipeline = redis.pipeline();
    for (const k of keys) pipeline.del(k);
    await pipeline.exec();
    return { deleted: keys.length };
  } catch (e) {
    return { deleted: 0, error: String(e) };
  }
}

export async function flushLookupCache() {
  if (!isRedisEnabled()) return { deleted: 0 };
  const redis = getCommandClient();
  try {
    const keys = await redis.keys(`${KEY_PREFIX}:*`);
    if (keys.length === 0) return { deleted: 0 };
    const pipeline = redis.pipeline();
    for (const k of keys) pipeline.del(k);
    await pipeline.exec();
    return { deleted: keys.length };
  } catch (e) {
    return { deleted: 0, error: String(e) };
  }
}
