# Data layer (Repository pattern)

Opira reads (and will write) project data through a thin Repository layer
under [lib/data/](../lib/data/). Two implementations of every repository
exist:

- **API** — calls OpenProject's v3 HAL+JSON API via
  [lib/openproject/client.js](../lib/openproject/client.js). This is the
  default and what shipped before this layer was introduced.
- **DB** — talks to OpenProject's PostgreSQL database directly via `pg`,
  in-process inside the Next.js standalone build.

A factory chooses which implementation to use based on `OPIRA_DATA_SOURCE`
(server-only env var). Both backends produce **identical UI shapes** so
components and hooks don't change when the toggle flips.

| Mode      | Reads | Writes | When to use |
|-----------|-------|--------|-------------|
| `api`     | API   | API    | Default. No DB credentials wired yet. |
| `hybrid`  | DB    | API    | **Recommended once DB is configured.** Fast reads, journal-safe writes. |

## File map

```
lib/data/
  config.js                       # readDataSourceMode() / isDbMode()
  factory.js                      # getRepositories() — returns {tasks, projects, ...}
  ports/index.js                  # JSDoc typedefs (the contract)
  authz/
    context.js                    # buildAuthzContext() — top-level entry
    api-source.js                 # AuthzContext from /memberships + /roles
    db-source.js                  # AuthzContext from members ⋈ role_permissions
  api/                            # API repositories (use opFetch + mappers)
    task-repository.api.js
    project-repository.api.js
    sprint-repository.api.js
    user-repository.api.js
    lookup-repository.api.js
    permission-repository.api.js
  db/                             # DB repositories (use pg)
    client.js                     # singleton Pool
    row-mappers.js                # PG row → UI shape
    row-helpers.js                # palette + initials, byte-identical to HAL helpers
    lookups-cache.js              # 5-min in-process cache
    task-repository.db.js         # reads only (Phase 1)
    project-repository.db.js
    sprint-repository.db.js
    user-repository.db.js
    lookup-repository.db.js
    permission-repository.db.js
    schema-canary.test.js         # skipped without OPIRA_TEST_DB_URL
  contract/                       # API↔DB shape parity tests
```

## Authz contract

Every repository method takes an `AuthzContext` as its first argument:

```js
{
  userId: string,                          // canonical OP user id
  isAdmin: boolean,                        // OP global admin
  projectIds: number[],                    // visible project ids
  permsByProject: Map<number, Set<string>> // permission keys per project
}
```

Route handlers build the context once with `buildAuthzContext()` and pass
it through. Repos enforce visibility — DB repos add `WHERE
project_id = ANY($projectIds)` (or `OR p.public = TRUE`) to every query.
Admins bypass the project filter.

The context is cached 5 minutes per user (separately per source) — the
same TTL the API permissions loader uses today.

## Phase 1 boundaries

1. **DB writes are not implemented.** The factory routes mutations to the
   API repo even when `OPIRA_DATA_SOURCE=db`. Reason: OpenProject's API
   generates `journals`, sends notifications, recomputes derived parent
   progress, and triggers webhooks. Raw SQL writes that don't replicate
   that will silently rot audit trails and break integrations.
2. **DB reads cover six entities:** work packages (tasks), projects,
   sprints (versions), users, lookups (statuses/types/priorities), and
   the viewer permissions endpoint.
3. **Other entities (activities, attachments, memberships, time entries,
   queries, …) keep going through the API regardless of mode** until DB
   impls are added in Phase 1.5.
4. **`description_html` is empty in DB mode.** The HAL API renders
   markdown to HTML; the DB stores only markdown. Components that show
   descriptions either use `description` (raw) or render markdown
   client-side. A server-side renderer for HTML parity is out of scope
   for Phase 1.
5. **No `non_member` / public-project permissions fold-in.** The DB authz
   source uses membership-derived permissions only. Phase 1.5 adds the
   public-project case.

## Adding a new repository

1. Add a JSDoc typedef in [lib/data/ports/index.js](../lib/data/ports/index.js).
2. Implement `lib/data/api/<entity>-repository.api.js` by lifting the
   logic from the existing route handler.
3. Implement `lib/data/db/<entity>-repository.db.js` with parameterized
   SQL — never string-concat user input. Add `mapXRow(r, ctx)` to
   [lib/data/db/row-mappers.js](../lib/data/db/row-mappers.js).
4. Wire both implementations into [lib/data/factory.js](../lib/data/factory.js).
5. Update the route handler in `app/api/openproject/<entity>/route.js`
   to call `getRepositories().<entity>.<method>(ctx, args)`.
6. Add a contract test in `lib/data/contract/<entity>.contract.test.js`:
   feed a HAL fixture and a DB row fixture for the same logical entity,
   `expect(apiResult).toEqual(dbResult)`.
7. Add a column entry to the schema canary in
   [lib/data/db/schema-canary.test.js](../lib/data/db/schema-canary.test.js).

## Testing strategy

Vitest. `lib/**/*.test.js` is the include pattern.

- **Contract tests** (`lib/data/contract/`) — same fixture, both repos,
  `toEqual`. The parity guarantee.
- **Unit tests** (`lib/data/api/*.test.js`, `lib/data/db/*.test.js`) —
  mock the transport (`opFetch` for API, `pg.Pool.query` for DB). Assert
  the call shape and the returned UI shape.
- **Authz tests** (`lib/data/authz/*.test.js`) — currently the YAML
  permissions parser. Real authz parity is gated on the schema canary.
- **Schema canary** (`lib/data/db/schema-canary.test.js`) — skipped
  unless `OPIRA_TEST_DB_URL` is set. Connects to a real Postgres and
  asserts every column the DB repos rely on still exists.

## Security posture (hybrid mode)

Direct DB access introduces risks API mode doesn't have. The following
mitigations ship by default; deviating from any of them is a deliberate
trade-off, not an oversight.

### 1. Read-only PG user (REQUIRED in production)
Opira never writes to the OP database in hybrid mode. The
`OPENPROJECT_DB_URL` should point at a `SELECT`-only PG role so a SQL
injection or buggy migration cannot mutate OP data:

```sql
CREATE USER opira_reader WITH PASSWORD '<rotate-me>';
GRANT CONNECT ON DATABASE openproject TO opira_reader;
GRANT USAGE ON SCHEMA public TO opira_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO opira_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO opira_reader;
```

This bounds the blast radius of any future bug or leaked credential.

### 2. TLS on the DB link
Append `?sslmode=require` to `OPENPROJECT_DB_URL` whenever the connection
crosses an untrusted network. Or set `OPENPROJECT_DB_SSL=require`. The
pool sets `rejectUnauthorized: true` so a MITM with a self-signed cert
fails closed.

### 3. Visibility filtering
Every DB query goes through `applyProjectVisibility` in
[lib/data/db/visibility.js](../lib/data/db/visibility.js), which adds:
- `p.active = TRUE` for non-admins (archived projects don't leak)
- `p.public = TRUE OR p.id = ANY(viewer's project ids)` (membership /
  public access)

Admins bypass both — same as OP's UI.

### 4. Stored-XSS protection on rendered Markdown
[lib/data/db/markdown.js](../lib/data/db/markdown.js) renders descriptions
and comments to HTML for hybrid mode. Two layers of defence:
1. `marked` runs with `html: false` — raw HTML in the markdown source is
   escaped, not parsed.
2. `isomorphic-dompurify` post-processes the rendered HTML, stripping
   `<script>`, `<iframe>`, event-handler attributes, and JS URLs.

Components that already DOMPurify on render add a third layer.

### 5. Known gaps (use API mode if these matter)
- **Audit-log gap.** OP logs every API request server-side; hybrid reads
  bypass that. For "who viewed this WP description?" forensics, only API
  mode shows up.
- **Stale-session readability.** A disabled OP user can keep reading via
  hybrid until their NextAuth session expires. API mode 401s immediately.
- **Field-level visibility (admin-only custom fields)** is enforced by OP
  per-resource; hybrid returns the raw row and doesn't mask.
- **Time-bound role assignments** aren't replicated.

These are intentional simplifications — covering them all would
re-implement OP's permission system. Switch to `api` mode for any
deployment where they matter.

## Operational

- `GET /api/health/data-source` returns
  `{mode, ok: boolean, latencyMs}`. In `db` mode it runs `SELECT 1`; in
  `api` mode it pings `/api/v3/configuration`.
- `usePublicConfig().dataSource` exposes the active mode read-only to the
  UI for a status pill (no toggle).
- `OPENPROJECT_DB_URL` is **server-only** and **must not be committed**.
  Rotate any value pasted into chat or screen-shared.
