FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace root for monorepo resolution
COPY package.json package-lock.json ./
COPY packages/bi-platform/package.json packages/bi-platform/
COPY packages/core/package.json packages/core/

RUN npm ci --workspace=packages/bi-platform

COPY packages/bi-platform/ packages/bi-platform/
COPY packages/core/ packages/core/

RUN npm run build --workspace=packages/bi-platform

# --- Production image ---
FROM node:22-alpine

WORKDIR /app

RUN addgroup -g 1001 bi && adduser -u 1001 -G bi -s /bin/sh -D bi

COPY --from=builder /app/packages/bi-platform/dist ./dist
COPY --from=builder /app/packages/bi-platform/package.json ./
COPY --from=builder /app/node_modules ./node_modules

USER bi

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3100/alive || exit 1

CMD ["node", "dist/server.js"]
