// JSDoc port definitions (typedefs only — no runtime cost).
// Both API and DB implementations of each repository conform to these shapes.
// UI shapes referenced here are produced by `lib/openproject/mappers.js`;
// keeping a single shape contract means components don't change when the
// data source flips.

/**
 * @typedef {Object} AuthzContext
 * @property {string} userId — NextAuth session user id (canonical OP user id).
 * @property {boolean} isAdmin — OP global admin flag.
 * @property {number[]} projectIds — Project ids the viewer can see.
 * @property {Map<number, Set<string>>} permsByProject — Per-project permission set.
 */

/**
 * @typedef {Object} TaskQuery
 * @property {string} [projectId] — Numeric id or identifier slug.
 * @property {string} [sprintId] — "backlog" / "none" / "all" / specific id.
 * @property {number} [pageSize]
 * @property {number} [offset]
 * @property {number} [limit] — Hard cap for the bounded-walk path.
 */

/**
 * @typedef {Object} TaskListResult
 * @property {Object[]} tasks — `mapWorkPackage` shape.
 * @property {number} [total]
 * @property {number} [pageSize]
 * @property {number} [offset]
 * @property {number} [count]
 * @property {boolean} paged — true when caller asked for a specific page.
 */

/**
 * @typedef {Object} TaskRepository
 * @property {(ctx: AuthzContext, query: TaskQuery) => Promise<TaskListResult|Object[]>} list
 * @property {(ctx: AuthzContext, id: string|number) => Promise<Object|null>} findById
 * @property {(ctx: AuthzContext, input: Object) => Promise<Object>} create
 * @property {(ctx: AuthzContext, id: string|number, patch: Object) => Promise<Object>} update
 * @property {(ctx: AuthzContext, id: string|number) => Promise<void>} delete
 */

/**
 * @typedef {Object} ProjectRepository
 * @property {(ctx: AuthzContext, opts?: {pageSize?: number, filters?: string}) => Promise<Object[]>} list
 */

/**
 * @typedef {Object} SprintRepository
 * @property {(ctx: AuthzContext, opts?: {projectId?: string}) => Promise<Object[]>} list
 */

/**
 * @typedef {Object} UserRepository
 * @property {(ctx: AuthzContext, opts?: {pageSize?: number}) => Promise<Object[]>} list
 * @property {(ctx: AuthzContext) => Promise<Object|null>} me
 */

/**
 * @typedef {Object} LookupRepository
 * @property {(ctx: AuthzContext) => Promise<Object[]>} statuses
 * @property {(ctx: AuthzContext, opts?: {projectId?: string}) => Promise<Object[]>} types
 * @property {(ctx: AuthzContext) => Promise<Object[]>} priorities
 */

/**
 * @typedef {Object} PermissionRepository
 * @property {() => Promise<{admin: boolean, byProject: Object<string, string[]>}>} viewer
 */

/**
 * @typedef {Object} ActivityRepository
 * @property {(ctx: AuthzContext, opts: {workPackageId: string|number}) => Promise<Object[]>} list
 * @property {(ctx: AuthzContext, input: {workPackageId: string|number, text: string}) => Promise<Object>} create
 */

/**
 * @typedef {Object} AttachmentRepository
 * @property {(ctx: AuthzContext, opts: {workPackageId: string|number}) => Promise<Object[]>} list
 * @property {(ctx: AuthzContext, input: {workPackageId: string|number, formData: FormData}) => Promise<Object>} create
 */

/**
 * @typedef {Object} MembershipRepository
 * @property {(ctx: AuthzContext, opts?: {projectId?: string, principalId?: string}) => Promise<Object[]>} list
 * @property {(ctx: AuthzContext, input: Object) => Promise<Object>} create
 */

/**
 * @typedef {Object} TimeEntryRepository
 * @property {(ctx: AuthzContext, query?: Object) => Promise<Object[]>} list
 * @property {(ctx: AuthzContext, input: Object) => Promise<Object>} create
 */

/**
 * @typedef {Object} QueryRepository
 * @property {(ctx: AuthzContext, opts?: {projectId?: string, starredOnly?: boolean}) => Promise<Object[]>} list
 * @property {(ctx: AuthzContext, input: Object) => Promise<Object>} create
 */

/**
 * @typedef {Object} CategoryRepository
 * @property {(ctx: AuthzContext, opts: {projectId: string}) => Promise<Object[]>} list
 * @property {(ctx: AuthzContext, input: Object) => Promise<Object>} create
 */

/**
 * @typedef {Object} Repositories
 * @property {TaskRepository} tasks
 * @property {ProjectRepository} projects
 * @property {SprintRepository} sprints
 * @property {UserRepository} users
 * @property {LookupRepository} lookups
 * @property {PermissionRepository} permissions
 * @property {ActivityRepository} activities
 * @property {AttachmentRepository} attachments
 * @property {MembershipRepository} memberships
 * @property {TimeEntryRepository} timeEntries
 * @property {QueryRepository} queries
 * @property {CategoryRepository} categories
 */

export {};
