import { opFetch } from "@/lib/openproject/client";
import { errorResponse } from "@/lib/openproject/route-utils";
import { mapUser } from "@/lib/openproject/mappers";

export const dynamic = "force-dynamic";

// GET /api/openproject/users/{id}
//
// Returns the basic identity card for a user (used by the profile page that
// mention links resolve to). We extend the standard `mapUser` shape with the
// few extra fields the profile page renders — email, login, status,
// createdAt — without touching `mapUser` itself, since that mapper is the
// minimum-surface shape used wherever user mentions/avatars appear.
export async function GET(_req, ctx) {
  try {
    const { id } = await ctx.params;
    const u = await opFetch(`/users/${encodeURIComponent(id)}`);
    const base = mapUser(u);
    if (!base) return Response.json(null);
    return Response.json({
      ...base,
      login: u.login || null,
      email: u.email || null,
      firstName: u.firstName || null,
      lastName: u.lastName || null,
      status: u.status || null,
      createdAt: u.createdAt || null,
      updatedAt: u.updatedAt || null,
      language: u.language || null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
