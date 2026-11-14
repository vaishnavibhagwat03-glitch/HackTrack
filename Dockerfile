# HackTrack website (Next.js). Three stages: install, build, run.

# ── install dependencies ──────────────────────────────────────
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── build ─────────────────────────────────────────────────────
FROM node:24-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* values are baked into the browser code at build time.
# "/api" means: ask the same address the page came from. Caddy forwards it to the C++ client.
ARG NEXT_PUBLIC_HACKTRACK_API=/api
ARG NEXT_PUBLIC_HIDE_ADMIN_DEMO=1
ENV NEXT_PUBLIC_HACKTRACK_API=$NEXT_PUBLIC_HACKTRACK_API \
    NEXT_PUBLIC_HIDE_ADMIN_DEMO=$NEXT_PUBLIC_HIDE_ADMIN_DEMO \
    NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── run ───────────────────────────────────────────────────────
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
# The standalone folder holds server.js plus only the node_modules it needs.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node

EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["node", "server.js"]
