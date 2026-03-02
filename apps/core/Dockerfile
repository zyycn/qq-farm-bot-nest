FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable

# Copy workspace configuration
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./

# Copy project package.json files
COPY apps/core/package.json ./apps/core/
COPY apps/web/package.json ./apps/web/

# Install all deps for build
RUN npm config set registry https://registry.npmmirror.com/
RUN pnpm install --frozen-lockfile

# Copy source code
COPY apps/core ./apps/core
COPY apps/web ./apps/web

# Build web + core (ncc bundles core to dist/, no node_modules needed)
RUN pnpm build

# ==========================================

FROM node:20-alpine AS runner

WORKDIR /app/core

ENV NODE_ENV=production
ENV TZ=Asia/Shanghai

# Copy ncc bundle (no node_modules)
COPY --from=builder /app/apps/core/dist ./

# Copy web assets
COPY --from=builder /app/apps/web/dist ../web/dist

# Expose port
EXPOSE 3000

# Start command
CMD ["node", "main/index.js"]
