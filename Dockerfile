# ── builder ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /repo

# Install dependencies using workspace manifests for layer caching
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/room-server/package.json apps/room-server/
COPY apps/web/package.json apps/web/

RUN npm install --workspaces --include-workspace-root

# Copy sources
COPY packages/shared ./packages/shared
COPY apps/room-server ./apps/room-server
COPY apps/web ./apps/web

# 1. Build shared types
RUN npm --workspace @vecstack/shared run build

# 2. Build Next.js (output:'export' → apps/web/out/)
RUN npm --workspace @vecstack/web run build

# 3. Compile room-server TypeScript → dist/
RUN npm --workspace @vecstack/room-server run build

# ── runtime ───────────────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production

# Workspace root
COPY --from=builder /repo/package.json /repo/package-lock.json* ./

# Shared package
COPY --from=builder /repo/packages/shared/package.json ./packages/shared/
COPY --from=builder /repo/packages/shared/dist         ./packages/shared/dist

# Room server (compiled JS)
COPY --from=builder /repo/apps/room-server/package.json ./apps/room-server/
COPY --from=builder /repo/apps/room-server/dist         ./apps/room-server/dist

# Next.js static export — served by the room-server at runtime
COPY --from=builder /repo/apps/web/out ./apps/web/out

RUN npm install --omit=dev --workspaces --include-workspace-root

EXPOSE 8080

# Shell form so ${PORT} is expanded at runtime (required by Koyeb)
CMD sh -c "node apps/room-server/dist/index.js"
