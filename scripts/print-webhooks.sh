#!/usr/bin/env bash
#
# Print the two webhook URLs to paste into GitHub.
#
# They are not a Pulumi output, because a complete URL needs three things and no
# single place holds all of them: the trigger name (Pulumi), the API key string
# (readable only through the API Keys API), and the webhook secret's plaintext
# (Secret Manager, which the Pulumi program deliberately never reads).
#
# Run after the stack has been applied, in Google Cloud Shell.
#
# Usage: PROJECT_ID=your-project ./scripts/print-webhooks.sh

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-}"
KEY_DISPLAY_NAME="${KEY_DISPLAY_NAME:-Cloud Build webhook triggers}"
# Matches the triggers' `location` in infra/index.ts. Changing it there means
# changing it here, and the symptom of a mismatch is a 403.
LOCATION="${LOCATION:-global}"

die() { printf '\n\033[0;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

[[ -n "$PROJECT_ID" ]] || die "PROJECT_ID is required. Usage: PROJECT_ID=your-project ./scripts/print-webhooks.sh"
command -v gcloud >/dev/null || die "gcloud not found. Run this in Google Cloud Shell."

KEY_NAME="$(gcloud services api-keys list \
  --project "$PROJECT_ID" \
  --filter "displayName='${KEY_DISPLAY_NAME}'" \
  --format 'value(name)' | head -n 1)"

[[ -n "$KEY_NAME" ]] || die "No API key named '${KEY_DISPLAY_NAME}'. Apply the stack first — infra/index.ts creates it."

KEY_STRING="$(gcloud services api-keys get-key-string "$KEY_NAME" --format 'value(keyString)')"
SECRET="$(gcloud secrets versions access latest --secret github-webhook-secret --project "$PROJECT_ID")"

# The path carries the trigger's location, which for these is `global`. The
# shorter /projects/../triggers/.. form omits it and is answered with 403, not
# 404 — which reads like a credential problem and is not one. Both webhooks
# failed their GitHub ping that way once.
url() {
  printf 'https://cloudbuild.googleapis.com/v1/projects/%s/locations/%s/triggers/%s:webhook?key=%s&secret=%s\n' \
    "$PROJECT_ID" "$LOCATION" "$1" "$KEY_STRING" "$SECRET"
}

cat <<OUT

$(printf '\033[1;33m')Both URLs below are credentials. Treat them like passwords.$(printf '\033[0m')

GitHub > Settings > Webhooks > Add webhook, content type application/json,
one webhook per URL, and leave the webhook's own "Secret" field EMPTY — Cloud
Build reads the secret from the query string, not from GitHub's signature.

--- Pull requests only (preview) ---------------------------------------------
$(url infra-preview)

--- Pushes only (apply) ------------------------------------------------------
$(url infra-apply)

OUT
