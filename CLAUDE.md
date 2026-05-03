# CLAUDE.md

Guidance for Claude Code (and other AI agents) working in this repository.

## What this project is

**Opira** — a Next.js front-end for [OpenProject](https://www.openproject.org/) styled like Jira. There is **no application database**: every screen is built from live OpenProject v3 API responses, every mutation is round-tripped to the user's OpenProject instance, and OpenProject's permission model is the access control model. Do not introduce a shadow database, ORM, or background workers — if you need data, it comes from OpenProject.

## Stack

- Next.js 16 App Router · React 19 · Tailwind CSS v4 (tokens in [app/globals.css](app/globals.css))
- TanStack Query v5 for reads + optimistic mutations
- NextAuth v5 (beta) — OAuth 2.0 Authorization Code + PKCE against OpenProject
- Tiptap (rich text), `isomorphic-dompurify` (sanitisation on render)
- `react-hook-form` + `zod` for forms and validation
- `@dnd-kit/*` for board / backlog drag-and-drop
- JavaScript with JSDoc, **not** TypeScript. `jsconfig.json` provides the `@/*` path alias.

## Architecture, in three layers

1. **Auth** — [auth.js](auth.js) defines a hand-rolled OAuth provider (OpenProject has no OIDC discovery). The JWT callback rotates refresh tokens with a 60s buffer; failures set `token.error = "RefreshAccessTokenError"`. [auth.config.js](auth.config.js) is the edge-safe slice consumed by middleware.
2. **Server proxy** — every browser request to OpenProject goes through a route handler under [app/api/openproject/](app/api/openproject/). The OAuth bearer is read from the session and injected server-side; **the access token never touches the browser**. Use [opFetch / opPatchWithLock / fetchAllPages](lib/openproject/client.js) — do not call `fetch` against OpenProject from a route handler directly.
3. **Client** — feature components in [components/](components/) consume hooks from [lib/hooks/](lib/hooks/) (TanStack Query wrappers). Mutations are optimistic with rollback. Modal state rides URL params (`?wp=<id>`, `?create=1`, `?s=<sprintId>`) so deep links and back/forward work.

## Working with OpenProject (the bits that bite)

- **Optimistic locking**: most resources carry `lockVersion`. `PATCH` without it fails 409. Use [`opPatchWithLock`](lib/openproject/client.js) — it auto-fetches the current `lockVersion` and retries once on conflict. Surface `LOCK_CONFLICT` to the user as "someone else updated this — refresh".
- **HAL JSON**: responses are HAL — collections under `_embedded.elements`, navigation/permissions under `_links`. The mapper layer at [lib/openproject/mappers.js](lib/openproject/mappers.js) flattens HAL into UI-friendly shapes; prefer adding a mapper over leaking HAL into components.
- **Permissions are live**: every resource's `_links` says which actions the *current* user can perform. Drive button enabled/disabled state from those links via [lib/hooks/use-permissions.js](lib/hooks/use-permissions.js) and [lib/openproject/permissions.js](lib/openproject/permissions.js); never re-derive from role names.
- **Filters are JSON**: OpenProject's `filters` query param is a JSON-encoded array of `{ field: { operator, values } }`. Use [`buildFilters`](lib/openproject/client.js). Operator semantics differ per field — cross-check the v3 spec (memory: `reference_openproject_api_spec.md`) before changing route bodies.
- **Pagination**: max `pageSize` is 1000, pages are 1-indexed via `offset`. Walk with [`fetchAllPages`](lib/openproject/client.js) (hard cap 5000 by default).
- **Story points field**: configurable via `OPENPROJECT_STORY_POINTS_FIELD` (top-level numeric or a `customFieldN` key). Server: read via `process.env`. Client: read via `usePublicConfig().storyPointsField` (see [components/config-provider.jsx](components/config-provider.jsx)). Always go through [lib/openproject/story-points.js](lib/openproject/story-points.js) on the server — never hardcode the field name.
- **Sprints** are surfaced as native OpenProject `version` resources with `open / locked / closed` statuses. There is no separate sprint entity.
- **No fallbacks — API is the source of truth.** Do not classify status / type / priority by keyword-matching the name. The OpenProject API exposes `status.isClosed`, `priority.position`, and `type.color`/`isDefault` — those fields are joined onto every mapped task by `mapWorkPackage` (`statusIsClosed`, `statusColor`, `typeColor`, `priorityColor`, `priorityPosition`). Helpers live in [lib/openproject/task-state.js](lib/openproject/task-state.js): `isTaskClosed`, `buildClosedStatusIdSet`, `priorityRank`. Never compare a task to bucket strings (`t.status === "done"`, `t.type === "epic"`, etc.) — those bucket fields no longer exist on tasks.
- **"Epic-ness" is hierarchy, not type.** Use `task.hasChildren` (derived from `_links.children`) and `task.epic` (the parent's id) to identify parents / children. Never match on type names.
- **Story points come from `OPENPROJECT_STORY_POINTS_FIELD` only.** There is no keyname-scan or `estimatedTime` fallback in `pickStoryPoints`. If the configured field doesn't return a value, the task simply has no points.
- **Work-package keys** are OpenProject's native numeric id (`#1234`). The mapper does not synthesise a Jira-style `PROJ-1234` key — show what OP returns.

## File and code conventions

- File names: **kebab-case** for JSX/JS files (e.g. `task-detail.jsx`, `use-active-sprint.js`).
- Imports: use the `@/*` alias from [jsconfig.json](jsconfig.json), not relative parent paths beyond a single `..`.
- Server-only modules: import `"server-only"` at the top (see [lib/openproject/client.js](lib/openproject/client.js)).
- Route handlers: catch with [`errorResponse`](lib/openproject/route-utils.js) so the client gets `{ error, code, status, upstream }`. The client wrapper [`fetchJson`](lib/api-client.js) reads `code`/`status` from the body and triggers a one-shot `/sign-in` redirect on `REAUTH_REQUIRED`.
- HTML user content (descriptions, comments) **must** be sanitised with `isomorphic-dompurify` on render — do not `dangerouslySetInnerHTML` raw OpenProject HTML.
- Production builds strip `console.log/info/debug` (see [next.config.mjs](next.config.mjs)) — `console.error` and `console.warn` survive.
- Don't introduce TypeScript files. Don't add a state library — TanStack Query + URL params are the state model.

## Environment

| Variable | Required | Notes |
|---|---|---|
| `OPENPROJECT_URL` | yes | Upstream OpenProject base URL. Read on the server (proxy + OAuth); surfaced to the client at request time via `usePublicConfig()`. |
| `OPENPROJECT_OAUTH_CLIENT_ID` / `_SECRET` | yes | OAuth app registered in OpenProject Admin → Authentication → OAuth applications. Scope: `api_v3`. Confidential: yes. |
| `AUTH_SECRET` | yes | `openssl rand -base64 32`. |
| `AUTH_URL` | prod | Public origin; auto-detected in dev. |
| `OPENPROJECT_STORY_POINTS_FIELD` | optional | `storyPoints` (default) or `customFieldN`. Same server→client handoff as `OPENPROJECT_URL`. |
| `OPENPROJECT_WORKING_DAYS` | optional | Comma/space-separated three-letter day prefixes for burndown / capacity (default Mon..Fri). |
| `HOURS_PER_POINT` | optional | Numeric multiplier for the capacity calculation; server-only. |

OAuth redirect URI: `<AUTH_URL>/api/auth/callback/openproject`.

**Runtime config (no `NEXT_PUBLIC_*`).** All env vars are read at request time on the server. Values that the client needs are surfaced via React context: [lib/public-config.js](lib/public-config.js) defines `getServerPublicConfig()` (called once per request from [app/layout.jsx](app/layout.jsx)) and the values are wrapped by [`<ConfigProvider>`](components/config-provider.jsx) inside [components/providers.jsx](components/providers.jsx). Client code reads them with `usePublicConfig()`. This means the same Docker image can be deployed across environments without rebuilding — never reintroduce a `NEXT_PUBLIC_*` var.

## Scripts

```
npm run dev     # Next dev (Turbopack)
npm run build   # production build (output: standalone)
npm run start
npm run lint    # eslint-config-next
```

There is no test suite in this repo today; do not add one without first agreeing on the testing strategy with the maintainer.

## When making changes

- Verify the OpenProject route + body shape against the v3 spec before editing anything under `app/api/openproject/*` — operator names and required fields are easy to get wrong.
- For any mutation, work the optimistic-update + rollback path in the calling hook, not just the server route.
- For any UI affordance, read permissions from `_links` and gate the control via [`usePermissions`](lib/hooks/use-permissions.js) — don't show actions the user can't perform.
- Keep modal/route state in URL params so deep links keep working.
- Follow the global defaults in `~/.claude/CLAUDE.md` (clarification first, no magic numbers, descriptive naming, etc.).
