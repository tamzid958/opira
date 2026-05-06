import { auth } from "@/auth";
import { vote, reveal, reset } from "@/lib/poker/room-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST actions for a poker room. Body:
//   { action: "vote", value: "M" | null }
//   { action: "reveal" }
//   { action: "reset" }
//
// `apply` is intentionally not an action here — applying the agreed
// estimate is a normal work-package PATCH from the client (`useUpdateTask`).
// After that PATCH succeeds the client posts `reset` so the room is ready
// for the next round.
//
// Returns 503 if the room-store is Redis-backed and Redis is unreachable;
// the client surfaces "Room offline" and the regular TShirtPicker keeps
// working.
export async function POST(req, { params }) {
  const session = await auth();
  if (!session?.user) {
    return Response.json(
      { error: "Unauthorized", code: "UNAUTHORIZED", status: 401 },
      { status: 401 },
    );
  }
  const userId = session.user.id || session.user.email;
  if (!userId) {
    return Response.json(
      { error: "Unauthorized", code: "UNAUTHORIZED", status: 401 },
      { status: 401 },
    );
  }

  const { roomId } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  let result;
  try {
    if (action === "vote") {
      result = await vote(roomId, userId, body?.value ?? null);
    } else if (action === "reveal") {
      result = await reveal(roomId);
    } else if (action === "reset") {
      result = await reset(roomId);
    } else {
      return Response.json(
        { error: "Unknown action", code: "BAD_ACTION", status: 400 },
        { status: 400 },
      );
    }
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[poker action] failed", action, e?.message || e);
    }
    return Response.json(
      {
        error: "Poker store unavailable",
        code: "STORE_UNAVAILABLE",
        status: 503,
      },
      { status: 503 },
    );
  }

  if (!result?.ok) {
    const code = (result?.error || "").toUpperCase().replace(/-/g, "_");
    return Response.json(
      { error: result?.error || "Action failed", code, status: 409 },
      { status: 409 },
    );
  }
  return Response.json({ ok: true });
}
