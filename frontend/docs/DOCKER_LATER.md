# DOCKER_LATER.md — Containerization Guide for BuildTrack Frontend

This application is built with **Next.js 16 (App Router)** and configured with `output: 'standalone'` in `next.config.ts`.
Zero code refactoring is required to package it into Docker.

---

## 1. Multi-Stage Production Dockerfile

When ready to containerize, create `frontend/Dockerfile`:

```dockerfile
# 1. Base stage
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# 2. Dependencies stage
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps

# 3. Builder stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

# 4. Runner stage (minimal production image)
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Security: run as non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output and static assets
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

# Container health probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
```

---

## 2. Docker Compose Integration

To integrate into a root `docker-compose.yml`:

```yaml
services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: buildtrack-frontend
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_APP_NAME=BuildTrack
      - API_BASE_URL=http://backend:8000
      - NEXT_PUBLIC_WS_URL=http://localhost:8000
      - NEXT_PUBLIC_USE_MOCKS=false
      - SESSION_COOKIE_SECURE=false
    depends_on:
      backend:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 15s
      timeout: 5s
      retries: 3
```

---

## 3. Environment Variables Mapping

| Variable | Development Local | Production Container | Description |
|---|---|---|---|
| `API_BASE_URL` | `http://127.0.0.1:8000` | `http://backend:8000` | Internal server-side FastAPI URL |
| `NEXT_PUBLIC_WS_URL` | `http://localhost:8000` | `https://control.buildtrack.com` | Client-facing WebSocket URL |
| `SESSION_COOKIE_SECURE` | `false` | `true` | `Secure` attribute for cookies |
| `NEXT_PUBLIC_USE_MOCKS` | `false` | `false` | Activate standalone mock simulator |

---

## 4. Verification Check

Before building the image, test standalone output locally:
```bash
npm run build
cd .next/standalone
PORT=3000 node server.js
```
The application will launch on `http://localhost:3000` using only the standalone distribution.
