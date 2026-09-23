# Next.js standalone build for Cloud Run, from the workspace root.
#
# The build context is the repository root, not apps/web: the app imports
# the three @power-meter packages, and npm hoists the
# dependency tree to the root, so none is reachable from inside apps/web.
#
# Cloud Run sets PORT at runtime and the standalone server.js reads it, so the
# port is never hardcoded here. HOSTNAME must be 0.0.0.0 or the server binds to
# localhost inside the container and every request times out at the load
# balancer with no log line explaining why.

FROM node:22-alpine AS deps
WORKDIR /repo
# Only the manifests, so a change to source does not invalidate the install layer.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/domain/package.json packages/domain/
COPY packages/application/package.json packages/application/
# The web app imports the adapters, and live mode constructs a BigQuery client
# from them; without this manifest the SDK is installed only by luck of hoisting.
COPY packages/infrastructure/package.json packages/infrastructure/
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps/web ./apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace @power-meter/web

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0

# Run as a non-root user. Cloud Run does not require it, but a container that
# cannot write outside its own tree is one less thing to reason about.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# outputFileTracingRoot is the repository root, so the standalone tree mirrors
# the workspace and the server lands under apps/web. Flatten that here so the
# image has a plain WORKDIR with server.js at its root.
COPY --from=builder /repo/apps/web/public ./public
# File tracing puts everything the server needs, the workspace packages
# included, under apps/web inside the standalone tree. There is no hoisted
# node_modules beside it to copy.
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/standalone/apps/web ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/static ./.next/static

USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
