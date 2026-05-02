// HAL+JSON → prototype shape mappers.
// The prototype components were built around a flat shape (see lib/data.js);
// these functions translate OpenProject's HAL responses into that shape so
// no component code has to change when the data source switches.

import { fromIsoDuration } from "./duration";
import { T_SHIRT_TO_POINTS } from "./story-points-constants";
import { findById as findInArray } from "@/lib/utils";

// Build a stable `Map<id, record>` index over a mapped resource list.
// Used by list-mapping call sites (tasks routes) so the per-WP join stays
// O(1) regardless of list size.
export function indexById(list) {
  const m = new Map();
  for (const item of list || []) {
    if (item?.id != null) m.set(String(item.id), item);
  }
  return m;
}

const PALETTE = ["#2563eb", "#7c3aed", "#0891b2", "#db2777", "#16a34a", "#ea580c", "#0d9488", "#b91c1c", "#f97316"];

export function hashIndex(s, mod) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % mod;
}

function colorFor(seed) {
  return PALETTE[hashIndex(String(seed || ""), PALETTE.length)];
}

export function initialsOf(name) {
  if (!name) return "?";
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

export function idFromHref(href) {
  if (!href) return null;
  const m = String(href).match(/\/(\d+|[\w-]+)\/?$/);
  return m ? m[1] : null;
}

export function linkTitle(link) {
  const t = link?.title;
  if (typeof t !== "string") return t ?? null;
  const trimmed = t.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// HAL responses include only those `_links` for actions the current user
// can perform on the resource — so checking link presence is the canonical
// way to mirror OpenProject's per-resource permission decisions.
function hasLink(links, name) {
  return !!(links && links[name]);
}

// ── Entities ──────────────────────────────────────────────────────────────

export function mapUser(opUser) {
  if (!opUser) return null;
  const id = String(opUser.id);
  const name = opUser.name || [opUser.firstName, opUser.lastName].filter(Boolean).join(" ") || opUser.login || id;
  return {
    id,
    name,
    initials: initialsOf(name),
    color: colorFor(id),
    // Always proxy through our route so the browser can load the image
    // without needing the OpenProject session cookie or bearer token.
    avatar: `/api/openproject/users/${id}/avatar`,
  };
}

export function mapProject(p) {
  const identifier = p.identifier || String(p.id);
  const links = p._links || {};
  return {
    id: identifier,
    key: (identifier.match(/[A-Za-z]/g) || [identifier[0]]).slice(0, 2).join("").toUpperCase() || "PR",
    name: p.name,
    color: colorFor(identifier),
    desc: p.description?.raw || "",
    lead: idFromHref(p._links?.responsible?.href),
    open: 0,
    sprint: linkTitle(p._links?.defaultVersion) || "—",
    progress: 0,
    permissions: {
      update: hasLink(links, "update") || hasLink(links, "updateImmediately"),
      delete: hasLink(links, "delete"),
      addWorkPackages: hasLink(links, "createWorkPackage") || hasLink(links, "workPackages"),
      manageVersions: hasLink(links, "versions") || hasLink(links, "createVersion"),
      manageCategories: hasLink(links, "categories"),
      manageMembers: hasLink(links, "memberships"),
    },
  };
}

function dayDiff(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  // Use UTC midnight to avoid timezone-induced off-by-ones.
  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

export function mapVersionToSprint(v) {
  // Total span (inclusive) and days elapsed since start, computed from the
  // real version dates. Falls back to nulls when either bound is missing —
  // the UI omits "day X of Y" copy in that case rather than showing dummy
  // numbers.
  const startIso = v.startDate || null;
  const endIso = v.endDate || null;
  const todayIso = new Date().toISOString().slice(0, 10);
  let days = null;
  let dayIn = null;
  if (startIso && endIso) {
    const total = dayDiff(startIso, endIso);
    if (total != null) days = total + 1;
    const elapsed = dayDiff(startIso, todayIso);
    if (elapsed != null && days != null) {
      dayIn = Math.max(0, Math.min(days, elapsed + 1));
    }
  }
  // OpenProject versions have three native status values per the v3 spec:
  // `open` (accepting changes), `locked` (running, no edits), `closed`
  // (finished). We surface the raw status for UI badges + lock/unlock/
  // reopen actions, *and* a derived `state` ("planned" | "active" |
  // "closed") that drives the backlog/board flow chrome:
  //   - planned: status=open, kickoff hasn't happened yet (no start date,
  //     or start date is still in the future). Offer "Start sprint".
  //   - active:  status=open|locked, kickoff has happened. Show day counter.
  //   - closed:  status=closed. Archive look, offer "Reopen".
  const status = v.status || "open";
  let state;
  if (status === "closed") {
    state = "closed";
  } else if (status === "open" && (!startIso || startIso > todayIso)) {
    state = "planned";
  } else {
    state = "active";
  }
  return {
    id: String(v.id),
    name: v.name,
    state,
    status,
    start: startIso || "—",
    end: endIso || "—",
    goal: v.description?.raw || "",
    days,
    dayIn,
  };
}

export function mapStatus(s) {
  return {
    id: String(s.id),
    name: s.name,
    isClosed: !!s.isClosed,
    color: s.color || null,
    position: typeof s.position === "number" ? s.position : null,
    isDefault: !!s.isDefault,
    isReadonly: !!s.isReadonly,
  };
}

export function mapType(t) {
  return {
    id: String(t.id),
    name: t.name,
    position: typeof t.position === "number" ? t.position : null,
    color: t.color || null,
    isDefault: !!t.isDefault,
  };
}

export function mapPriority(p) {
  return {
    id: String(p.id),
    name: p.name,
    position: typeof p.position === "number" ? p.position : null,
    color: p.color || null,
    isDefault: !!p.isDefault,
  };
}

// ── Work packages ─────────────────────────────────────────────────────────

const STORY_POINTS_FIELD =
  process.env.NEXT_PUBLIC_OPENPROJECT_STORY_POINTS_FIELD || "storyPoints";

// Canonical t-shirt → numeric mapping lives in story-points-constants.js
// so client + server share the exact same map. Imported above.

function parseStoryPointValue(raw) {
  if (raw == null) return null;
  if (typeof raw === "number" && !Number.isNaN(raw)) return raw;
  const str = String(raw).trim();
  if (!str) return null;
  const upper = str.toUpperCase();
  if (T_SHIRT_TO_POINTS[upper] != null) return T_SHIRT_TO_POINTS[upper];
  const n = Number(str);
  return Number.isNaN(n) ? null : n;
}

// Inverse mapping for the t-shirt label when only the numeric points are
// available. Used as a last resort when OP returns a HAL link for the
// configured field but omits the human title.
function tshirtLabelForPoints(n) {
  if (n == null) return null;
  for (const [label, pts] of Object.entries(T_SHIRT_TO_POINTS)) {
    if (pts === n) return label;
  }
  return null;
}

// Debug dump of the story-points-relevant pieces of a WP. Helps diagnose
// installs where the configured field surfaces in an unexpected shape.
// JSON-stringified into the log line so next/dev's logger doesn't swallow
// the structured payload. Samples the first 3 WPs (one might be a header
// / dummy with no fields set).
let _spDebugCount = 0;
function debugStoryPointShape(wp) {
  if (process.env.NODE_ENV === "production") return;
  if (_spDebugCount >= 3) return;
  _spDebugCount += 1;
  const linkKeys = Object.keys(wp._links || {}).filter((k) =>
    /custom|story|point/i.test(k),
  );
  const bodyKeys = Object.keys(wp).filter((k) =>
    /custom|story|point/i.test(k),
  );
  const payload = {
    wpId: wp.id,
    subject: wp.subject,
    configuredField: STORY_POINTS_FIELD,
    bodyValue: wp[STORY_POINTS_FIELD],
    linkValue: wp._links?.[STORY_POINTS_FIELD],
    allLinkKeys: Object.keys(wp._links || {}),
    allBodyKeysWithValues: Object.fromEntries(
      Object.keys(wp)
        .filter((k) => !k.startsWith("_"))
        .map((k) => [k, wp[k]])
        .filter(([, v]) => v != null && (typeof v === "string" || typeof v === "number" || typeof v === "boolean")),
    ),
    matchingBodyKeys: Object.fromEntries(bodyKeys.map((k) => [k, wp[k]])),
    matchingLinkKeys: Object.fromEntries(linkKeys.map((k) => [k, wp._links[k]])),
  };
  console.log(
    `[story-points] WP ${_spDebugCount}/3 field shape:\n${JSON.stringify(payload, null, 2)}`,
  );
}

// Try every realistic shape OpenProject might return the configured field
// as: HAL link with .title, HAL link with .name, embedded object with
// .value, top-level primitive. Returns the natural label/value (a string
// like "L" or a number like 5) or null if nothing's set.
function readStoryPointsRaw(wp) {
  // 1. HAL link — CustomOption / User / Version-style CFs. Title carries
  //    the human label ("L" / "M" / "XL").
  const link = wp._links?.[STORY_POINTS_FIELD];
  if (link) {
    const title = linkTitle(link);
    if (title != null) return title;
    if (typeof link.name === "string" && link.name.trim()) return link.name.trim();
  }
  // 2. _embedded — some OP installs ship the resolved option here.
  const embedded = wp._embedded?.[STORY_POINTS_FIELD];
  if (embedded != null) {
    if (typeof embedded === "string" || typeof embedded === "number") return embedded;
    if (typeof embedded.value === "string" && embedded.value.trim()) return embedded.value.trim();
    if (typeof embedded.name === "string" && embedded.name.trim()) return embedded.name.trim();
  }
  // 3. Top-level primitive — native `storyPoints` numeric, or a numeric CF.
  const top = wp[STORY_POINTS_FIELD];
  if (top != null) {
    if (typeof top === "string" || typeof top === "number") return top;
    if (typeof top === "object") {
      if (typeof top.value === "string" && top.value.trim()) return top.value.trim();
      if (typeof top.name === "string" && top.name.trim()) return top.name.trim();
    }
  }
  return null;
}

function pickStoryPoints(wp) {
  debugStoryPointShape(wp);
  const raw = readStoryPointsRaw(wp);
  return parseStoryPointValue(raw);
}

// Resolve the display label for the story-points field. Prefer the natural
// raw label OP gave us; if the configured field is a HAL link (CustomOption)
// but came back without a human title, reverse-map the numeric points to
// a t-shirt size so the chip still reads "L" instead of "5". Numeric fields
// (no link) keep returning the numeric.
function resolveStoryPointsRaw(wp, points) {
  const raw = readStoryPointsRaw(wp);
  if (raw != null && raw !== "") return raw;
  const link = wp._links?.[STORY_POINTS_FIELD];
  if (link?.href) {
    const tshirt = tshirtLabelForPoints(points);
    if (tshirt) return tshirt;
  }
  return null;
}

// `statuses`, `types`, `priorities` (mapped lists from the OP API) let the
// mapper resolve API-truth fields onto each task: `statusIsClosed`,
// `statusColor`, `typeColor`, `priorityColor`, `priorityPosition`,
// `priorityTotal`. Pass them when you want every consumer to read API truth
// without doing its own lookup; omit them to fall through with `null` for
// those fields.
//
// For list mappings, callers can also pass `lookupIndex: { statuses, types,
// priorities }` where each value is a `Map<id, record>` instead of an array.
// The list-route paths (tasks/route.js) build the indexes once per request
// to keep `mapWorkPackage` O(1) per WP.
export function mapWorkPackage(wp, opts = {}) {
  const { statuses, types, priorities, lookupIndex } = opts;
  const lookup = (kind, list, id) => {
    if (id == null) return null;
    const idx = lookupIndex?.[kind];
    if (idx) return idx.get(String(id)) || null;
    return findInArray(list, id);
  };
  const projectHref = wp._links?.project?.href;
  const statusName = linkTitle(wp._links?.status);
  const priorityName = linkTitle(wp._links?.priority);
  const typeName = linkTitle(wp._links?.type);
  // Per the OP v3 spec, a work package has at most ONE category, exposed
  // as `_links.category` (singular). We surface it through `labels` as a
  // 0-or-1 element array so the existing UI (TagPill rendering, filter
  // chip) keeps working unchanged. `categoryId` carries the bare id so
  // patch builders can target it directly.
  const categoryLink = wp._links?.category;
  const categoryHref = categoryLink?.href || null;
  const categoryId = idFromHref(categoryHref);
  const categoryName = linkTitle(categoryLink);
  const labels = categoryName ? [categoryName] : [];
  const points = pickStoryPoints(wp);
  const linkChildren = Array.isArray(wp._links?.children) ? wp._links.children : [];
  const embeddedChildren = Array.isArray(wp._embedded?.children) ? wp._embedded.children : [];
  const hasChildren = linkChildren.length > 0 || embeddedChildren.length > 0;
  const statusId = idFromHref(wp._links?.status?.href);
  const typeId = idFromHref(wp._links?.type?.href);
  const priorityId = idFromHref(wp._links?.priority?.href);
  const statusRecord = lookup("statuses", statuses, statusId);
  const typeRecord = lookup("types", types, typeId);
  const priorityRecord = lookup("priorities", priorities, priorityId);
  return {
    id: `wp-${wp.id}`,
    nativeId: wp.id,
    lockVersion: wp.lockVersion ?? 0,
    // OpenProject identifies work packages by numeric ID; the v3 API
    // doesn't expose a Jira-style "PROJ-123" key. Show the native id so
    // the UI matches what OP itself shows.
    key: `#${wp.id}`,
    typeId,
    typeName,
    typeColor: typeRecord?.color ?? null,
    title: (wp.subject || "").trim(),
    description: wp.description?.raw || "",
    descriptionHtml: wp.description?.html || "",
    descriptionFormat: wp.description?.format || "markdown",
    statusId,
    statusName,
    statusIsClosed: statusRecord ? !!statusRecord.isClosed : null,
    statusColor: statusRecord?.color ?? null,
    priorityId,
    priorityName,
    priorityColor: priorityRecord?.color ?? null,
    priorityPosition:
      typeof priorityRecord?.position === "number" ? priorityRecord.position : null,
    priorityTotal: Array.isArray(priorities) ? priorities.length : null,
    assignee: idFromHref(wp._links?.assignee?.href),
    assigneeName: linkTitle(wp._links?.assignee),
    reporter: idFromHref(wp._links?.author?.href),
    reporterName: linkTitle(wp._links?.author),
    points,
    pointsRaw: resolveStoryPointsRaw(wp, points),
    sprint: idFromHref(wp._links?.version?.href),
    sprintName: linkTitle(wp._links?.version),
    epic: idFromHref(wp._links?.parent?.href),
    epicName: linkTitle(wp._links?.parent),
    hasChildren,
    labels,
    categoryId,
    categoryName,
    comments: 0,
    attachments: 0,
    projectHref,
    schemaHref: wp._links?.schema?.href || null,
    createdAt: wp.createdAt || null,
    updatedAt: wp.updatedAt || null,
    startDate: wp.startDate || null,
    dueDate: wp.dueDate || null,
    duration: wp.duration || null,
    estimatedHours: fromIsoDuration(wp.estimatedTime),
    percentageDone: wp.percentageDone ?? null,
    childrenIds: embeddedChildren.map((c) => c.id),
    watchersCount: (wp._embedded?.watchers?.length) || 0,
    attachmentsCount: (wp._embedded?.attachments?.length) || 0,
    permissions: {
      update: hasLink(wp._links, "update") || hasLink(wp._links, "updateImmediately"),
      updateImmediately: hasLink(wp._links, "updateImmediately"),
      delete: hasLink(wp._links, "delete"),
      addComment: hasLink(wp._links, "addComment"),
      addAttachment: hasLink(wp._links, "addAttachment"),
      addWatcher: hasLink(wp._links, "addWatcher"),
      removeWatcher: hasLink(wp._links, "removeWatcher"),
      addRelation: hasLink(wp._links, "addRelation"),
      logTime: hasLink(wp._links, "logTime"),
      move: hasLink(wp._links, "move"),
    },
  };
}

// Reverse — prototype patch → OpenProject PATCH body. Always include
// lockVersion (required for optimistic locking).
export function buildPatchBody(patch, opts) {
  const { lockVersion } = opts;
  const body = { lockVersion };
  const links = {};
  if (patch.title != null) body.subject = patch.title;
  if (patch.description != null) {
    body.description = { raw: patch.description, format: "markdown" };
  }
  if (patch.statusId != null) links.status = { href: `/api/v3/statuses/${patch.statusId}` };
  if (patch.priorityId != null) links.priority = { href: `/api/v3/priorities/${patch.priorityId}` };
  if (patch.typeId != null) links.type = { href: `/api/v3/types/${patch.typeId}` };
  if (patch.assignee !== undefined)
    links.assignee = patch.assignee ? { href: `/api/v3/users/${patch.assignee}` } : { href: null };
  if (patch.sprint !== undefined)
    links.version = patch.sprint ? { href: `/api/v3/versions/${patch.sprint}` } : { href: null };
  if (patch.parent !== undefined)
    links.parent = patch.parent ? { href: `/api/v3/work_packages/${patch.parent}` } : { href: null };
  if (patch.dueDate !== undefined) body.dueDate = patch.dueDate;
  if (patch.startDate !== undefined) body.startDate = patch.startDate;
  // Story points. Two shapes:
  //   - Numeric field ("storyPoints"): caller passes `points: <number|null>`.
  //   - CustomOption field ("customField7"): caller passes `pointsHref` (the
  //     resolved option href, or null to clear) — that takes precedence.
  if (patch.pointsHref !== undefined) {
    links[STORY_POINTS_FIELD] = patch.pointsHref ? { href: patch.pointsHref } : { href: null };
  } else if (patch.points !== undefined) {
    body[STORY_POINTS_FIELD] = patch.points;
  }
  // Category (per OP v3 spec, `_links.category` is a single Link — a WP
  // has at most one category, not many). We accept either:
  //   - `categoryId` (preferred, explicit) — string id or null to clear.
  //   - `categoryIds` (legacy from the multi-select UI) — first id wins,
  //     empty array clears.
  const wantsCategoryClear =
    patch.categoryId === null ||
    (Array.isArray(patch.categoryIds) && patch.categoryIds.length === 0);
  const wantsCategorySet =
    (patch.categoryId !== undefined && patch.categoryId !== null) ||
    (Array.isArray(patch.categoryIds) && patch.categoryIds.length > 0);
  if (wantsCategorySet) {
    const id =
      patch.categoryId != null ? patch.categoryId : patch.categoryIds[0];
    links.category = { href: `/api/v3/categories/${id}` };
  } else if (wantsCategoryClear) {
    links.category = { href: null };
  }
  if (Object.keys(links).length > 0) body._links = links;
  return body;
}

export function buildCreateBody(data, opts) {
  const { projectId } = opts;
  const body = {
    subject: data.title,
    description: { raw: data.description || "", format: "markdown" },
    _links: {
      project: { href: `/api/v3/projects/${projectId}` },
    },
  };
  if (data.typeId) body._links.type = { href: `/api/v3/types/${data.typeId}` };
  if (data.statusId) body._links.status = { href: `/api/v3/statuses/${data.statusId}` };
  if (data.priorityId) body._links.priority = { href: `/api/v3/priorities/${data.priorityId}` };
  if (data.assignee) body._links.assignee = { href: `/api/v3/users/${data.assignee}` };
  if (data.sprint) body._links.version = { href: `/api/v3/versions/${data.sprint}` };
  if (data.parent) body._links.parent = { href: `/api/v3/work_packages/${data.parent}` };
  if (data.dueDate) body.dueDate = data.dueDate;
  if (data.startDate) body.startDate = data.startDate;
  // Single category per OP spec. Accept either `categoryId` or the
  // legacy first-of-`categoryIds` for back-compat with create-task UI.
  const createCatId =
    data.categoryId != null
      ? data.categoryId
      : Array.isArray(data.categoryIds) && data.categoryIds.length > 0
      ? data.categoryIds[0]
      : null;
  if (createCatId != null) {
    body._links.category = { href: `/api/v3/categories/${createCatId}` };
  }
  // Story points on create. CustomOption installs need a resolved href
  // (which requires a schema fetch we can't do from this pure builder) — so
  // for those we only persist points when the caller has done the lookup
  // and supplied `pointsHref`. For native numeric `storyPoints` we write
  // the number directly.
  if (data.pointsHref !== undefined) {
    body._links[STORY_POINTS_FIELD] = data.pointsHref ? { href: data.pointsHref } : { href: null };
  } else if (data.points != null && STORY_POINTS_FIELD === "storyPoints") {
    body[STORY_POINTS_FIELD] = data.points;
  }
  return body;
}

export function elementsOf(hal) {
  return hal?._embedded?.elements || [];
}

// ── Activities (comments + history) ───────────────────────────────────────

export function mapActivity(a) {
  const isComment = a._type === "Activity::Comment" || a.comment?.raw;
  // Author name resolution falls through:
  //   1. _links.user.title (canonical for hal+json),
  //   2. _embedded.user (full user object — present on some activity types),
  //   3. constructed firstName + lastName from the embedded user,
  //   4. the embedded login (worst case but better than "Someone").
  const linkUser = a._links?.user;
  const embeddedUser = a._embedded?.user;
  const embeddedFullName =
    embeddedUser?.name ||
    [embeddedUser?.firstName, embeddedUser?.lastName].filter(Boolean).join(" ") ||
    embeddedUser?.login ||
    null;
  const authorName = linkTitle(linkUser) || embeddedFullName || null;
  const author = idFromHref(linkUser?.href) || (embeddedUser?.id ? String(embeddedUser.id) : null);
  return {
    id: String(a.id),
    kind: isComment ? "comment" : "change",
    author,
    authorName,
    authorAvatar: embeddedUser?.avatar || null,
    createdAt: a.createdAt || null,
    version: a.version,
    comment: a.comment?.raw || "",
    // OP renders the markdown server-side and wraps it in `<p class="op-uc-p">`,
    // with mentions emitted as `<mention class="mention" data-id=… data-type=…>`.
    // We render this HTML in the comment bubble so user @-mentions and links
    // appear properly instead of raw markdown source.
    commentHtml: a.comment?.html || "",
    details: (a.details || []).map((d) => d.raw || d.html || ""),
    permissions: {
      // OP exposes `_links.update` per-activity when the viewer is the
      // author or holds the edit_work_package_notes permission.
      update: hasLink(a._links, "update"),
    },
  };
}

export function buildCommentBody(text) {
  return { comment: { raw: text } };
}

// ── Attachments ──────────────────────────────────────────────────────────

export function mapAttachment(a) {
  return {
    id: String(a.id),
    fileName: a.fileName,
    fileSize: a.fileSize,
    contentType: a.contentType,
    description: a.description?.raw || "",
    createdAt: a.createdAt || null,
    author: idFromHref(a._links?.author?.href),
    authorName: linkTitle(a._links?.author),
    downloadUrl: `/api/openproject/attachments/${a.id}/content`,
    permissions: {
      delete: hasLink(a._links, "delete") || hasLink(a._links, "deleteAttachment"),
    },
  };
}

export function buildAttachmentMetadata({ fileName, description }) {
  return {
    fileName,
    description: description ? { raw: description } : undefined,
  };
}

// ── Watchers ─────────────────────────────────────────────────────────────

export function mapWatcher(u) {
  return mapUser(u);
}

// ── Relations ────────────────────────────────────────────────────────────
// Per the v3 spec, a Relation has a single direction stored as
// `from → to`. `type` is the from-side verb (e.g. "blocks"), `reverseType`
// is the to-side verb (e.g. "blocked"). We always render relations from the
// perspective of the WP whose detail panel is open, so the mapper picks
// the matching verb and surfaces the *other* side's id/title.
export const RELATION_LABELS = {
  relates: "Relates to",
  duplicates: "Duplicates",
  duplicated: "Duplicated by",
  blocks: "Blocks",
  blocked: "Blocked by",
  precedes: "Precedes",
  follows: "Follows",
  includes: "Includes",
  partof: "Part of",
  requires: "Requires",
  required: "Required by",
};

// The set of relation types a user can create *outgoing* from a WP. The
// reciprocal (`reverseType`) is created automatically by OP on the other
// side, so we don't expose the inverse types in the picker.
export const OUTGOING_RELATION_TYPES = [
  "relates",
  "blocks",
  "duplicates",
  "precedes",
  "follows",
  "includes",
  "requires",
];

export function mapRelation(rel, opts = {}) {
  if (!rel) return null;
  const { wpId } = opts;
  const fromHref = rel._links?.from?.href || null;
  const toHref = rel._links?.to?.href || null;
  const fromId = idFromHref(fromHref);
  const toId = idFromHref(toHref);
  const fromTitle = linkTitle(rel._links?.from);
  const toTitle = linkTitle(rel._links?.to);
  const meId = wpId == null ? "" : String(wpId);
  const isFrom = String(fromId) === meId;
  const otherId = isFrom ? toId : fromId;
  const otherTitle = isFrom ? toTitle : fromTitle;
  const verb = isFrom ? rel.type : rel.reverseType;
  return {
    id: String(rel.id),
    type: rel.type,
    reverseType: rel.reverseType,
    name: rel.name || null,
    description: rel.description || "",
    lag: rel.lag ?? null,
    direction: isFrom ? "outgoing" : "incoming",
    verb,
    label: RELATION_LABELS[verb] || verb || "relates to",
    fromId: fromId ? String(fromId) : null,
    toId: toId ? String(toId) : null,
    otherId: otherId ? String(otherId) : null,
    otherTitle: otherTitle || "(work package)",
    permissions: {
      delete: hasLink(rel._links, "delete"),
      update: hasLink(rel._links, "updateImmediately"),
    },
  };
}

// ── Time entries ─────────────────────────────────────────────────────────

export function mapTimeEntry(t) {
  return {
    id: String(t.id),
    spentOn: t.spentOn,
    hoursIso: t.hours,
    comment: t.comment?.raw || "",
    user: idFromHref(t._links?.user?.href),
    userName: linkTitle(t._links?.user),
    activityId: idFromHref(t._links?.activity?.href),
    activityName: linkTitle(t._links?.activity),
    workPackageId: idFromHref(t._links?.workPackage?.href),
    workPackageName: linkTitle(t._links?.workPackage),
    projectId: idFromHref(t._links?.project?.href),
    projectName: linkTitle(t._links?.project),
    createdAt: t.createdAt || null,
    permissions: {
      update: hasLink(t._links, "update") || hasLink(t._links, "updateImmediately"),
      delete: hasLink(t._links, "delete"),
    },
  };
}

// ── News & Posts (project announcements) ─────────────────────────────────

export function mapNews(n) {
  if (!n) return null;
  const links = n._links || {};
  return {
    id: String(n.id),
    title: n.title || "Untitled",
    summary: n.summary || "",
    description: n.description?.raw || "",
    descriptionHtml: n.description?.html || "",
    projectId: idFromHref(links.project?.href),
    projectName: linkTitle(links.project),
    authorId: idFromHref(links.author?.href),
    authorName: linkTitle(links.author),
    createdAt: n.createdAt || null,
    permissions: {
      update: hasLink(links, "update") || hasLink(links, "updateImmediately"),
      delete: hasLink(links, "delete"),
      addPost: hasLink(links, "addPost"),
    },
  };
}

export function mapPost(p) {
  if (!p) return null;
  const links = p._links || {};
  return {
    id: String(p.id),
    body: p.content?.raw || p.body || "",
    bodyHtml: p.content?.html || "",
    authorId: idFromHref(links.author?.href),
    authorName: linkTitle(links.author),
    createdAt: p.createdAt || null,
    newsId: idFromHref(links.news?.href),
    permissions: {
      update: hasLink(links, "update"),
      delete: hasLink(links, "delete"),
    },
  };
}

// ── Programs & Portfolios (multi-project rollups) ────────────────────────

export function mapProgram(p) {
  if (!p) return null;
  const links = p._links || {};
  const projectLinks = Array.isArray(links.projects) ? links.projects : [];
  return {
    id: String(p.id),
    name: p.name || "Untitled program",
    description: p.description?.raw || "",
    status: p.status || null,
    startDate: p.startDate || null,
    endDate: p.endDate || null,
    projectIds: projectLinks.map((l) => idFromHref(l.href)).filter(Boolean),
    projectNames: projectLinks.map((l) => linkTitle(l)).filter(Boolean),
    permissions: {
      update: hasLink(links, "update") || hasLink(links, "updateImmediately"),
      delete: hasLink(links, "delete"),
    },
  };
}

export function mapPortfolio(p) {
  if (!p) return null;
  const links = p._links || {};
  const projectLinks = Array.isArray(links.projects) ? links.projects : [];
  return {
    id: String(p.id),
    name: p.name || "Untitled portfolio",
    description: p.description?.raw || "",
    status: p.status || null,
    projectIds: projectLinks.map((l) => idFromHref(l.href)).filter(Boolean),
    projectNames: projectLinks.map((l) => linkTitle(l)).filter(Boolean),
    permissions: {
      update: hasLink(links, "update") || hasLink(links, "updateImmediately"),
      delete: hasLink(links, "delete"),
    },
  };
}

// ── Working hours / non-working times ────────────────────────────────────

export function mapWorkingHours(wh) {
  if (!wh) return null;
  return {
    id: String(wh.id),
    weekday: wh.weekday || null, // 1=Mon..7=Sun
    start: wh.start || null,
    end: wh.end || null,
    hours: wh.hours ?? null,
    userId: idFromHref(wh._links?.user?.href),
  };
}

export function mapNonWorkingTime(nt) {
  if (!nt) return null;
  return {
    id: String(nt.id),
    name: nt.name || "Non-working day",
    start: nt.start || nt.startDate || null,
    end: nt.end || nt.endDate || null,
    allDay: !!nt.allDay,
    userId: idFromHref(nt._links?.user?.href),
  };
}

// ── Wiki pages ───────────────────────────────────────────────────────────
//
// OP renders wiki pages with `text` (the markdown source) plus a server-
// rendered HTML representation via the same `description` shape it uses
// elsewhere. We keep both so the renderer can pick — sanitised HTML for
// the default render, raw text for an edit form (later).
export function mapWikiPage(w) {
  if (!w) return null;
  const links = w._links || {};
  return {
    id: String(w.id),
    title: w.title || "Untitled",
    slug: w.slug || idFromHref(links.self?.href) || String(w.id),
    text: w.text?.raw || "",
    html: w.text?.html || "",
    parentId: idFromHref(links.parent?.href),
    parentTitle: linkTitle(links.parent),
    projectId: idFromHref(links.project?.href),
    projectName: linkTitle(links.project),
    lockVersion: w.lockVersion ?? 0,
    createdAt: w.createdAt || null,
    updatedAt: w.updatedAt || null,
    permissions: {
      update: hasLink(links, "update") || hasLink(links, "updateImmediately"),
      delete: hasLink(links, "delete"),
    },
  };
}

// ── External storages & file links ───────────────────────────────────────
//
// OP integrates with Nextcloud / OneDrive storages. A "file link" is a
// pointer from a work package to a remote file in one of those storages.
// We never proxy the file content (the storage hosts it); the open/download
// links are 307'd back to the storage's own URL with the user's session.
export function mapStorage(s) {
  if (!s) return null;
  const links = s._links || {};
  return {
    id: String(s.id),
    name: s.name,
    type: s.providerType || s._type || "storage",
    host: s.host || null,
    permissions: {
      open: hasLink(links, "open"),
    },
  };
}

export function mapProjectStorage(ps) {
  if (!ps) return null;
  const links = ps._links || {};
  return {
    id: String(ps.id),
    storageId: idFromHref(links.storage?.href),
    storageName: linkTitle(links.storage),
    projectId: idFromHref(links.project?.href),
    projectFolderEnabled: !!ps.projectFolderEnabled,
    permissions: {
      delete: hasLink(links, "delete"),
    },
  };
}

export function mapFileLink(f) {
  if (!f) return null;
  const links = f._links || {};
  return {
    id: String(f.id),
    originName: f.originData?.name || linkTitle(links.originOpen) || "(file)",
    originId: f.originData?.id || null,
    originMimeType: f.originData?.mimeType || null,
    originSize: f.originData?.size || null,
    storageName: linkTitle(links.storage),
    storageType: f.originData?.storage || null,
    addedAt: f.createdAt || null,
    addedBy: idFromHref(links.creator?.href),
    addedByName: linkTitle(links.creator),
    // Use our own redirect proxies so the browser hits a same-origin URL
    // (which can carry the OP session); OP then 307s onward to the storage.
    openHref: `/api/openproject/file-links/${f.id}/open`,
    downloadHref: `/api/openproject/file-links/${f.id}/download`,
    permissions: {
      delete: hasLink(links, "delete"),
    },
  };
}

// ── Revisions (SCM commits linked to a WP) ───────────────────────────────
//
// OP auto-creates a Revision row when a commit message references a WP id
// (e.g. `git commit -m "fixes #1234"`). Mapped flat for the task-detail
// "Linked commits" panel — read-only; mutations aren't part of the v3 API.
export function mapRevision(r) {
  if (!r) return null;
  const links = r._links || {};
  return {
    id: String(r.id),
    identifier: r.identifier || null,
    shortId: r.formattedIdentifier || (r.identifier ? r.identifier.slice(0, 7) : null),
    authorName: r.authorName || linkTitle(links.author) || null,
    authorId: idFromHref(links.author?.href),
    message: r.message?.raw || "",
    messageHtml: r.message?.html || "",
    createdAt: r.createdAt || null,
    projectId: idFromHref(links.project?.href),
    projectName: linkTitle(links.project),
    // Deep-link out to OP's repository viewer (the diff/changeset page).
    // The link sits outside the v3 API; we open it in a new tab rather
    // than proxying because OP renders it as a full HTML page, not JSON.
    showHref: links.showRevision?.href || null,
  };
}

// ── Reminders ────────────────────────────────────────────────────────────
//
// Personal "remind me about this work package" notes. OP fires them at
// `remindAt` via its built-in notification channel. Mapped flat for the
// task-detail side panel + a possible "My reminders" inbox.
export function mapReminder(r) {
  if (!r) return null;
  const links = r._links || {};
  return {
    id: String(r.id),
    remindAt: r.remindAt || null,
    note: r.note || "",
    status: r.status || null,
    workPackageId: idFromHref(links.workPackage?.href),
    workPackageName: linkTitle(links.workPackage),
    creatorId: idFromHref(links.creator?.href),
    creatorName: linkTitle(links.creator),
    createdAt: r.createdAt || null,
    updatedAt: r.updatedAt || null,
    permissions: {
      update: hasLink(links, "update") || hasLink(links, "updateImmediately"),
      delete: hasLink(links, "delete"),
    },
  };
}

// ── Saved Queries ────────────────────────────────────────────────────────
//
// OP Queries carry filter+sort+columns+group-by+timestamps. The HAL shape is
// dense — we surface the minimum the UI needs (display + run + edit) and
// keep the original payload under `raw` so the editor can round-trip
// without us having to model every field.
export function mapQuery(q) {
  if (!q) return null;
  const links = q._links || {};
  const columnHrefs = Array.isArray(links.columns)
    ? links.columns.map((l) => l.href).filter(Boolean)
    : [];
  return {
    id: String(q.id),
    name: q.name,
    public: !!q.public,
    starred: !!q.starred,
    projectId: idFromHref(links.project?.href),
    projectName: linkTitle(links.project),
    userId: idFromHref(links.user?.href),
    filters: Array.isArray(q.filters) ? q.filters : [],
    sortBy: Array.isArray(q.sortBy) ? q.sortBy : [],
    groupBy: q.groupBy || null,
    columnIds: columnHrefs.map((h) => idFromHref(h)).filter(Boolean),
    resultsHref: links.results?.href || null,
    permissions: {
      update: hasLink(links, "updateImmediately") || hasLink(links, "update"),
      delete: hasLink(links, "delete"),
      star: hasLink(links, "star"),
      unstar: hasLink(links, "unstar"),
    },
    raw: q,
  };
}

export function mapTimeEntryActivity(a) {
  return {
    id: String(a.id),
    name: a.name,
    position: typeof a.position === "number" ? a.position : null,
    isDefault: !!a.isDefault,
  };
}

export function buildTimeEntryBody({ workPackageId, hoursIso, spentOn, comment, activityId }) {
  const body = {
    hours: hoursIso,
    spentOn: spentOn || new Date().toISOString().slice(0, 10),
    _links: {
      workPackage: { href: `/api/v3/work_packages/${workPackageId}` },
    },
  };
  if (comment) body.comment = { raw: comment };
  if (activityId)
    body._links.activity = { href: `/api/v3/time_entries/activities/${activityId}` };
  return body;
}

// ── Categories (labels) ──────────────────────────────────────────────────

export function mapCategory(c) {
  return {
    id: String(c.id),
    name: c.name,
    defaultAssignee: idFromHref(c._links?.defaultAssignee?.href),
    defaultAssigneeName: linkTitle(c._links?.defaultAssignee) || null,
  };
}

// ── Notifications ─────────────────────────────────────────────────────────

export function mapNotification(n) {
  return {
    id: String(n.id),
    reason: n.reason || null,
    readIAN: !!n.readIAN,
    createdAt: n.createdAt || null,
    updatedAt: n.updatedAt || null,
    subject: linkTitle(n._links?.resource) || n.subject || "Notification",
    workPackageId: idFromHref(n._links?.resource?.href),
    projectId: idFromHref(n._links?.project?.href),
    projectName: linkTitle(n._links?.project),
    actorId: idFromHref(n._links?.actor?.href),
    actorName: linkTitle(n._links?.actor),
  };
}

// ── Versions (sprints) ───────────────────────────────────────────────────

export function mapVersionFull(v) {
  return {
    ...mapVersionToSprint(v),
    description: v.description?.raw || "",
    projectId: idFromHref(v._links?.definingProject?.href),
    projectName: linkTitle(v._links?.definingProject),
    permissions: {
      update: hasLink(v._links, "update") || hasLink(v._links, "updateImmediately"),
      delete: hasLink(v._links, "delete"),
    },
  };
}

export function buildVersionPatchBody({ name, description, status, startDate, endDate }) {
  const body = {};
  if (name !== undefined) body.name = name;
  if (description !== undefined) body.description = { raw: description };
  if (status !== undefined) body.status = status;
  if (startDate !== undefined) body.startDate = startDate;
  if (endDate !== undefined) body.endDate = endDate;
  return body;
}

// ── Documents (Confluence-style project knowledge) ────────────────────

export function mapDocument(d) {
  if (!d) return null;
  const links = d._links || {};
  const projectHref = links.project?.href || null;
  return {
    id: String(d.id),
    title: d.title || linkTitle(links.self) || "Untitled",
    description: d.description?.raw || "",
    descriptionHtml: d.description?.html || "",
    descriptionFormat: d.description?.format || "markdown",
    projectId: idFromHref(projectHref),
    projectName: linkTitle(links.project),
    projectHref,
    createdAt: d.createdAt || null,
    attachmentsHref: links.attachments?.href || null,
    permissions: {
      // Per the v3 spec, the only writeable bit on a document is title
      // and description — surfaced when the embedded `_links.update` is
      // present. There is no DELETE on documents in the API.
      update: hasLink(links, "update") || hasLink(links, "updateImmediately"),
      addAttachment: hasLink(links, "addAttachment"),
    },
  };
}

// ── Memberships & roles ──────────────────────────────────────────────────
//
// /api/v3/memberships responses embed role + project; the role's permission
// list lives on the individual /api/v3/roles/{id} resource. The mapped
// shape is consumed in two places, so it carries fields for both:
//
//   - Permission resolution ([lib/openproject/permissions.js]): needs
//     `isUser`, `projectId`, `roleIds`.
//   - Members page (UI): needs `principalName`, `principalType`,
//     `principalEmail`, `roles[]`, `permissions.update / .delete`,
//     `createdAt`, `avatar`.

export function mapRole(r) {
  return {
    id: String(r.id),
    name: r.name,
    permissions: Array.isArray(r.permissions) ? r.permissions : [],
  };
}

export function mapMembership(m) {
  if (!m) return null;
  const links = m._links || {};
  const principal = m._embedded?.principal || null;
  const principalHref = links.principal?.href || null;
  const principalId = idFromHref(principalHref);
  // OP returns `_type: "User"` / `"Group"` on the embedded principal — that
  // is the source of truth. Don't infer from the href.
  const principalType = principal?._type
    ? String(principal._type).toLowerCase()
    : null;
  const name =
    principal?.name ||
    [principal?.firstName, principal?.lastName].filter(Boolean).join(" ") ||
    linkTitle(links.principal) ||
    "Unknown";
  const rolesEmbedded = Array.isArray(m._embedded?.roles)
    ? m._embedded.roles.map(mapRole)
    : [];
  const rolesFromLinks = Array.isArray(links.roles)
    ? links.roles
        .map((r) => ({ id: idFromHref(r.href), name: r.title || "Role" }))
        .filter((r) => r.id)
    : [];
  const roles = rolesEmbedded.length > 0 ? rolesEmbedded : rolesFromLinks;
  return {
    id: String(m.id),
    // Legacy fields used by permission resolution.
    isUser: principalType === "user",
    projectId: idFromHref(links.project?.href),
    projectHref: links.project?.href || null,
    // UI fields for the Members page.
    principalId,
    principalName: name,
    principalType, // "user" | "group"
    principalEmail: principal?.email || null,
    avatar: principalId
      ? `/api/openproject/users/${principalId}/avatar`
      : null,
    roleIds: roles.map((r) => String(r.id)),
    roleNames: roles.map((r) => r.name),
    roles,
    createdAt: m.createdAt || null,
    updatedAt: m.updatedAt || null,
    permissions: {
      update:
        hasLink(links, "update") || hasLink(links, "updateImmediately"),
      delete: hasLink(links, "delete"),
    },
  };
}

export function buildMembershipCreateBody({ projectId, principalId, roleIds, sendNotification = true, message }) {
  const body = {
    _links: {
      principal: { href: `/api/v3/users/${principalId}` },
      roles: (roleIds || []).map((id) => ({ href: `/api/v3/roles/${id}` })),
    },
  };
  if (projectId) {
    body._links.project = { href: `/api/v3/projects/${projectId}` };
  }
  if (sendNotification === false) {
    body._meta = { sendNotification: false };
  } else if (message) {
    body._meta = { notificationMessage: { raw: message } };
  }
  return body;
}

export function buildMembershipPatchBody({ roleIds, sendNotification, message }) {
  const body = {
    _links: {
      roles: (roleIds || []).map((id) => ({ href: `/api/v3/roles/${id}` })),
    },
  };
  if (sendNotification === false) {
    body._meta = { sendNotification: false };
  } else if (message) {
    body._meta = { notificationMessage: { raw: message } };
  }
  return body;
}

export function buildVersionCreateBody({ projectId, name, description, status, startDate, endDate }) {
  const body = {
    name,
    status: status || "open",
    _links: {
      definingProject: { href: `/api/v3/projects/${projectId}` },
    },
  };
  if (description) body.description = { raw: description };
  if (startDate) body.startDate = startDate;
  if (endDate) body.endDate = endDate;
  return body;
}
