# HackTrack server: Node.js + built-in SQLite. No npm dependencies to install.
FROM node:24-slim

WORKDIR /app
COPY package.json ./
COPY src ./src

# The database lives on a volume (see compose.yaml) so it survives rebuilds.
# The folder is created here and owned by the unprivileged "node" user.
RUN mkdir -p /data && chown node:node /data
ENV HOST=0.0.0.0 \
    PORT=4000 \
    HACKTRACK_DB=/data/hacktrack.db
USER node

EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:4000/v1/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["node", "src/index.mjs"]
