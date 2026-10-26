# The Beacon server, as selfhost/docker-compose.yml builds it. Built from the
# repository root, so the image carries the very migrations, functions and
# e-mail templates it runs, and nothing else from the repository.
FROM node:26-bookworm-slim@sha256:28147155d47dc31abe0a46e0d12b59b2fb3d0a2dcc5dc65fce76a074180b16fe

ENV NODE_ENV=production \
    BEACON_REPO_ROOT=/app \
    DATA_DIR=/data \
    PORT=8000

WORKDIR /app/selfhost/server
COPY selfhost/server/package.json selfhost/server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY selfhost/server/src ./src
COPY selfhost/sql /app/selfhost/sql
COPY supabase/migrations /app/supabase/migrations
COPY supabase/functions /app/supabase/functions
COPY docs/email-templates /app/docs/email-templates

# Uploaded files live in /data, a volume owned by the unprivileged user the
# server runs as.
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:8000/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "src/main.mjs"]
