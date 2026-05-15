import "server-only";
import { isRedisEnabled, getCommandClient } from "@/lib/poker/redis-client";

const TTL_LOOKUPS_S = 30 * 60;
const TTL_SCHEMA_S  = 60 * 60;
const TTL_OPTIONS_S = 30 * 60;

const KEY_PREFIX = "opira:lookups";

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
