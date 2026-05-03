import { errorResponse } from "@/lib/openproject/route-utils";
import { getRepositories } from "@/lib/data/factory";
import { buildAuthzContext } from "@/lib/data/authz/context";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await buildAuthzContext();
    const { users: repo } = getRepositories();
    const result = await repo.me(ctx);
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
