// Server-only AuthzContext builder.
//
// Every repository method takes an AuthzContext as its first arg so the impl
// can constrain queries to what the viewer is allowed to see. The shape is
// stable across modes; only the *source* differs (API memberships+roles vs
// SQL on members/role_permissions).

import "server-only";
import { auth } from "@/auth";
import { isHybridMode } from "@/lib/data/config";
import { fromApiPermissions } from "./api-source";
import { fromDbPermissions } from "./db-source";

/** @typedef {import("@/lib/data/ports").AuthzContext} AuthzContext */

const EMPTY_CTX = Object.freeze({
  userId: null,
  isAdmin: false,
  projectIds: [],
  permsByProject: new Map(),
});

/**
 * @returns {Promise<AuthzContext>}
 */
export async function buildAuthzContext() {
  const session = await auth();
  if (!session?.user?.id) return EMPTY_CTX;

  if (isHybridMode()) return fromDbPermissions(session);
  return fromApiPermissions(session);
}

