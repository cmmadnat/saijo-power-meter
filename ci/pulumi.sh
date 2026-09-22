#!/usr/bin/env bash
#
# Preview or apply the stack. Runs in pulumi/pulumi-nodejs, which already
# carries the Pulumi CLI and Node, from the repository clone step 1 made.
#
# Cloud Build has no equivalent of the workflow's repo-wide concurrency group,
# which is what used to keep two runs off one state object. What replaces it is
# Pulumi's own lock in the state bucket plus the retry below: a run that arrives
# while another holds the lock waits for it instead of dying on it. The trigger's
# queueTtl is the outer bound on that wait.
set -euo pipefail

: "${MODE:?MODE must be preview or apply}"
: "${PULUMI_BACKEND_URL:?PULUMI_BACKEND_URL must be the gs:// state bucket}"
: "${GOOGLE_PROJECT:?GOOGLE_PROJECT must be set}"
: "${WEB_IMAGE:?WEB_IMAGE must be the commit-pinned web image reference}"
: "${INGESTER_IMAGE:?INGESTER_IMAGE must be the commit-pinned ingester image reference}"
: "${KMS_KEY:?KMS_KEY must be the secrets-provider key, for first-run stack init}"

STACK=dev
PREVIEW_OUT=${PREVIEW_OUT:-/workspace/preview.txt}

cd infra
npm ci

# Credentials come from the build's service account via the metadata server, so
# there is nothing to authenticate here — the same keyless posture the Workload
# Identity Federation setup had, minus the token exchange.
pulumi login

# Run a pulumi command, waiting out a lock another run is holding rather than
# failing on it. Anything that is not a lock conflict fails immediately: a
# broken program should not be retried five times before anyone hears about it.
retry_through_lock() {
  local attempt delay output status
  delay=15
  for attempt in 1 2 3 4 5; do
    set +e
    output="$("$@" 2>&1)"
    status=$?
    set -e
    printf '%s\n' "$output"
    if [[ $status -eq 0 ]]; then
      return 0
    fi
    if ! grep -qi "the stack is currently locked\|conflict.*another update" <<<"$output"; then
      return $status
    fi
    if [[ $attempt -lt 5 ]]; then
      echo "--- Another run holds the state lock; waiting ${delay}s (attempt $attempt/5)"
      sleep "$delay"
      delay=$((delay * 2))
    fi
  done
  echo "--- Gave up waiting for the state lock." >&2
  return 1
}

# Create the stack if it does not exist yet. Existence is checked with
# `stack ls`, which is read-only. `stack select` on a missing stack takes a lock
# in the state bucket and abandons it on failure, and the `stack init` that
# follows then trips over a lock its own predecessor left behind. This cost a
# failed apply to learn; do not simplify it.
if pulumi stack ls --json | grep -q "\"name\": *\"$STACK\""; then
  echo "Stack '$STACK' already exists."
else
  echo "Stack '$STACK' not found — creating it."
  pulumi stack init "$STACK" --secrets-provider "gcpkms://${KMS_KEY}"
fi

if [[ "$MODE" == "apply" ]]; then
  retry_through_lock pulumi up --stack "$STACK" --yes --non-interactive --diff
  echo "### Deployed"
  pulumi stack output webUrl --stack "$STACK"
else
  # Captured as well as printed: the next step posts it on the pull request,
  # which is the one thing the GitHub Actions workflow gave for free.
  retry_through_lock pulumi preview --stack "$STACK" --non-interactive --diff \
    | tee "$PREVIEW_OUT"
fi
