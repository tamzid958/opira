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

[Quick Start](#-quick-start) · [Docker](#-docker) · [Configuration](#-configuration) · [Data sources](#-data-sources) · [AI Assist](#-ai-assist) · [Architecture](#-architecture) · [Contributing](#-contributing)

</div>

---

## 🚀 Why Opira

OpenProject is a powerful, open-source project-management server. Its UI is comprehensive — and that is precisely the problem. Teams arriving from Jira, Linear, or Shortcut find the screens dense, the shortcuts sparse, and the daily flows more clicks than they should be.

**Opira fixes the front-end without forking the back-end.**

| | Stock OpenProject UI | **Opira** |
|---|---|---|
| Sprint board | Generic board macro | Per-sprint kanban, drag-and-drop, swimlanes |
| Backlog | Work-package list | Sprint-grouped, bulk move/assign/delete, sub-task expansion |
| Sprints | Versions screen | Native lifecycle with full modals |
| Reports | External plugin | Burndown + velocity + capacity built-in |
| Search | Page-level filters | ⌘K command palette |
| Permissions | Role-name guesswork | Driven by live `_links` from each resource |
| Read path | API only | API or DB-direct (hybrid mode) |
| Stack | Rails + ERB | Next.js 16 · React 19 · Tailwind v4 |

> **Front-end only.** Bring your own OpenProject server. Self-hosted Community Edition runs in one `docker run`.

---

## 🎯 Features

- **Drag-and-drop sprint board** — status columns, swimlanes, search/assignee/type/tag/status filters
- **Backlog** with bulk move/assign/delete + sub-task tree expansion
- **Sprint lifecycle** — create, edit, start, complete, lock, unlock, reopen
- **Reports** — burndown, velocity, capacity per sprint
- **Timeline** view with sprint-grouped date bands
- **⌘K command palette** — search projects, work packages, members
- **Planning poker** — live multi-player t-shirt voting per work package
- **AI assist** — optional Ollama-powered suggestions across 12 integration points
- **Offline queue** — mutations replay on reconnect
- **In-app upgrade banner** — signed-in users see when a new release is available
- **JSON import** — drop a tree of work packages into a sprint

---

## 🖼 Screenshots

<div align="center">

<a href="./docs/screenshots/sign-in.png">
  <img src="./docs/screenshots/sign-in.png" alt="Opira sign-in — Plan, ship, repeat. Your OpenProject, refined." width="100%" />
</a>

<sub>OAuth 2.0 + PKCE — the access token never reaches the browser.</sub>

</div>

---

## ⚡ Quick start

> Node 22+, npm 10+, and an OpenProject v3 instance with admin access for OAuth registration.

```bash
git clone https://github.com/tamzid958/opira.git && cd opira
npm install
cp .env.local.example .env.local && $EDITOR .env.local
npm run dev
```

Open http://localhost:3000. No OP server handy? `docker run -d -p 8080:80 openproject/openproject:14`.

---

## 🐳 Docker

Two install paths. Same image honours live env-var swaps without a rebuild.

### Option A — Pull prebuilt (recommended)

Multi-arch images on GitHub Container Registry — public, no login needed.

```bash
curl -fsSLO https://raw.githubusercontent.com/tamzid958/opira/main/docker-compose.yml
curl -fsSLO https://raw.githubusercontent.com/tamzid958/opira/main/.env.local.example
mv .env.local.example .env && $EDITOR .env
docker compose up -d
```

Upgrade: `docker compose pull && docker compose up -d`.

### Option B — Build from source

```bash
git clone https://github.com/tamzid958/opira.git && cd opira
cp .env.local.example .env && $EDITOR .env
docker compose up -d --build
```

> 💡 Change `.env` and re-run `docker compose up -d` — no rebuild needed. The shipped compose also has an opt-in [Watchtower](https://containrrr.dev/watchtower/) profile (`--profile autoupdate`) for automatic updates.

---

## ⚙ Configuration

| Variable | Required | Purpose |
|---|---|---|
| `OPENPROJECT_URL` | ✅ | Your OpenProject base URL |
| `OPENPROJECT_OAUTH_CLIENT_ID` / `_SECRET` | ✅ | OAuth app credentials |
| `AUTH_SECRET` | ✅ | `openssl rand -base64 32` |
| `AUTH_URL` | prod | Public origin (auto-detected in dev) |
| `OPIRA_DATA_SOURCE` | optional | `api` (default) or `hybrid` |
| `OPENPROJECT_DB_URL` | hybrid | Postgres connection string (server-only) |
| `OPENPROJECT_STORY_POINTS_FIELD` | optional | `storyPoints` (default) or `customFieldN` |
| `OPENPROJECT_WORKING_DAYS` | optional | `Mon,Tue,Wed,Thu,Fri` default |
| `HOURS_PER_POINT` | optional | `4` default |
| `OPIRA_REDIS_URL` | optional | Redis for multi-layer server cache + planning poker rooms |
| `OLLAMA_BASE_URL` | optional | Enables AI assist (Ollama) |
| `OLLAMA_API_KEY` | optional | For Ollama Cloud (server-only) |
| `OLLAMA_MODEL` | optional | Model name (auto-discovered locally) |

All env vars read at request time. Client values surface through React context — no `NEXT_PUBLIC_*` baking.

---

## 🔀 Data sources

Opira reads OpenProject through a [repository layer](./lib/data/) with two modes. Both produce identical UI shapes.

| Mode | Reads | Writes | When to use |
|---|---|---|---|
| `api` (default) | API | API | No DB credentials needed. Always correct. |
| `hybrid` | DB-direct (`pg`) | API | Faster on large projects; writes still route through the API for journal/notification safety. |

Toggle with one env var: `OPIRA_DATA_SOURCE=hybrid` + `OPENPROJECT_DB_URL=postgres://...`.

Health probe: `curl http://localhost:3000/api/health/data-source`. Details in [docs/data-layer.md](./docs/data-layer.md).

---

## 🃏 Planning poker

Open a work package, switch to the **Poker** tab — one room per work package, joined automatically by anyone with edit access. Cast a card, hit **Reveal**, and **Apply** writes the agreed size back through the same mutation pipeline (journals, notifications, `lockVersion` all behave normally). The tab only appears when story points use a t-shirt-style `CustomOption`.

The room store ([lib/poker/](./lib/poker/)) picks a backend at module load:

| Backend | Selected when | Behaviour |
|---|---|---|
| **In-memory** | `OPIRA_REDIS_URL` unset | `Map` per process, 30-min idle eviction, lost on restart. Single pod only. |
| **Redis** | `OPIRA_REDIS_URL` set | JSON blob + pub/sub across pods. 30-min TTL. Multi-pod safe. |

If Redis is unreachable, the FAB shows "Room offline" — the regular `TShirtPicker` still works for solo estimates. Without Redis, the in-memory fallback works for single-pod deployments.

When Redis is active, Opira maintains a two-layer server cache (in-process Map → Redis) across all reference data. The `DELETE /api/openproject/lookups/cache` endpoint (also the "Refresh data" button on the account page) flushes all three namespaces at once.

| Namespace | Data | Redis TTL |
|---|---|---|
| `opira:lookups:*` | Statuses, types, priorities, roles, time-entry activities, schemas, custom field options | 7–30 days |
| `opira:sprints:*` | Versions / sprints per project | 30 min (invalidated on version mutations) |
| `opira:perms:*` | Effective permissions per user | 1 day (invalidated on sign-out / refresh) |
| `opira:assignees:*` | Available assignees per project | 15 min (invalidated on membership mutations) |
| `opira:categories:*` | Categories per project | 1 day (invalidated on category mutations) |

---

## ✨ AI assist

Opira integrates [Ollama](https://ollama.com) (local or cloud) across 12 touch-points — task create/detail, sprint planning, milestone tracking, backlog grooming, and reports. Every button is optional: when `OLLAMA_BASE_URL` is unset nothing changes.

**Action variants:** `insert` (fills field immediately), `accept` (preview → accept/dismiss), `append` (preview → append to existing), `copy` (preview → clipboard).

### Setup

```bash
# Local Ollama (no API key)
ollama pull llama3.2
OLLAMA_BASE_URL=http://localhost:11434

# Ollama Cloud (API key required)
OLLAMA_BASE_URL=https://ollama.com
OLLAMA_API_KEY=<your key>
OLLAMA_MODEL=llama3.2
```

### How prompts are built

All user-supplied fields are stripped of HTML, null bytes, and control characters before entering the prompt (prompt-injection prevention). Model output is sanitised with DOMPurify against a strict `<p>/<ul>/<ol>/<li>/<strong>/<em>/<br>` allowlist.

### Error handling

| Scenario | User sees |
|---|---|
| Ollama not running / unreachable | _"AI service unavailable — is Ollama running?"_ |
| No local model and `OLLAMA_MODEL` unset | _"No Ollama model configured…"_ |
| Request timeout (30 s) | _"AI request timed out"_ |

---

## 🔑 OAuth setup

In OpenProject admin: **Administration → Authentication → OAuth applications → Add**.

| Field | Value |
|---|---|
| Name | `Opira` |
| Redirect URI | `<AUTH_URL>/api/auth/callback/openproject` (locally `http://localhost:3000/…`) |
| Confidential | ✅ yes |
| Scopes | `api_v3` |

Save, copy **Client ID** + **Secret** into `.env`. Refresh tokens rotate transparently in [auth.js](./auth.js).

---

## 🧭 Routes

| Path | Purpose |
|---|---|
| `/projects/<id>/board` | Sprint board with filters |
| `/projects/<id>/backlog` | Sprint sections with bulk operations |
| `/projects/<id>/timeline` | Calendar timeline |
| `/projects/<id>/reports` | Burndown, velocity, capacity |
| `/projects/<id>/{overview,tags,members,documents}` | Dashboard, categories, memberships, docs |
| `/account` | Profile |

Modal state lives in URL params (`?wp=<id>`, `?create=1`, `?s=<sprintId>`) — deep links and back/forward work.

---

## 🏗 Architecture

Three layers, one promise: **the access token never touches the browser.**

```
Browser → Next.js route handlers → OpenProject API (writes)
                                ↕ (hybrid: reads via pg)
                              OpenProject Postgres
```

- **Layer 1 — Auth** ([auth.js](./auth.js)). Hand-rolled OAuth provider. JWT callback rotates refresh tokens.
- **Layer 2 — Server proxy** ([app/api/openproject/](./app/api/openproject)). Every request brokered server-side; OAuth bearer injected here. Route handlers delegate to [lib/data/](./lib/data) — API repos via `opFetch`, DB repos via `pg`.
- **Layer 3 — Client** ([components/](./components)). TanStack Query hooks + URL-param modals. Mutations are optimistic with rollback.

### OpenProject gotchas

- `PATCH` without `lockVersion` fails 409 — use [`opPatchWithLock`](./lib/openproject/client.js)
- HAL collections under `_embedded.elements` — flatten through [mappers.js](./lib/openproject/mappers.js)
- Permissions from live `_links`, never role names — use [`usePermissions`](./lib/hooks/use-permissions.js)
- Filters are JSON-encoded arrays — use [`buildFilters`](./lib/openproject/client.js)
- Max `pageSize` 1000, 1-indexed via `offset` — use [`fetchAllPages`](./lib/openproject/client.js)
- Story points field is configurable — read through [story-points.js](./lib/openproject/story-points.js)
- Sprints are OpenProject `version` resources (`open` / `locked` / `closed`)

Agent conventions: [CLAUDE.md](./CLAUDE.md).

---

## 📂 Project layout

```
app/                   Next.js App Router (pages + API routes)
  api/openproject/     Authenticated proxy to OP
  api/ai/              Ollama proxy
  projects/[id]/       Board, backlog, timeline, reports, etc.
components/            React components (primitives + features)
lib/
  data/                Repository layer (api/ + db/ + authz/)
  hooks/               TanStack Query wrappers
  openproject/         HAL client, mappers, helpers
auth.js                NextAuth OAuth wiring
```

---

## 🧰 Tech stack

Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · TanStack Query v5 · NextAuth v5 · react-hook-form + zod · Tiptap + DOMPurify · dnd-kit · lucide-react · sonner · JavaScript + JSDoc

## 🛠 Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Turbopack dev server |
| `npm run build` | Production build |
| `npm run start` | Run production build locally |
| `npm run lint` | ESLint |
| `npm test` | Vitest (watch) |
| `npm run test:run` | Vitest one-shot |

Tests in `lib/data/**/*.test.js` assert API and DB repos produce identical UI shapes. Strategy: [docs/data-layer.md](./docs/data-layer.md).

## 📦 Performance

~170 MB compressed image, multi-stage alpine build, non-root. `console.log/info/debug` stripped in production.

**Server-side caching** uses a three-tier hierarchy so cold-load API fan-out is minimal:

```
L0  TanStack Query       browser   staleTime 30 s (5 min for /users/me)
L1  in-process Map       per pod   TTL varies, LRU max-200 eviction
L2  Redis (optional)     shared    TTL varies, survives restarts / rolling deploys
L3  OpenProject API      source    always authoritative
```

A **singleflight** guard on the permissions loader coalesces the 6–8 parallel route-handler calls that fire on cold page load into a single OpenProject fan-out. Without Redis, the in-process cache still de-duplicates within a pod's lifetime.

---

## 🛡 Security

- OAuth bearer injected server-side — never serialised to the client
- Refresh tokens rotate with a 60s buffer; failure redirects to `/sign-in`
- HTML user content sanitised with `isomorphic-dompurify` on render
- AI inputs stripped of HTML/control chars before prompts; output DOMPurify-sanitised
- CSRF handled via NextAuth signed session cookies + same-origin proxy

---

## 🤝 Contributing

PRs welcome. Full guide in [CONTRIBUTING.md](./CONTRIBUTING.md).

```bash
git checkout -b feat/your-feature
# make changes
npm run lint && npm run build
git commit -m "feat: your feature"
# open PR against main
```

Prefixes: `feat:` · `fix:` · `refactor:` · `docs:` · `chore:` · `test:`.

---

## ❓ FAQ

<details>
<summary><strong>Does Opira store any of my data?</strong></summary>

No. Opira owns no database and collects no analytics. Every screen reads from your OpenProject instance. The only persistent state is your session cookie. With Redis, ephemeral cache entries under `opira:` namespace.
</details>

<details>
<summary><strong>When should I switch to hybrid mode?</strong></summary>

When the v3 API feels slow on large projects. Hybrid reads via SQL — snappier lists, unlocks fields the API doesn't expose. Writes still go through the API so journals and notifications remain correct.
</details>

<details>
<summary><strong>Can I run Opira against OpenProject Cloud?</strong></summary>

Yes — point `OPENPROJECT_URL` at your hosted instance. Hybrid mode is only for self-hosted (Cloud doesn't expose Postgres).
</details>

<details>
<summary><strong>Why JavaScript, not TypeScript?</strong></summary>

Pragmatism. JSDoc + `jsconfig.json` for tooling, no TS toolchain tax. PRs flipping to `.ts` will be declined.
</details>

<details>
<summary><strong>What about offline?</strong></summary>

Mutations queue in [lib/offline/](./lib/offline) and replay on reconnect. Reads cached by TanStack Query.
</details>

---

## 📜 License

[MIT](./LICENSE) © **Tamzid Ahmed**
