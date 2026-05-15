<div align="center">

# Opira

### The Jira-grade UI your OpenProject deserves.

**Opira** is a modern, opinionated, **read-write** front-end for [OpenProject](https://www.openproject.org/) — sprint board, backlog, timeline, reports, documents, command palette, the lot — served from a Next.js 16 app that talks to *your* OpenProject instance. By default it goes through the v3 HAL+JSON API; opt into **`OPIRA_DATA_SOURCE=hybrid`** and reads come straight from OpenProject's PostgreSQL while writes still round-trip the API for journal/notification safety.

> No shadow database. No background workers. No vendor lock-in. **Your OpenProject is the source of truth — Opira is just the cockpit.**

[![Next.js 16](https://img.shields.io/badge/Next.js-16.2-000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white)](https://react.dev/)
[![Tailwind v4](https://img.shields.io/badge/Tailwind-v4-38bdf8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![NextAuth v5](https://img.shields.io/badge/NextAuth-v5_beta-000?logo=auth0&logoColor=white)](https://authjs.dev/)
[![TanStack Query v5](https://img.shields.io/badge/TanStack_Query-v5-ff4154?logo=reactquery&logoColor=white)](https://tanstack.com/query)
[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e.svg)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-blueviolet.svg)](./CONTRIBUTING.md)
[![Made with ♥ by Tamzid](https://img.shields.io/badge/made_by-Tamzid_Ahmed-ec4899.svg)](https://github.com/tamzid958)

[Quick Start](#-quick-start) · [Docker](#-docker) · [Configuration](#-configuration) · [Data sources](#-data-sources) · [Architecture](#-architecture) · [Contributing](#-contributing)

</div>

---

## 🚀 Why Opira

OpenProject is a powerful, open-source project-management server. Its UI is comprehensive — and that is precisely the problem. Teams arriving from Jira, Linear, or Shortcut find the screens dense, the shortcuts sparse, and the daily flows (board → backlog → review) more clicks than they should be.

**Opira fixes the front-end without forking the back-end.**

| | Stock OpenProject UI | **Opira** |
|---|---|---|
| Sprint board | Generic board macro | Per-sprint kanban, **drag-and-drop**, swimlanes |
| Backlog | Work-package list | Sprint-grouped, **bulk move/assign/delete**, sub-task expansion |
| Sprints | Versions screen | Native lifecycle (`open` → `locked` → `closed`) with full modals |
| Reports | External plugin | **Burndown + velocity + capacity** built-in |
| Search | Page-level filters | **⌘K command palette** across projects, work packages, people |
| Permissions | Role-name guesswork | Driven by **live `_links` from each resource** |
| Read path | API only | **API or DB-direct** (hybrid mode), same UI shapes |
| Stack | Rails + ERB | **Next.js 16 · React 19 · Tailwind v4** |
| Lock-in | None — Opira is just a different lens on the same API | |

> **Front-end only.** Bring your own OpenProject server (self-hosted Community Edition runs in one `docker run`).

---

## 🎯 Feature matrix

<details open>
<summary><strong>Planning & execution</strong></summary>

- ✅ **Drag-and-drop sprint board** — status-aware columns, swimlanes, search/assignee/type/tag/status filters
- ✅ **Backlog** with bulk move/assign/delete + sub-task expansion
- ✅ **One-click sprint sync** — align dates, roll up story points
- ✅ Sprint lifecycle: create · edit · start · complete · lock · unlock · reopen
- ✅ **Timeline** view with sprint-grouped date bands
- ✅ **JSON import** — drop a tree of work packages into a sprint

</details>

<details open>
<summary><strong>Visibility & reporting</strong></summary>

- ✅ **Burndown** + **velocity** + **capacity** per sprint
- ✅ **Documents reader** — two-pane, embedded attachments proxied so they actually render
- ✅ Activity feed, watchers, file links, time entries, revisions, relations

</details>

<details open>
<summary><strong>Collaboration & QoL</strong></summary>

- ✅ **⌘K / Ctrl-K command palette** across projects, work packages, members
- ✅ **Tiptap rich text** with @-mentions; sanitised on render
- ✅ **Permission-aware UI** — every action button reflects the resource's live `_links`
- ✅ **Notifications**, **members**, **tags**, **reminders**, **shortcuts** modal
- ✅ **Offline queue** — mutations replay on reconnect
- ✅ **Optimistic updates with rollback** — the UI never lies to you
- ✅ **In-app upgrade banner** — signed-in users see when a new release is available
- ✅ **Planning poker** (t-shirt) — live multi-player voting room per work package, optional Redis backend for multi-pod fan-out

</details>

---

## 🖼 Screenshots

<div align="center">

<a href="./docs/screenshots/sign-in.png">
  <img src="./docs/screenshots/sign-in.png" alt="Opira sign-in — Plan, ship, repeat. Your OpenProject, refined." width="100%" />
</a>

<sub><strong>Sign-in.</strong> OAuth 2.0 + PKCE against your OpenProject instance — the access token never reaches the browser.</sub>

</div>

---

## ⚡ Quick start

> Node **22+**, npm 10+, and a reachable OpenProject **v3** instance you can sign in to as an administrator (to register the OAuth app).

```bash
git clone https://github.com/tamzid958/opira.git && cd opira
npm install
cp .env.local.example .env.local && $EDITOR .env.local      # fill in the four required values
npm run dev
```

Open <http://localhost:3000>. The first request bounces through OpenProject for OAuth sign-in.

> 💡 No OpenProject server handy? `docker run -d -p 8080:80 openproject/openproject:14`, then point `OPENPROJECT_URL` at `http://localhost:8080`.

---

## 🐳 Docker

Multi-stage `Dockerfile` (~170 MB compressed, non-root, healthchecked) + ready-to-run `docker-compose.yml`. Two install paths — same image, both honour live env-var swaps without a rebuild.

### Option A — Pull the prebuilt image (recommended)

Every tagged release publishes a multi-arch (`linux/amd64` + `linux/arm64`) image to **GitHub Container Registry**. The image is **public** — no PAT or `docker login` needed. No clone needed either.

```bash
curl -fsSLO https://raw.githubusercontent.com/tamzid958/opira/main/docker-compose.yml
curl -fsSLO https://raw.githubusercontent.com/tamzid958/opira/main/.env.local.example
mv .env.local.example .env && $EDITOR .env      # OAuth client + secret + AUTH_SECRET + AUTH_URL
docker compose up -d                            # → http://localhost:3000
```

Upgrade later: `docker compose pull && docker compose up -d`. Pin a version by editing `docker-compose.yml` (`:latest` → `:0.2.0`).

**Auto-update (opt-in).** The shipped compose includes a [Watchtower](https://containrrr.dev/watchtower/) service that polls ghcr.io every 6h and restarts the container when a new image lands:

```bash
docker compose --profile autoupdate up -d
```

Pair it with the in-app **"new version available" banner** — the banner notifies signed-in users; Watchtower applies the upgrade on its next cycle.

### Option B — Build from source

For forks / local modifications.

```bash
git clone https://github.com/tamzid958/opira.git && cd opira
cp .env.local.example .env && $EDITOR .env
docker compose up -d --build
```

> 💡 All env vars are read at request time. Same image runs in any environment — change `.env` and `docker compose up -d` (no rebuild). Put a TLS-terminating reverse proxy (nginx, Traefik, your cloud's LB) in front.

---

## ⚙ Configuration

| Variable | Required | Purpose |
|---|:---:|---|
| `OPENPROJECT_URL` | ✅ | Base URL of your OpenProject instance, e.g. `https://op.example.com`. |
| `OPENPROJECT_OAUTH_CLIENT_ID` | ✅ | OAuth app client ID (see [OAuth setup](#-register-the-oauth-client-in-openproject)). |
| `OPENPROJECT_OAUTH_CLIENT_SECRET` | ✅ | OAuth app client secret. |
| `AUTH_SECRET` | ✅ | 32+ byte secret signing NextAuth cookies. `openssl rand -base64 32`. |
| `AUTH_URL` | prod only | Public origin. Auto-detected in dev; **set explicitly in production**. |
| `OPIRA_DATA_SOURCE` | optional | `api` (default) or `hybrid`. See [Data sources](#-data-sources). |
| `OPENPROJECT_DB_URL` | when `hybrid` | PostgreSQL connection string for OpenProject's database. Server-only — never log, never commit. |
| `OPENPROJECT_DB_POOL_MAX` | optional | Max DB connections this Next.js process holds open (default `10`). |
| `OPENPROJECT_STORY_POINTS_FIELD` | optional | `storyPoints` (default) or a custom-field key like `customField7`. |
| `OPENPROJECT_WORKING_DAYS` | optional | Comma-separated day prefixes for burndown / capacity (default `Mon,Tue,Wed,Thu,Fri`). |
| `HOURS_PER_POINT` | optional | Hours-per-point for the capacity view (default `4`). |
| `OPIRA_TEST_DB_URL` | optional | Connection string used by the schema canary + DB integration tests (skipped when unset). |
| `OPIRA_REDIS_URL` | optional | Redis connection string. Used for two things: **lookup caching** (statuses, types, priorities, schemas, t-shirt options — 30–60 min TTL, shared across pods) and **planning-poker** rooms (30-min idle TTL, pub/sub fan-out). Unset → both fall back to in-process Maps. Server-only. |

All env vars are read at request time on the server. Values the client needs (`OPENPROJECT_URL`, `OPENPROJECT_STORY_POINTS_FIELD`, `OPENPROJECT_WORKING_DAYS`, plus a read-only `dataSource` indicator) are surfaced through React context — no `NEXT_PUBLIC_*` baking, no rebuild to change envs. Server-only secrets (`AUTH_SECRET`, OAuth client secret, `OPENPROJECT_DB_URL`) **never reach the browser**.

---

## 🔀 Data sources

Opira reads OpenProject through a [repository layer](./lib/data/) with two runtime-selectable modes. Both produce **identical UI shapes** — components don't change when the toggle flips.

| Mode | Reads | Writes | When to use |
|---|---|---|---|
| `api` (default) | API | API | No DB credentials wired yet. Always-correct, slowest on big projects. |
| `hybrid` (recommended) | DB-direct (`pg`) | API | Once `OPENPROJECT_DB_URL` is set. Joins, large lists, and dashboards become much faster; writes still go through the API so journals, notifications, parent progress, and webhooks stay intact. Phase 2 will graduate selected writes here under an explicit per-field opt-in. |

Toggle with one env var, no rebuild:

```bash
OPIRA_DATA_SOURCE=hybrid
OPENPROJECT_DB_URL=postgres://op_user:secret@db.internal:5432/openproject_production
```

Health probe: `curl http://localhost:3000/api/health/data-source` → `{mode: "hybrid", ok: true, dbLatencyMs: …, apiLatencyMs: …}`.

Architecture details and how-to-add-an-entity are in [docs/data-layer.md](./docs/data-layer.md).

---

## 🃏 Planning poker

Open a work package, switch the right sidebar to the **Poker** tab, and you're in a live voting room — one room per work package, joined automatically by anyone with edit access. Cast a card, hit **Reveal** when everyone's in, and **Apply** writes the agreed size back to OpenProject through the same `useUpdateTask` mutation any other estimate uses (so journals, notifications, and `lockVersion` all behave normally).

The Poker tab only appears when the project's story-points field is configured as a t-shirt-style `CustomOption` (see `OPENPROJECT_STORY_POINTS_FIELD`). Numeric / duration fields keep working through the regular picker.

### How it fans out

```mermaid
flowchart LR
  subgraph Browsers
    A["Browser A<br/>(/projects/.../?wp=42, Poker tab)"]
    B["Browser B<br/>(/projects/.../?wp=42, Poker tab)"]
  end

  subgraph Pods["Next.js (1+ pods)"]
    P1["Pod 1<br/>SSE stream + POST handlers"]
    P2["Pod 2<br/>SSE stream + POST handlers"]
  end

  subgraph Store["lib/poker — async facade"]
    direction TB
    Facade["room-store.js<br/>(picks backend at module load)"]
    Mem[("memory-store.js<br/>Map&lt;roomId, RoomState&gt;<br/>30-min idle eviction")]
    Redis[("redis-store.js<br/>opira:poker:room:&#123;id&#125;<br/>WATCH/MULTI + pub/sub")]
    Facade -- "OPIRA_REDIS_URL unset" --> Mem
    Facade -- "OPIRA_REDIS_URL set" --> Redis
  end

  RedisSrv[("Redis<br/>JSON blob per room<br/>30-min TTL<br/>opira:poker:room:&#123;id&#125;:events")]

  A <-- "EventSource<br/>SSE" --> P1
  B <-- "EventSource<br/>SSE" --> P2
  P1 --> Facade
  P2 --> Facade
  Redis <--> RedisSrv

  classDef pod fill:#eef,stroke:#447
  classDef store fill:#efe,stroke:#474
  classDef ext fill:#fee,stroke:#744
  class P1,P2 pod
  class Mem,Redis,Facade store
  class RedisSrv ext
```

A vote on Pod 1 writes to Redis and `PUBLISH`es on the room's channel. Pod 2's subscriber wakes up, re-fetches `getPublicState`, and pushes a `room.state` event down its SSE pipe to Browser B. Without Redis, the same flow stays inside one pod's `Map`.

### Two backends, one signature

The room store ([lib/poker/](./lib/poker/)) is an async facade that picks at module load:

| Backend | Selected when | Behaviour |
|---|---|---|
| **In-memory** | `OPIRA_REDIS_URL` unset (default) | `Map<roomId, RoomState>` per Next.js process. 30-min idle eviction. Lost on restart. **Single pod only** — different replicas won't see each other's rooms. |
| **Redis** | `OPIRA_REDIS_URL` set | Whole-room JSON blob at `opira:poker:room:{roomId}`, 30-min TTL refreshed on every write. Mutations use WATCH/MULTI for atomic R-M-W. Pub/sub on `…:events` fans state changes out to every connected pod. **Multi-pod safe.** Rooms still ephemeral — TTL expires and rooms vanish. |

If Redis is configured but unreachable, the SSE stream + POST routes return `503` and the FAB shows "Room offline" — the regular `TShirtPicker` keeps working for solo single-click estimates.

### Wiring Redis with Compose

`docker-compose.yml` ships a `redis` service alongside `opira`. Just set `OPIRA_REDIS_URL` in `.env` and bring the stack up — Opira `depends_on: redis (service_healthy)` so it waits for Redis before starting.

```bash
# In .env
OPIRA_REDIS_URL=redis://redis:6379

docker compose up -d
```

The bundled Redis is hardened for the poker workload: 64 MB memory cap with `allkeys-lru` eviction, AOF persistence on a `redis-data` volume so a container restart mid-vote doesn't reset live rooms, no port mapping (the Compose network is the auth boundary — there's no password). Inspect with `docker compose exec redis redis-cli`.

If you'd rather not run Redis at all, leave `OPIRA_REDIS_URL` unset — Opira falls back to the in-memory store for both poker and lookup caching. The Redis container will still come up unused; remove it from `docker-compose.yml` if you want to skip it entirely.

### Lookup caching in Redis

When `OPIRA_REDIS_URL` is set, Opira caches OpenProject metadata that rarely changes across all pods:

| Data | TTL | Cache key pattern |
|---|---|---|
| Statuses, priorities | 30 min | `opira:lookups:statuses`, `opira:lookups:priorities` |
| Types | 30 min | `opira:lookups:types:{projectId\|__global__}` |
| Work-package schema | 60 min | `opira:lookups:schema:{projectId}-{typeId}` |
| T-shirt size options | 30 min | `opira:lookups:custom-options:{href}` |

Each pod also keeps a 5-minute in-process copy so Redis round-trips only happen on first load per pod. The cache degrades gracefully — if Redis is unreachable the in-process Map serves the request.

If an OpenProject admin changes types, statuses, or custom fields and you need immediate effect, flush the cache without restarting:

```bash
curl -X DELETE https://your-opira.example.com/api/openproject/lookups/cache \
  -H "Cookie: <your session cookie>"
# → { "ok": true, "deleted": 5 }
```

In-process caches drain naturally within 5 minutes after the DELETE.

---

## 🔑 Register the OAuth client in OpenProject

Once, in your OpenProject admin: **Administration → Authentication → OAuth applications → Add**.

| Field | Value |
|---|---|
| **Name** | `Opira` (or anything memorable) |
| **Redirect URI** | `<AUTH_URL>/api/auth/callback/openproject`<br>_locally:_ `http://localhost:3000/api/auth/callback/openproject` |
| **Confidential** | ✅ yes |
| **Scopes** | `api_v3` |

Save, then copy the generated **Client ID** + **Client Secret** into `.env`.

> Refresh tokens rotate transparently in [auth.js](./auth.js) with a 60s buffer; failures set `token.error = "RefreshAccessTokenError"` and redirect to `/sign-in`.

---

## 🧭 Routes & deep links

| Path | Purpose |
|---|---|
| `/` → `/projects` | Bounces to your last-visited project, or the first one accessible. |
| `/projects/<id>/board` | Sprint board with filters and switcher. |
| `/projects/<id>/backlog` | Sprint sections with bulk operations. |
| `/projects/<id>/timeline` | Calendar-style timeline. |
| `/projects/<id>/reports` | Burndown + velocity + capacity. |
| `/projects/<id>/{overview,tags,members,documents}` | Project dashboard, categories, memberships, documents reader. |
| `/account` | Identity + deep-link to OpenProject account settings. |

**Modal state rides URL params** — `?wp=<id>` opens a work package, `?create=1` opens the create dialog, `?s=<id>` selects a board sprint. Deep links are shareable and the back button just works.

---

## 🏗 Architecture

Three layers, one promise: **the access token never touches the browser.**

```
┌────────────────────────────────────────────────────────────────────┐
│                            BROWSER                                 │
│  React 19 components ── TanStack Query hooks ── URL params (state) │
└─────────────────────────────────┬──────────────────────────────────┘
                                  │  fetchJson()  (lib/api-client.js)
                                  ▼
┌────────────────────────────────────────────────────────────────────┐
│                NEXT.JS SERVER  (route handlers)                    │
│  app/api/openproject/*  ── repository layer (lib/data/)            │
│  Reads OAuth bearer from session, injects Authorization header     │
└──────────────┬───────────────────────────────────┬─────────────────┘
       writes  │                            reads  │  (mode: hybrid/db)
              ▼                                   ▼
   ┌──────────────────────────┐      ┌──────────────────────────┐
   │  OPENPROJECT v3 API      │      │  OPENPROJECT POSTGRES    │
   │  (HAL+JSON, your server) │      │  (pg, server-only pool)  │
   └──────────────────────────┘      └──────────────────────────┘
```

In `api` mode every arrow goes left; in `hybrid`/`db` mode reads go right (DB-direct) and writes go left (API). The repository layer in [lib/data/](./lib/data) presents one shape to the components either way.

- **Layer 1 — Auth** ([auth.js](./auth.js)). Hand-rolled OAuth provider (OpenProject has no OIDC discovery). JWT callback rotates refresh tokens; [auth.config.js](./auth.config.js) is the edge-safe slice consumed by middleware.
- **Layer 2 — Server proxy + repos** ([app/api/openproject/](./app/api/openproject), [lib/data/](./lib/data)). Every browser request is brokered server-side; OAuth bearer injected here. Route handlers delegate to repositories — `lib/data/api/*.api.js` (HAL via [`opFetch`](./lib/openproject/client.js)) and `lib/data/db/*.db.js` (SQL via the `pg` pool in [lib/data/db/client.js](./lib/data/db/client.js)).
- **Layer 3 — Client** ([components/](./components)). Feature components consume hooks from [lib/hooks/](./lib/hooks). Mutations are optimistic with rollback. Modal state lives in URL params.

### The bits that bite (read before editing the API layer)

- 🔒 **Optimistic locking** — most resources carry `lockVersion`. `PATCH` without it fails 409. Use [`opPatchWithLock`](./lib/openproject/client.js); surface `LOCK_CONFLICT` as _"someone else updated this — refresh"_.
- 🔗 **HAL JSON** — collections under `_embedded.elements`, navigation/permissions under `_links`. Flatten through [mappers.js](./lib/openproject/mappers.js); never leak HAL into components.
- 🛡 **Live permissions** — each resource's `_links` says what the *current* user can do. Drive UI gating via [`usePermissions`](./lib/hooks/use-permissions.js); never re-derive from role names.
- 🧮 **Filters are JSON** — OpenProject's `filters` query param is a JSON-encoded array of `{ field: { operator, values } }`. Use [`buildFilters`](./lib/openproject/client.js).
- 📄 **Pagination** — max `pageSize` 1000, 1-indexed via `offset`. Walk with [`fetchAllPages`](./lib/openproject/client.js) (default cap 5000).
- 🎯 **Story points field is configurable** — always read through [story-points.js](./lib/openproject/story-points.js).
- 🏃 **Sprints are OpenProject `version` resources** with `open / locked / closed` statuses.

Detailed agent-facing conventions live in [CLAUDE.md](./CLAUDE.md).

---

## 📂 Project layout

```text
opira/
├─ app/                                  Next.js App Router
│  ├─ layout.jsx · page.jsx · {loading,error,not-found}.jsx
│  ├─ projects/[projectId]/{board,backlog,timeline,reports,overview,tags,members,documents}/
│  ├─ api/openproject/*                  authenticated proxy routes
│  ├─ api/health/data-source/            mode + latency probe
│  ├─ api/updates/check/                 GitHub-release poll for the upgrade banner
│  └─ account/page.jsx
├─ components/{ui/,*.jsx}                shared primitives + feature components
├─ lib/
│  ├─ data/                              repository layer (api/, db/, authz/, ports/)
│  │  ├─ api/lookup-repository.api.cached.js   Redis+in-process cache wrapper for lookups
│  │  └─ redis-lookups-cache.js                get/set/flush helpers for opira:lookups:* keys
│  ├─ hooks/                             TanStack Query wrappers
│  ├─ openproject/                       HAL client + mappers + helpers
│  └─ {offline,server}/
├─ auth.js · auth.config.js              NextAuth wiring
├─ docs/data-layer.md                    repository pattern + Phase 1/2 plan
├─ Dockerfile · docker-compose.yml       container build + stack
└─ next.config.mjs · jsconfig.json · vitest.config.js
```

---

## 🧰 Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | [Next.js 16](https://nextjs.org/) (App Router, Turbopack) | RSC + route handlers + standalone output |
| UI runtime | [React 19](https://react.dev/) | actions, transitions, suspense |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) | tokens declared once in `app/globals.css` |
| Data | [TanStack Query v5](https://tanstack.com/query) | optimistic mutations + rollback |
| Auth | [NextAuth.js v5](https://authjs.dev/) | OAuth 2.0 + PKCE, refresh-token rotation |
| Forms | [react-hook-form](https://react-hook-form.com/) + [zod](https://zod.dev/) | validation + shape inference |
| Editor | [Tiptap](https://tiptap.dev/) + [DOMPurify](https://github.com/cure53/DOMPurify) | rich text, sanitised on render |
| DnD · Icons · Toasts | [dnd-kit](https://dndkit.com/) · [lucide-react](https://lucide.dev/) · [sonner](https://sonner.emilkowal.ski/) | accessible · tree-shakeable · themed |
| Lang | **JavaScript + JSDoc** (not TypeScript by design) | `@/*` alias via `jsconfig.json` |

---

## 🛠 Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Turbopack dev server on `:3000`. |
| `npm run build` | Production build → `.next/standalone`. |
| `npm run start` | Run the production build locally. |
| `npm run lint` | ESLint via `eslint-config-next`. |
| `npm test` | Vitest (watch mode). |
| `npm run test:run` | Vitest one-shot — what CI runs. |
| `npm run test:coverage` | Vitest + v8 coverage. |

The Vitest suite lives next to the data-layer code (`lib/data/**/*.test.js`) and asserts the contract that **API and DB repositories produce identical UI shapes** for the same logical entity. The DB schema canary (`lib/data/db/schema-canary.test.js`) and live integration tests are skipped unless `OPIRA_TEST_DB_URL` is set, so the default suite needs no Docker. Strategy: [docs/data-layer.md](./docs/data-layer.md#testing-strategy).

---

## 📦 Performance & footprint

- **Image** — ~170 MB compressed, multi-stage build, alpine runner, non-root (`uid 1001`).
- **Cold build** — ~2 min on a fresh machine; **~10 s** on a code-only change (deps cache layer).
- **Bundle** — `console.log/info/debug` stripped in production (see [next.config.mjs](./next.config.mjs)); `error` and `warn` survive.
- **Health probe** — accepts any 1xx-4xx (a 307 to `/sign-in` means the server is up and routing).

---

## 🛡 Security model

- **Access tokens are server-side only.** OAuth bearer is injected in route handlers and never serialised to the client.
- **Refresh tokens rotate** with a 60s buffer; rotation failures redirect to `/sign-in`.
- **HTML user content** (descriptions, comments) is **always** sanitised with `isomorphic-dompurify` on render. Never `dangerouslySetInnerHTML` raw OpenProject HTML.
- **Permissions** are read live from each resource's `_links`; never duplicated client-side.
- **CSRF** handled via NextAuth signed session cookies + same-origin proxy routes.

Suspected vulnerabilities → please report privately per [SECURITY.md](./SECURITY.md). Do **not** open a public issue.

---

## 🤝 Contributing

PRs welcome — small or large. Full guide in [CONTRIBUTING.md](./CONTRIBUTING.md). 30-second version:

```bash
git clone https://github.com/<your-fork>/opira.git && cd opira
git checkout -b feat/<short-name>          # or fix/, refactor/, docs/, chore/, test/
# …make your changes…
npm run lint && npm run build              # both must pass
git commit -m "feat(board): swimlanes by assignee"
# Open a PR against `main`. Attach a screen-record for any UI change.
```

Conventional prefixes: `feat:` · `fix:` · `refactor:` · `docs:` · `chore:` · `test:`. Code of Conduct in [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

---

## ❓ FAQ

<details>
<summary><strong>Does Opira store any of my data?</strong></summary>

No. Opira owns no application database and collects no analytics. Every screen reads from your OpenProject instance and every mutation is round-tripped to it. The only persistent state Opira owns is your signed session cookie. If you opt in to `OPIRA_REDIS_URL`, Opira writes short-lived cache entries (lookup metadata, poker rooms) into Redis under the `opira:` namespace — these are ephemeral and safe to delete at any time. (In `hybrid` mode Opira reads directly from *OpenProject's* PostgreSQL — that's still **your** OP server's database, not a separate Opira store.)
</details>

<details>
<summary><strong>When should I switch to <code>hybrid</code> mode?</strong></summary>

When the v3 API gets in your way. The HAL+JSON pagination is fine for small projects but starts to feel slow once boards and backlogs cross a few hundred work packages. With `OPIRA_DATA_SOURCE=hybrid` the read path is direct SQL with native joins — list pages are noticeably snappier, and you unlock fields the API doesn't expose. Writes still go through the API in Phase 1, so OpenProject's journals, notifications, parent-progress recalc, and webhooks all stay correct. You need a Postgres connection string (`OPENPROJECT_DB_URL`) and that's it — no schema migrations, no shadow data store. Stay on `api` if your OP install is small or you can't grant DB access from where Opira runs.
</details>

<details>
<summary><strong>Can I run Opira against OpenProject Cloud?</strong></summary>

Yes — point `OPENPROJECT_URL` at your hosted instance and register the OAuth app under your cloud admin. Opira doesn't care whether the server is self-hosted or hosted by Greenkeeper GmbH. Note that **`hybrid` mode is only practical for self-hosted instances** since Cloud doesn't expose the underlying Postgres.
</details>

<details>
<summary><strong>Why JavaScript and not TypeScript?</strong></summary>

Pragmatism. The codebase uses JSDoc + `jsconfig.json` for editor tooling and avoids the TS toolchain tax. PRs that flip files to `.ts`/`.tsx` will be declined.
</details>

<details>
<summary><strong>Does Opira replace OpenProject?</strong></summary>

No. Opira is a **front-end only** — zero meaning without an OpenProject server behind it. Think "Insomnia for REST" or "TablePlus for Postgres" — same data, different cockpit.
</details>

<details>
<summary><strong>How do permissions work?</strong></summary>

OpenProject returns a `_links` object on every resource that lists the actions the *current* user can perform. Opira reads that directly via [`usePermissions`](./lib/hooks/use-permissions.js) and gates every button accordingly. There is no role-name table to keep in sync.
</details>

<details>
<summary><strong>What about offline?</strong></summary>

Mutations queue in [lib/offline/](./lib/offline) when the network drops and replay when it returns. Reads are cached by TanStack Query.
</details>

---

## 📜 License & credits

[MIT](./LICENSE) © **Tamzid Ahmed**

Built on the [OpenProject](https://www.openproject.org/) team's excellent v3 API and the [Next.js](https://nextjs.org/) team's App Router.

If Opira saves your team time, **⭐ star the repo** — that's how it finds its next user.

<div align="center">

**[⬆ back to top](#opira)**

</div>
