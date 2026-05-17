import "server-only";
// Short-lived in-process caches for route handlers that have no dedicated
// repository layer. Centralised here so the /lookups/cache DELETE endpoint
// can clear all of them in one import instead of importing from route files
// (which Next.js does not allow — route modules can't be imported by peers).
import { makeCache } from "./route-cache";

export const rolesCache           = makeCache({ ttlMs: 60 * 60_000 });        // 1 h — matches Redis TTL_REF_S
export const timeActivitiesCache  = makeCache({ ttlMs: 60 * 60_000 });        // 1 h
export const customOptionsCache   = makeCache({ ttlMs:  5 * 60_000 });        // 5 min
export const schemasCache         = makeCache({ ttlMs: 10 * 60_000 });        // 10 min
export const availableAssigneesCache = makeCache({ ttlMs: 15 * 60_000 });     // 15 min — matches Redis TTL_ASSIGNEES_S

export function clearEphemeralCaches() {
  rolesCache.clear();
  timeActivitiesCache.clear();
  customOptionsCache.clear();
  schemasCache.clear();
}

export function clearAssigneesLocalCache() {
  availableAssigneesCache.clear();
}
