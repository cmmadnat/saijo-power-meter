# Next.js standalone build for Cloud Run.
#
# Cloud Run sets PORT at runtime and the standalone server.js reads it, so the
# port is never hardcoded here. HOSTNAME must be 0.0.0.0 or the server binds to
# localhost inside the container and every request times out at the load
# balancer with no log line explaining why.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0

# Run as a non-root user. Cloud Run does not require it, but a container that
# cannot write outside its own tree is one less thing to reason about.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
# The standalone server serves these two only if they sit exactly here.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
