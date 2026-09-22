#!/usr/bin/env bash
#
# Build the two application images, and push them only when this run is going
# to deploy.
#
# Runs in gcr.io/cloud-builders/docker, from the checkout Cloud Build provides.
# Cloud Build injects Artifact Registry credentials into this builder, so there
# is no `gcloud auth configure-docker` here; if a push ever fails on auth, that
# injection is the thing that changed, not this script.
#
# Two images, one step: the web app and the MQTT ingester are separate
# deployables with opposite shapes — one scales to zero, one is pinned to a
# single always-on instance — but they are built from the same commit and must
# stay on it, because they share the payload decoder verbatim. Building them
# apart would let a deploy put two versions of that decoder in the same system.
set -euo pipefail

: "${MODE:?MODE must be preview or apply}"
: "${WEB_IMAGE:?WEB_IMAGE must be the commit-pinned web image reference}"
: "${WEB_CACHE_IMAGE:?WEB_CACHE_IMAGE must be the floating web cache tag}"
: "${INGESTER_IMAGE:?INGESTER_IMAGE must be the commit-pinned ingester image reference}"
: "${INGESTER_CACHE_IMAGE:?INGESTER_CACHE_IMAGE must be the floating ingester cache tag}"

# BuildKit inline cache replaces GitHub Actions' type=gha cache. The cache tags
# float deliberately — they are never deployed, only read from and written to.
export DOCKER_BUILDKIT=1

build() {
  local name="$1" dockerfile="$2" image="$3" cache="$4"

  echo "=== $name"
  echo "Pulling cache from $cache (absent on the first run, which is fine)"
  docker pull "$cache" || true

  # Built on every run, preview included, so a pull request still catches a
  # broken Dockerfile. The context is the repository root, not the app
  # directory: both apps import the workspace packages and npm hoists the
  # dependency tree to the root.
  docker build \
    --file "$dockerfile" \
    --tag "$image" \
    --tag "$cache" \
    --cache-from "$cache" \
    --build-arg BUILDKIT_INLINE_CACHE=1 \
    .

  if [[ "$MODE" != "apply" ]]; then
    echo "Preview run — $name built but not pushed."
    return 0
  fi

  docker push "$image"
  docker push "$cache"
}

build web apps/web/Dockerfile "$WEB_IMAGE" "$WEB_CACHE_IMAGE"
build ingester apps/ingester/Dockerfile "$INGESTER_IMAGE" "$INGESTER_CACHE_IMAGE"

if [[ "$MODE" != "apply" ]]; then
  echo
  echo "Nothing was pushed: a pull request's images would never be deployed,"
  echo "they would only accumulate in the registry."
fi
