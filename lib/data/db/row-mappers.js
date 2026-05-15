// DB row → UI shape mappers. Output must match `lib/openproject/mappers.js`
// field-for-field so components can't tell which source served them.

import {
  colorFor as _colorFor,
  initialsOf,
  parseStoryPointValue,
  tshirtLabelForPoints,
  dayDiff,
  deriveSprintState,
} from "@/lib/openproject/mappers";
import { renderMarkdownToHtml } from "./markdown";

function toIsoOrNull(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function toIsoDateOrNull(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function permissionsForProject(perms, projectId, isAdmin) {
  // Project-level permission set, projected to the WP-level permission keys
  // that the HAL `_links` produces. Per-WP HAL permissions are richer than
  // project perms (e.g. addAttachment depends on attachment limits) — we
  // approximate with the project membership permissions.
  const set = isAdmin ? null : perms?.get?.(Number(projectId));
  const has = (k) => isAdmin || set?.has(k);
  return {
    update: !!has("edit_work_packages"),
    updateImmediately: !!has("edit_work_packages"),
    delete: !!has("delete_work_packages"),
    addComment: !!has("add_work_package_notes"),
    addAttachment: !!has("add_work_package_attachments"),
    addWatcher: !!has("add_work_package_watchers"),
    removeWatcher: !!has("delete_work_package_watchers"),
    addRelation: !!has("manage_work_package_relations"),
    logTime: !!has("log_time"),
    move: !!has("move_work_packages"),
  };
}

// ── Lookups ───────────────────────────────────────────────────────────────

export function mapStatusRow(r) {
  return {
    id: String(r.id),
    name: r.name,
    isClosed: !!r.is_closed,
    color: r.color || null,
    position: r.position ?? null,
    isDefault: !!r.is_default,
    isReadonly: !!r.is_readonly,
    defaultDoneRatio: r.default_done_ratio ?? null,
  };
}

export function mapTypeRow(r) {
  return {
    id: String(r.id),
    name: r.name,
    position: r.position ?? null,
    color: r.color || null,
    isDefault: !!r.is_default,
  };
}

export function mapPriorityRow(r) {
  return {
    id: String(r.id),
    name: r.name,
    position: r.position ?? null,
    color: r.color || null,
    isDefault: !!r.is_default,
  };
}

// ── User ──────────────────────────────────────────────────────────────────

export function mapUserRow(r) {
  if (!r) return null;
  const id = String(r.id);
  const name =
    [r.firstname, r.lastname].filter(Boolean).join(" ").trim() ||
    r.login ||
    id;
  return {
    id,
    name,
    initials: initialsOf(name),
    color: _colorFor(id),
    avatar: `/api/openproject/users/${id}/avatar`,
  };
}

// ── Project ───────────────────────────────────────────────────────────────

export function mapProjectRow(r, ctx) {
  const identifier = r.identifier || String(r.id);
  const perms = ctx?.permsByProject?.get?.(Number(r.id));
  const has = (k) => ctx?.isAdmin || perms?.has(k);
  return {
    id: identifier,
    key:
      (identifier.match(/[A-Za-z]/g) || [identifier[0]])
        .slice(0, 2)
        .join("")
        .toUpperCase() || "PR",
    name: r.name,
    color: _colorFor(identifier),
    desc: r.description || "",
    lead: null,
    open: 0,
    sprint: "—",
    progress: 0,
    permissions: {
      update: !!has("edit_project"),
      delete: !!has("delete_project"),
      addWorkPackages: !!has("add_work_packages"),
      manageVersions: !!has("manage_versions"),
      manageCategories: !!has("manage_categories"),
      manageMembers: !!has("manage_members"),
    },
  };
}

// ── Sprint (Version) ─────────────────────────────────────────────────────

export function mapSprintRow(r) {
  const startIso = toIsoDateOrNull(r.start_date);
  const endIso = toIsoDateOrNull(r.effective_date);
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

  const status = r.status || "open";
  return {
    id: String(r.id),
    name: r.name,
    state: deriveSprintState(status, startIso, todayIso),
    status,
    start: startIso || "—",
    end: endIso || "—",
    goal: r.description || "",
    days,
    dayIn,
  };
}

// ── Work package ──────────────────────────────────────────────────────────

export function mapWorkPackageRow(r, lookups, authz) {
  // Resolve story-points display: prefer the option label (t-shirt size)
  // when the configured CF is a CustomOption-typed list; otherwise use the
  // numeric value (native `story_points` column or numeric custom field).
  const rawSpLabel = r.sp_label ?? null;
  const rawSpValue = r.sp_value ?? null;
  const points = parseStoryPointValue(rawSpLabel ?? rawSpValue);
  const pointsRaw = rawSpLabel ?? rawSpValue ?? tshirtLabelForPoints(points);

  // `nativeId` mirrors HAL's raw `wp.id` (number, not string) for parity
  // with `mapWorkPackage`. Route handlers do their own string coercion.
  const numericId = typeof r.id === "string" ? Number(r.id) : r.id;
  return {
    id: `wp-${r.id}`,
    nativeId: numericId,
    lockVersion: r.lock_version ?? 0,
    key: `#${r.id}`,

    typeId: r.type_id ? String(r.type_id) : null,
    typeName: r.type_name || null,
    typeColor: r.type_color || null,

    title: (r.subject || "").trim(),
    description: r.description || "",
    descriptionHtml: renderMarkdownToHtml(r.description),
    descriptionFormat: "markdown",

    statusId: r.status_id ? String(r.status_id) : null,
    statusName: r.status_name || null,
    statusIsClosed: r.status_id != null ? !!r.status_is_closed : null,
    statusColor: r.status_color || null,

    priorityId: r.priority_id ? String(r.priority_id) : null,
    priorityName: r.priority_name || null,
    priorityColor: r.priority_color || null,
    priorityPosition: r.priority_position ?? null,
    priorityTotal: Array.isArray(lookups?.priorities) ? lookups.priorities.length : null,

    assignee: r.assigned_to_id ? String(r.assigned_to_id) : null,
    assigneeName: r.assigned_to_id
      ? [r.assignee_firstname, r.assignee_lastname].filter(Boolean).join(" ").trim() ||
        r.assignee_login ||
        null
      : null,
    reporter: r.author_id ? String(r.author_id) : null,
    reporterName: r.author_id
      ? [r.author_firstname, r.author_lastname].filter(Boolean).join(" ").trim() ||
        r.author_login ||
        null
      : null,

    points,
    pointsRaw,

    sprint: r.version_id ? String(r.version_id) : null,
    sprintName: r.version_name || null,

    epic: r.parent_id ? String(r.parent_id) : null,
    epicName: r.parent_subject || null,
    hasChildren: !!r.has_children,

    labels: r.category_name ? [r.category_name] : [],
    categoryId: r.category_id ? String(r.category_id) : null,
    categoryName: r.category_name || null,

    comments: 0,
    attachments: 0,

    // OP HAL hrefs are absolute paths starting with `/api/v3`. Mirror that
    // shape so any caller that strips `/api/v3` prefix gets a usable
    // server-relative path.
    projectHref: r.project_id ? `/api/v3/projects/${r.project_id}` : null,
    schemaHref:
      r.project_id && r.type_id
        ? `/api/v3/work_packages/schemas/${r.project_id}-${r.type_id}`
        : null,

    createdAt: toIsoOrNull(r.created_at),
    updatedAt: toIsoOrNull(r.updated_at),
    startDate: toIsoDateOrNull(r.start_date),
    dueDate: toIsoDateOrNull(r.due_date),
    duration: r.duration ?? null,
    estimatedHours: r.estimated_hours == null ? null : Number(r.estimated_hours),
    percentageDone: r.done_ratio ?? null,
    childrenIds: [],
    watchersCount: 0,
    attachmentsCount: 0,
    permissions: permissionsForProject(authz?.permsByProject, r.project_id, authz?.isAdmin),
  };
}

// ── Category ──────────────────────────────────────────────────────────────

export function mapCategoryRow(r) {
  const assigneeName = r.assigned_to_id
    ? [r.assignee_firstname, r.assignee_lastname]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      r.assignee_login ||
      null
    : null;
  return {
    id: String(r.id),
    name: r.name,
    defaultAssignee: r.assigned_to_id ? String(r.assigned_to_id) : null,
    defaultAssigneeName: assigneeName,
  };
}

// ── Time entry ────────────────────────────────────────────────────────────

function hoursToIsoDuration(hours) {
  if (hours == null) return null;
  const totalMinutes = Math.round(Number(hours) * 60);
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return "PT0H";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h && m) return `PT${h}H${m}M`;
  if (h) return `PT${h}H`;
  return `PT${m}M`;
}

export function mapTimeEntryRow(r) {
  const userName = r.user_id
    ? [r.user_firstname, r.user_lastname].filter(Boolean).join(" ").trim() ||
      r.user_login ||
      null
    : null;
  return {
    id: String(r.id),
    spentOn: toIsoDateOrNull(r.spent_on),
    hoursIso: hoursToIsoDuration(r.hours),
    comment: r.comments || "",
    user: r.user_id ? String(r.user_id) : null,
    userName,
    activityId: r.activity_id ? String(r.activity_id) : null,
    activityName: r.activity_name || null,
    workPackageId: r.work_package_id ? String(r.work_package_id) : null,
    workPackageName: r.wp_subject || null,
    projectId: r.project_id ? String(r.project_id) : null,
    projectName: r.project_name || null,
    createdAt: toIsoOrNull(r.created_at),
    permissions: { update: false, delete: false },
  };
}

// ── Query ─────────────────────────────────────────────────────────────────

function tryParseSerializedArray(raw) {
  if (raw == null) return [];
  if (typeof raw !== "string") return Array.isArray(raw) ? raw : [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // OP serialises filters as YAML, not JSON. The full parse needs
      // Ruby-side semantics; we surface an empty list and let the API
      // path own this field.
      return [];
    }
  }
  return [];
}

export function mapQueryRow(r) {
  return {
    id: String(r.id),
    name: r.name,
    public: !!r.public,
    starred: !!r.starred,
    projectId: r.project_id ? String(r.project_id) : null,
    projectName: r.project_name || null,
    userId: r.user_id ? String(r.user_id) : null,
    filters: tryParseSerializedArray(r.filters),
    sortBy: tryParseSerializedArray(r.sort_criteria),
    groupBy: r.group_by || null,
    columnIds: tryParseSerializedArray(r.column_names),
    resultsHref: null,
    permissions: {
      update: false,
      delete: false,
      star: false,
      unstar: false,
    },
    raw: null,
  };
}

// ── Membership ────────────────────────────────────────────────────────────

export function mapMembershipRow(r, ctx) {
  const principalType =
    r.principal_type === "Group" ? "group" : r.principal_type ? "user" : null;
  const principalName =
    [r.principal_firstname, r.principal_lastname]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    r.principal_login ||
    "Unknown";
  const projectId = r.project_id ? String(r.project_id) : null;
  const perms = ctx?.permsByProject?.get?.(Number(r.project_id));
  const has = (k) => ctx?.isAdmin || perms?.has(k);

  // pg returns array_agg results as JS arrays; bigint members come back as
  // strings (same as scalar bigint). Normalise to string ids consistently.
  const roleIds = Array.isArray(r.role_ids)
    ? r.role_ids.map((v) => String(v))
    : [];
  const roleNames = Array.isArray(r.role_names) ? r.role_names : [];
  const roles = roleIds.map((id, i) => ({ id, name: roleNames[i] || "Role" }));

  return {
    id: String(r.member_id),
    isUser: principalType === "user",
    projectId,
    projectHref: r.project_id ? `/api/v3/projects/${r.project_id}` : null,
    principalId: r.user_id ? String(r.user_id) : null,
    principalName,
    principalType,
    principalEmail: r.principal_email || null,
    avatar: r.user_id ? `/api/openproject/users/${r.user_id}/avatar` : null,
    roleIds,
    roleNames,
    roles,
    createdAt: toIsoOrNull(r.created_at),
    updatedAt: toIsoOrNull(r.updated_at),
    permissions: {
      update: !!has("manage_members"),
      delete: !!has("manage_members"),
    },
  };
}

// ── Attachment ────────────────────────────────────────────────────────────

export function mapAttachmentRow(r) {
  const authorName = r.author_id
    ? [r.author_firstname, r.author_lastname]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      r.author_login ||
      null
    : null;
  return {
    id: String(r.id),
    fileName: r.filename,
    fileSize: r.filesize == null ? null : Number(r.filesize),
    contentType: r.content_type || null,
    description: r.description || "",
    createdAt: toIsoOrNull(r.created_at),
    author: r.author_id ? String(r.author_id) : null,
    authorName,
    downloadUrl: `/api/openproject/attachments/${r.id}/content`,
    permissions: { delete: false },
  };
}

// ── Activity ──────────────────────────────────────────────────────────────

export function mapActivityRow(r, details) {
  const isComment = !!(r.notes && String(r.notes).trim());
  const authorName = r.user_id
    ? [r.user_firstname, r.user_lastname].filter(Boolean).join(" ").trim() ||
      r.user_login ||
      null
    : null;
  return {
    id: String(r.id),
    kind: isComment ? "comment" : "change",
    author: r.user_id ? String(r.user_id) : null,
    authorName,
    authorAvatar: null,
    createdAt: toIsoOrNull(r.created_at),
    version: r.version,
    comment: isComment ? r.notes : "",
    commentHtml: isComment ? renderMarkdownToHtml(r.notes) : "",
    details: Array.isArray(details) ? details : [],
    permissions: { update: false },
  };
}
