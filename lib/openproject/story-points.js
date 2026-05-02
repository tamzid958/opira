// Story-point handling.
//
// On many OpenProject instances the team uses a CustomOption field (typically
// "customField7" / "Size") with t-shirt values (S, M, L, XL). Other instances
// use the native numeric `storyPoints` field. NEXT_PUBLIC_OPENPROJECT_STORY_POINTS_FIELD
// chooses which one we read & write — `NEXT_PUBLIC_` so the same value is
// available to client components (the estimate UI) without a duplicate var.

import { fetchAllPages, opFetch } from "./client";
import { makeCache } from "./route-cache";
export { T_SHIRT_TO_POINTS, T_SHIRT_ORDER } from "./story-points-constants";

export const FIELD =
  process.env.NEXT_PUBLIC_OPENPROJECT_STORY_POINTS_FIELD || "storyPoints";

// Schemas + their allowedValues collections change on the order of months.
// 10-minute TTL is plenty for typical sessions.
const OPTION_CACHE = makeCache({ ttlMs: 10 * 60 * 1000 });

// Pull options out of one custom-field schema entry. OP's HAL exposes the
// option set in three shapes: `_embedded.allowedValues` (full resources),
// `_links.allowedValues` as an array of `{href, title}` (form endpoint), or
// a single `_links.allowedValues.href` pointing at a paginated collection.
async function readOptions(field) {
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
  if (linkVal?.href) {
    const els = await fetchAllPages(linkVal.href.replace(/^\/api\/v3/, ""));
    return els.map((o) => ({
      id: String(o.id),
      value: o.value,
      href: o._links?.self?.href,
    }));
  }
  return null;
}

// Returns the array of allowedValues `[{id, value, href}]` for a CustomOption
// field, or null if the field isn't a CustomOption / has no allowed values.
// Tries the schema GET first; if it doesn't carry the options, falls through
// to `POST /work_packages/form` (OP's own UI does the same — some installs
// only populate allowedValues there). No WP-scan: if neither endpoint
// exposes options, returns null.
export async function loadAllowedOptions(schemaPath, fieldKey) {
  const cacheKey = `${schemaPath}::${fieldKey}`;
  const cached = OPTION_CACHE.get(cacheKey);
  if (cached !== undefined) return cached;

  const schema = await opFetch(schemaPath);
  const field = schema?.[fieldKey];
  if (!field) {
    OPTION_CACHE.set(cacheKey, null);
    return null;
  }
  let options = await readOptions(field);
  if (!options) {
    const match = schemaPath.match(/\/schemas\/(\d+)-(\d+)/);
    if (match) {
      const [, projectId, typeId] = match;
      const form = await opFetch("/work_packages/form", {
        method: "POST",
        body: JSON.stringify({
          _links: {
            project: { href: `/api/v3/projects/${projectId}` },
            type: { href: `/api/v3/types/${typeId}` },
          },
        }),
      }).catch(() => null);
      const formField = form?._embedded?.schema?.[fieldKey];
      options = await readOptions(formField);
    }
  }
  OPTION_CACHE.set(cacheKey, options);
  return options;
}

// Resolve a t-shirt label (or numeric string) to the matching custom-option
// `{id, href}` for a given schema. Returns null if no match.
//
// Accepts either a t-shirt label ("S"/"M"/"L"/...) or a Fibonacci number
// (1/2/3/5/8/13). When given a number that maps to a t-shirt size via
// T_SHIRT_TO_POINTS, falls back to the matching size — so a numeric input
// from the legacy <InlineSelect> still finds the right option on a
// t-shirt-style custom field.
export async function resolveOptionForLabel(schemaPath, fieldKey, label) {
  if (label == null) return null;
  const opts = await loadAllowedOptions(schemaPath, fieldKey);
  if (!opts) return null;
  const target = String(label).toUpperCase().trim();
  // Direct match (case-insensitive value equality).
  const direct =
    opts.find((o) => String(o.value).toUpperCase() === target) ||
    opts.find((o) => String(o.value) === String(label));
  if (direct) return direct;
  // Numeric → t-shirt fallback (e.g. 5 → "L").
  const asNumber = Number(label);
  if (!Number.isNaN(asNumber)) {
    const { T_SHIRT_TO_POINTS } = await import("./story-points-constants.js");
    const tshirt = Object.entries(T_SHIRT_TO_POINTS).find(([, n]) => n === asNumber)?.[0];
    if (tshirt) {
      return (
        opts.find((o) => String(o.value).toUpperCase() === tshirt) || null
      );
    }
  }
  return null;
}
