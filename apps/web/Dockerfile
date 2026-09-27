# The web app. Build from the REPOSITORY ROOT, not from apps/web:
#
#   docker build -f apps/web/Dockerfile .
#
# The pnpm lockfile and workspace manifest live at the root, and an install
# without them is not reproducible.
#
# The `VITE_*` values are baked into the client bundle at build time — the
# client only reads `import.meta.env` — so they must arrive as build ARGs.
# The whisper/meridian keys are the opposite: runtime-only env, read by the
# server routes through `process.env`, never baked anywhere.
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# Manifests only. This layer is shared by the build and the production install,
# and it only invalidates when a dependency actually changes.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY services/trailbase/package.json services/trailbase/

FROM manifests AS builder
RUN pnpm install --frozen-lockfile
COPY . .

ARG VITE_TRAILBASE_URL
ARG VITE_SITE_URL
ENV VITE_TRAILBASE_URL=$VITE_TRAILBASE_URL \
    VITE_SITE_URL=$VITE_SITE_URL

RUN pnpm build

# The server bundle is not self-contained — it imports react, @tanstack/*,
# trailbase and srvx at runtime — so production dependencies have to ship too.
FROM manifests AS prod-deps
RUN pnpm install --frozen-lockfile --prod

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder /app/apps/web/dist ./apps/web/dist

WORKDIR /app/apps/web
USER node
EXPOSE 3000

# srvx reads PORT and HOST from the environment and `--prod` turns on graceful
# shutdown. Invoking node directly keeps it as PID 1, so SIGTERM reaches the
# server itself and the stop window is spent draining, not signalling.
CMD ["node", "node_modules/srvx/bin/srvx.mjs", "--prod", "--static=../client", "dist/server/server.js"]
