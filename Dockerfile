# ============================================================================
# DeviceView Studio — Production Multi-Stage Dockerfile
# Supports Direct Mode + Interactive Browser Mode (Playwright / Headless Chromium CDP)
# ============================================================================
FROM node:20-bookworm-slim AS base

# Install Chromium and essential fonts for realistic mobile/desktop rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-inter \
    fonts-noto-color-emoji \
    fonts-noto-cjk \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV CHROMIUM_PATH=/usr/bin/chromium
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

WORKDIR /app

# Copy workspace manifests
COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/device-registry/package.json ./packages/device-registry/
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy full source code
COPY scripts ./scripts
COPY packages ./packages
COPY apps ./apps
COPY tests ./tests
COPY docs ./docs

# Typecheck and build all workspaces
RUN npm run typecheck && npm run build

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
