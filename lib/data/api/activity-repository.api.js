import "server-only";
import { opFetch } from "@/lib/openproject/client";
import {
  buildCommentBody,
  elementsOf,
  mapActivity,
  mapUser,
} from "@/lib/openproject/mappers";
import { nativeId } from "@/lib/openproject/route-utils";

const USER_CACHE_MAX = 500;
const userCache = new Map();

async function resolveUser(userId) {
  if (!userId) return null;
  if (userCache.has(userId)) {
    const v = userCache.get(userId);
    userCache.delete(userId);
    userCache.set(userId, v);
    return v;
  }
  let mapped;
  try {
    mapped = mapUser(await opFetch(`/users/${userId}`));
  } catch {
    mapped = null;
  }
  userCache.set(userId, mapped);
  if (userCache.size > USER_CACHE_MAX) {
    userCache.delete(userCache.keys().next().value);
  }
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
