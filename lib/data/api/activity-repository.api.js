import "server-only";
import { opFetch } from "@/lib/openproject/client";
import {
  buildCommentBody,
  elementsOf,
  mapActivity,
  mapUser,
} from "@/lib/openproject/mappers";
import { nativeId } from "@/lib/openproject/route-utils";
import { makeCache } from "@/lib/openproject/route-cache";

// 1-hour TTL + 500-entry LRU. Previously a plain Map with only LRU eviction,
// meaning stale user names/avatars would persist indefinitely until eviction.
const userCache = makeCache({ ttlMs: 60 * 60_000, maxEntries: 500 });

async function resolveUser(userId) {
  if (!userId) return null;
  const hit = userCache.get(userId);
  if (hit !== undefined) return hit;
  let mapped;
  try {
    mapped = mapUser(await opFetch(`/users/${userId}`));
  } catch {
    mapped = null;
  }
  userCache.set(userId, mapped);
  return mapped;
}

export async function list(_ctx, { workPackageId } = {}) {
  if (!workPackageId) throw new Error("workPackageId is required");
  const hal = await opFetch(
    `/work_packages/${nativeId(workPackageId)}/activities`,
  );
  const activities = elementsOf(hal).map(mapActivity);

  // Backfill missing author names — OP usually populates `_links.user.title`,
  // but some activity types and instance configs omit it.
  const missing = [
    ...new Set(
      activities.filter((a) => a.author && !a.authorName).map((a) => a.author),
    ),
  ];
  if (missing.length > 0) {
    const resolved = await Promise.all(missing.map(resolveUser));
    const byId = new Map();
    missing.forEach((uid, i) => byId.set(uid, resolved[i]));
    for (const a of activities) {
      if (!a.authorName && a.author) {
        const u = byId.get(a.author);
        if (u?.name) a.authorName = u.name;
      }
    }
  }
  return activities;
}

export async function create(_ctx, { workPackageId, text }) {
  if (!workPackageId) throw new Error("workPackageId is required");
  if (!text || !String(text).trim()) {
    throw new Error("Comment cannot be empty");
  }
  const a = await opFetch(
    `/work_packages/${nativeId(workPackageId)}/activities`,
    { method: "POST", body: JSON.stringify(buildCommentBody(text)) },
  );
  return mapActivity(a);
}
