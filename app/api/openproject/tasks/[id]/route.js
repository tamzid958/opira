import { opFetch, opPatchWithLock } from "@/lib/openproject/client";
import { errorResponse, nativeId } from "@/lib/openproject/route-utils";
import { buildPatchBody, mapWorkPackage } from "@/lib/openproject/mappers";
import { loadLookups } from "@/lib/openproject/lookups";
import { htmlToMarkdown } from "@/lib/openproject/description";
import { resolveOptionForLabel, FIELD as SP_FIELD } from "@/lib/openproject/story-points";

export const dynamic = "force-dynamic";

export async function GET(_req, ctx) {
  try {
    const { id } = await ctx.params;
    const [wp, lookups] = await Promise.all([
      opFetch(`/work_packages/${nativeId(id)}`),
      loadLookups(),
    ]);
    return Response.json(mapWorkPackage(wp, lookups));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req, ctx) {
  try {
    const { id } = await ctx.params;
    await opFetch(`/work_packages/${nativeId(id)}`, { method: "DELETE" });
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}

// Use opPatchWithLock so the route auto-fetches lockVersion when missing
// and retries once on 409 LOCK_CONFLICT — required by the OP v3 spec.
//
// Story points are configurable as either a native numeric field
// (`storyPoints`) or a CustomOption field (`customFieldN`). The client
// only ever sends a numeric `points` value or a pre-resolved `pointsHref`;
// when the configured field is a CustomOption and the client only sent
// `points`, resolve the matching option's href from the WP schema before
// PATCHing — otherwise OpenProject rejects (or 500s on) a numeric write
// to a link-typed field.
export async function PATCH(req, ctx) {
  try {
    const { id } = await ctx.params;
    const patch = await req.json();
    const nid = nativeId(id);

    // The Tiptap editor emits HTML; OpenProject stores descriptions as
    // markdown. Convert before sending so OP doesn't render literal tags.
    if (patch.description != null) {
      patch.description = htmlToMarkdown(patch.description);
    }

    if (
      patch.points !== undefined &&
      patch.pointsHref === undefined &&
      SP_FIELD.startsWith("customField")
    ) {
      // Inspect the schema once to learn whether the configured custom field
      // is a CustomOption (link-typed) or a numeric/text field. Only resolve
      // an option href in the CustomOption case — for numeric custom fields
      // we leave `patch.points` alone and let buildPatchBody write it as-is.
      const cur = await opFetch(`/work_packages/${nid}`);
      const schemaPath = (cur._links?.schema?.href || "").replace(/^\/api\/v3/, "");
      if (schemaPath) {
        const schema = await opFetch(schemaPath);
        const isCustomOption = schema?.[SP_FIELD]?.type === "CustomOption";
        if (isCustomOption) {
          let pointsHref = null;
          if (patch.points != null) {
            const opt = await resolveOptionForLabel(schemaPath, SP_FIELD, patch.points);
            if (opt?.href) pointsHref = opt.href;
          }
          patch.pointsHref = pointsHref;
          delete patch.points;
        }
      }
    }

    const [wp, lookups] = await Promise.all([
      opPatchWithLock(`/work_packages/${nid}`, (lockVersion) =>
        buildPatchBody(patch, { lockVersion }),
      ),
      loadLookups(),
    ]);
    return Response.json(mapWorkPackage(wp, lookups));
  } catch (e) {
    return errorResponse(e);
  }
}
