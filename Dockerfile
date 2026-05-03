# syntax=docker/dockerfile:1.7
#
# Opira — multi-stage Next.js (standalone) image.
#
#   deps    ──>  npm install only, cached on package*.json hash
#   builder ──>  next build → .next/standalone + .next/static
#   runner  ──>  minimal alpine, non-root, runs `node server.js`
#
# Image is ~170 MB compressed; build is ~2 min on first build, ~10 s
# on a code-only change thanks to the `deps` cache layer.

# ── deps ──────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# ── builder ───────────────────────────────────────────────────────
# `output: "standalone"` in next.config.js produces a self-contained
# server at .next/standalone with only the node_modules it actually
# needs — that's the artefact we ship in the runner.
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# All env vars (`OPENPROJECT_URL`, `OPENPROJECT_STORY_POINTS_FIELD`,
# `OPENPROJECT_WORKING_DAYS`, `HOURS_PER_POINT`, OAuth secrets, …) are
# read at request time on the server; values that the client needs
# travel via React context (see `lib/public-config.js`). Nothing is
# baked into the bundle, so the same image runs in any environment —
# no build-args required here.
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

RUN npm run build

# ── runner ────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 --ingroup nodejs nextjs

# Bring across only the standalone bundle, the public/ folder, and
# the static chunks Next serves directly from disk.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public           ./public

USER nextjs
EXPOSE 3000

# Treat any 1xx-4xx as healthy — the root path returns a 307 to
# /sign-in for unauthenticated requests, which is a "the server is
# up and routing" signal.
HEALTHCHECK --interval=30s --timeout=4s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/', r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
