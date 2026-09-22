#!/usr/bin/env bash
#
# Build the web image, and push it only when this run is going to deploy.
#
# Runs in gcr.io/cloud-builders/docker, from the repository clone step 1 made.
# Cloud Build injects Artifact Registry credentials into this builder, so there
# is no `gcloud auth configure-docker` here; if a push ever fails on auth, that
# injection is the thing that changed, not this script.
set -euo pipefail

: "${MODE:?MODE must be preview or apply}"
: "${IMAGE:?IMAGE must be the commit-pinned image reference}"
: "${CACHE_IMAGE:?CACHE_IMAGE must be the floating cache tag}"

# BuildKit inline cache replaces GitHub Actions' type=gha cache. The cache tag
# floats deliberately — it is never deployed, only read from and written to.
export DOCKER_BUILDKIT=1

echo "Pulling cache from $CACHE_IMAGE (absent on the first run, which is fine)"
docker pull "$CACHE_IMAGE" || true

# Built on every run, preview included, so a pull request still catches a broken
# Dockerfile. The context is the repository root, not apps/web: the app imports
# the workspace packages and npm hoists the dependency tree to the root.
docker build \
  --file apps/web/Dockerfile \
  --tag "$IMAGE" \
  --tag "$CACHE_IMAGE" \
  --cache-from "$CACHE_IMAGE" \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  .

if [[ "$MODE" != "apply" ]]; then
  echo "Preview run — image built but not pushed."
  echo "A pull request's image would never be deployed; it would only accumulate"
  echo "in the registry."
  exit 0
fi

docker push "$IMAGE"
docker push "$CACHE_IMAGE"
