#!/usr/bin/env bash
#
# One-time Cloud Build setup. Run this once per GCP project, after bootstrap.sh.
#
# It creates only what Pulumi cannot create for itself: the APIs the pipeline's
# resources need, and the three project roles the deployer needs to declare a
# pipeline rather than merely to run one.
#
# It no longer creates any secrets. The pipeline used webhook triggers, which
# needed a deploy key, a webhook secret and an API key; Cloud Build's GitHub App
# connection fetches the source itself, so all three are gone. What replaces them
# is a console handshake this script cannot perform — see the end.
#
# Usage: PROJECT_ID=your-project ./scripts/setup-cloud-build.sh

set -euo pipefail

# Non-interactive. This script redirects gcloud's output in places, and a gcloud
# that stops to ask a question then waits on stdin with the question sent to
# /dev/null — what the operator sees is a script halted for no reason.
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

PROJECT_ID="${PROJECT_ID:-}"
GITHUB_REPO="${GITHUB_REPO:-cmmadnat/saijo-power-meter}"
SA_NAME="${SA_NAME:-pulumi-deployer}"

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
skip() { printf '    \033[0;90m%s\033[0m\n' "$*"; }
die()  { printf '\n\033[0;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

[[ -n "$PROJECT_ID" ]] || die "PROJECT_ID is required. Usage: PROJECT_ID=your-project ./scripts/setup-cloud-build.sh"
command -v gcloud >/dev/null || die "gcloud not found."
gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1 \
  || die "Project '$PROJECT_ID' not found (or no access)."

SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

log "Project $PROJECT_ID, repo $GITHUB_REPO"

log "Enabling pipeline APIs"
gcloud services enable \
  cloudbuild.googleapis.com \
  monitoring.googleapis.com \
  --project "$PROJECT_ID"

# The deployer already holds everything a deploy needs. These three are about
# declaring the pipeline itself: creating triggers, and creating the
# build-failure alert — which takes two roles, not one, because a log-based
# alert policy also creates a Logging notification rule and monitoring.editor
# does not cover that.
log "Granting the deployer the three pipeline roles"
for role in roles/cloudbuild.builds.editor roles/monitoring.editor roles/logging.configWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member "serviceAccount:${SA_EMAIL}" \
    --role "$role" \
    --condition None \
    --quiet >/dev/null
  skip "$role"
done

cat <<OUT

$(printf '\033[1;32m')Cloud Build setup complete.$(printf '\033[0m')

One step is left and this script cannot do it: connecting the repository. It is
an OAuth handshake in a browser, which is the whole reason the pipeline first
tried to avoid it.

1. Connect ${GITHUB_REPO} to Cloud Build:

     https://console.cloud.google.com/cloud-build/repositories?project=${PROJECT_ID}

   Choose the 1st gen / "GitHub (Cloud Build GitHub App)" host, authorise, and
   install the Cloud Build GitHub App on ${GITHUB_REPO}. Grant it that one
   repository, not the whole account.

2. Apply the stack. Merging to main does this while
   .github/workflows/infra.yml is still in place. The triggers cannot be
   created before step 1 — a trigger naming an unconnected repository is
   rejected.

3. Confirm the build-failure email. The address is in infra/Pulumi.dev.yaml
   (saijo-power-meter:alertEmail). Cloud Monitoring sends a confirmation link
   and the channel delivers nothing until it is clicked; an unverified channel
   looks healthy, so check the inbox rather than assuming.

4. Open a pull request touching infra/. Cloud Build now posts its result back
   as a check on the pull request, so unlike the webhook design you can see it
   without asking. The log is also:

     gcloud builds list --project ${PROJECT_ID} --filter "substitutions.COMMIT_SHA=<sha>"
     gcloud builds log <build-id> --project ${PROJECT_ID}

5. Once a preview and an apply have both gone green, delete
   .github/workflows/infra.yml and the five GCP_* repository variables.
OUT
