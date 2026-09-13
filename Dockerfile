# syntax=docker/dockerfile:1.7
# Multi-target image: `--target api` (Fastify API + worker) or `--target web` (Next.js).

FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# ---------------------------------------------------------------- api build
FROM base AS api-build
RUN npm ci --workspace apps/api --include-workspace-root --include=dev
COPY apps/api apps/api
RUN npm run build -w apps/api && npm prune --omit=dev --workspace apps/api && mkdir -p apps/api/node_modules

FROM node:20-alpine AS api
WORKDIR /app
ENV NODE_ENV=production PORT=4000 HOST=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=api-build --chown=app:app /app/node_modules ./node_modules
COPY --from=api-build --chown=app:app /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=api-build --chown=app:app /app/apps/api/dist ./apps/api/dist
COPY --from=api-build --chown=app:app /app/apps/api/config ./apps/api/config
COPY --from=api-build --chown=app:app /app/apps/api/package.json ./apps/api/package.json
USER app
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:${PORT}/healthz || exit 1
# Override with `node dist/worker.js` for the scheduled worker.
CMD ["node", "dist/server.js"]

# ---------------------------------------------------------------- web build
FROM base AS web-build
ARG API_URL=http://api:4000
ENV API_URL=$API_URL NEXT_TELEMETRY_DISABLED=1
RUN npm ci --workspace apps/web --include-workspace-root --include=dev
COPY apps/web apps/web
RUN npm run build -w apps/web

FROM node:20-alpine AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S app && adduser -S app -G app
COPY --from=web-build --chown=app:app /app/apps/web/.next/standalone ./
COPY --from=web-build --chown=app:app /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build --chown=app:app /app/apps/web/public ./apps/web/public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:${PORT}/robots.txt || exit 1
CMD ["node", "apps/web/server.js"]
