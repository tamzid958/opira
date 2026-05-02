import { opFetch } from "@/lib/openproject/client";
import { makeCache } from "@/lib/openproject/route-cache";
import { errorResponse } from "@/lib/openproject/route-utils";

export const dynamic = "force-dynamic";

const CACHE = makeCache({ ttlMs: 10 * 60 * 1000 });

// Pull a `[{id, value, href}]` list out of one custom-field schema entry.
// OP's HAL exposes the option set in three different shapes depending on the
// install / endpoint: an `_embedded.allowedValues` array of full resources,
// a `_links.allowedValues` array of `{href, title}` link objects (the form
// endpoint uses this), or a single `_links.allowedValues.href` pointing at
// a paginated collection.
function readAllowedValues(field) {
  if (!field) return null;
  const embedded = field._embedded?.allowedValues;
  if (Array.isArray(embedded) && embedded.length > 0) {
    return embedded.map((o) => ({
      id: String(o.id),
      value: o.value,
      href: o._links?.self?.href,
    }));
  }
  const linkVal = field._links?.allowedValues;
  if (Array.isArray(linkVal) && linkVal.length > 0) {
    return linkVal
      .filter((l) => l?.href)
      .map((l) => ({
        id: String(l.href.split("/").pop()),
        value: l.title,
        href: l.href,
      }));
  }
  return null;
}

// Returns the WP schema's custom-field metadata in a UI-friendly shape.
// Strips the verbose HAL crud and exposes allowedValues hrefs so callers can
// resolve labels (S/M/L/XL) to option IDs without re-traversing HAL.
//
// OP's `GET /work_packages/schemas/<projectId>-<typeId>` is supposed to carry
// allowedValues for every CustomOption field, but several installs (verified
// against this one) leave `_links.allowedValues` and `_embedded.allowedValues`
// empty on the schema GET. The same data lives on the form endpoint
// (`POST /work_packages/form` with `{project, type}`), which is what OP's own
// UI uses. We fan both calls out in parallel and merge so the picker is
// populated regardless of which endpoint your OP install fills.
export async function GET(_req, ctx) {
  try {
    const { schema } = await ctx.params;
    const cached = CACHE.get(schema);
    if (cached) return Response.json(cached);

    const [projectId, typeId] = String(schema).split("-");

    const formBody = projectId && typeId
      ? JSON.stringify({
          _links: {
            project: { href: `/api/v3/projects/${projectId}` },
            type: { href: `/api/v3/types/${typeId}` },
          },
        })
      : null;

    const [s, formS] = await Promise.all([
      opFetch(`/work_packages/schemas/${schema}`),
      formBody
        ? opFetch("/work_packages/form", {
            method: "POST",
            body: formBody,
          })
            .then((r) => r?._embedded?.schema || null)
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    const fields = {};
    for (const k of Object.keys(s).filter((key) => key.startsWith("customField"))) {
      const f = s[k];
      const formField = formS?.[k];
      // Schema GET first, then merge in the form's options when the schema
      // didn't carry any. Both paths produce the same `[{id, value, href}]`
      // shape via `readAllowedValues`.
      const allowed =
        readAllowedValues(f) ?? readAllowedValues(formField) ?? null;
      fields[k] = {
        name: f.name,
        type: f.type,
        required: !!f.required,
        allowedValuesHref:
          f._links?.allowedValues?.href ||
          (typeof formField?._links?.allowedValues?.href === "string"
            ? formField._links.allowedValues.href
            : null),
        allowedValues: allowed,
      };
    }
    const value = { schema, fields };
    CACHE.set(schema, value);
    return Response.json(value);
  } catch (e) {
    return errorResponse(e);
  }
}
