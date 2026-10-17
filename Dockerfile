# syntax=docker/dockerfile:1

# ---- deps: install all packages (dev dependencies are needed to build) ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# postinstall runs `prisma generate`, which needs the schema and config.
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

# ---- builder: compile the standalone Next.js server ----
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Canonical URLs, Open Graph and robots.txt are rendered at build time.
ARG SITE_URL=http://localhost:3000
ENV SITE_URL=$SITE_URL NEXT_TELEMETRY_DISABLED=1
# The generated client is not copied from the build context (.dockerignore), so generate it here.
RUN npx prisma generate && npm run build

# ---- migrate: one-off job that applies database migrations ----
# Kept out of the runtime image, so the app container never changes the schema itself.
FROM node:24-alpine AS migrate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json prisma.config.ts ./
COPY prisma ./prisma
CMD ["npx", "prisma", "migrate", "deploy"]

# ---- runner: minimal runtime image ----
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0

RUN addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public
USER app

EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
