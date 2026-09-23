# The MQTT ingester, for Cloud Run. Built from the workspace root.
#
# The context is the repository root, not apps/ingester: the service imports
# @power-meter/domain, @power-meter/application and @power-meter/infrastructure,
# and npm hoists the dependency tree to the root, so none of them is reachable
# from inside apps/ingester.
#
# There is no build step. The workspace runs TypeScript through Node's type
# stripping everywhere else that is not Next — the warehouse CLI does the same —
# and a compile step here would be a second toolchain to keep in step with the
# packages it imports. What ships is the source.
#
# Cloud Run sets PORT and the HTTP server reads it. The port serves the hot
# state; the ingestion itself is an outbound MQTT connection and needs nothing
# inbound.

FROM node:22-alpine AS deps
WORKDIR /repo
# Only the manifests, so a change to source does not invalidate the install layer.
COPY package.json package-lock.json ./
COPY apps/ingester/package.json apps/ingester/
COPY packages/domain/package.json packages/domain/
COPY packages/application/package.json packages/application/
COPY packages/infrastructure/package.json packages/infrastructure/
# Scoped to this workspace: the web app's dependencies — Next, React and their
# trees — have no business in an image whose job is a socket and a row stream.
RUN npm ci --workspace @power-meter/ingester --include-workspace-root --omit=dev

FROM node:22-alpine AS runner
WORKDIR /repo
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S ingester -u 1001

COPY --from=deps /repo/node_modules ./node_modules
COPY --chown=ingester:nodejs package.json ./
COPY --chown=ingester:nodejs packages ./packages
COPY --chown=ingester:nodejs apps/ingester ./apps/ingester

USER ingester
EXPOSE 8080
# --experimental-strip-types is the flag on Node 22; it is on by default from
# 22.18, and harmless where it is.
CMD ["node", "--experimental-strip-types", "apps/ingester/src/main.ts"]
