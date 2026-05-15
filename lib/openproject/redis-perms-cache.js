import "server-only";
import { isRedisEnabled, getCommandClient } from "@/lib/poker/redis-client";

const TTL_S = 10 * 60;
const KEY_PREFIX = "opira:perms";

function key(userId) {
  return `${KEY_PREFIX}:${userId}`;
}

export async function getCachedPerms(userId) {
  if (!isRedisEnabled()) return undefined;
  try {
    const raw = await getCommandClient().get(key(userId));
    return raw == null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export async function setCachedPerms(userId, value) {
  if (!isRedisEnabled()) return;
  try {
    await getCommandClient().set(key(userId), JSON.stringify(value), "EX", TTL_S);
  } catch {
    // non-fatal: in-process cache serves as fallback
  }
}

export async function deleteCachedPerms(userId) {
  if (!isRedisEnabled()) return;
  try {
    if (userId) {
      await getCommandClient().del(key(userId));
    } else {
      const keys = await getCommandClient().keys(`${KEY_PREFIX}:*`);
      if (keys.length) await getCommandClient().del(...keys);
    }
  } catch {
    // non-fatal
  }
}
