# --- builder ---
FROM node:20-alpine AS builder
WORKDIR /repo

# Copy workspace manifests for cache-friendly install
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/room-server/package.json apps/room-server/

RUN npm install --workspaces --include-workspace-root

# Copy sources and build
COPY packages/shared ./packages/shared
COPY apps/room-server ./apps/room-server

RUN npm --workspace @vecstack/shared run build
RUN npm --workspace @vecstack/room-server run build

# --- runtime ---
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Copy only what's needed at runtime
COPY --from=builder /repo/package.json /repo/package-lock.json* ./
COPY --from=builder /repo/packages/shared/package.json ./packages/shared/
COPY --from=builder /repo/packages/shared/dist ./packages/shared/dist
COPY --from=builder /repo/apps/room-server/package.json ./apps/room-server/
COPY --from=builder /repo/apps/room-server/dist ./apps/room-server/dist

RUN npm install --omit=dev --workspaces --include-workspace-root

EXPOSE 8080
CMD ["node", "apps/room-server/dist/index.js"]
