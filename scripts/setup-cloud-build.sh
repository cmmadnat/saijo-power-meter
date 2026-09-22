#!/usr/bin/env bash
#
# One-time Cloud Build setup. Run this in Google Cloud Shell, once per GCP
# project, after bootstrap.sh.
#
# It creates only what Pulumi cannot create for itself:
#   - the APIs the pipeline's own resources need
#   - the two project roles the deployer account needs to declare a pipeline
#   - two Secret Manager secrets, because a secret VALUE cannot live in code,
#     and because the deploy key must exist before the first build can clone
#     anything at all
#
# Everything else — the triggers, the API key, the build definition — is in
# infra/index.ts. Re-running is safe: existing secrets are left alone.
#
# Usage: PROJECT_ID=your-project ./scripts/setup-cloud-build.sh

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-}"
GITHUB_REPO="${GITHUB_REPO:-cmmadnat/saijo-power-meter}"
SA_NAME="${SA_NAME:-pulumi-deployer}"

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
skip() { printf '    \033[0;90m%s\033[0m\n' "$*"; }
die()  { printf '\n\033[0;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

[[ -n "$PROJECT_ID" ]] || die "PROJECT_ID is required. Usage: PROJECT_ID=your-project ./scripts/setup-cloud-build.sh"
command -v gcloud >/dev/null || die "gcloud not found. Run this in Google Cloud Shell."
command -v ssh-keygen >/dev/null || die "ssh-keygen not found."
gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1 \
  || die "Project '$PROJECT_ID' not found (or no access)."

SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

log "Project $PROJECT_ID, repo $GITHUB_REPO"

log "Enabling pipeline APIs"
gcloud services enable \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  apikeys.googleapis.com \
  monitoring.googleapis.com \
  --project "$PROJECT_ID"

# The deployer already holds everything a deploy needs. These three are about
# declaring the pipeline itself: creating triggers, creating the API key without
# which a webhook trigger's URL is not callable, and creating the alert that
# emails when a build fails.
log "Granting the deployer the three pipeline roles"
for role in roles/cloudbuild.builds.editor roles/serviceusage.apiKeysAdmin roles/monitoring.editor; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member "serviceAccount:${SA_EMAIL}" \
    --role "$role" \
    --condition None \
    --quiet >/dev/null
  skip "$role"
done

# create_secret <name> <file-with-value>
create_secret() {
  local name="$1" file="$2"
  if gcloud secrets describe "$name" --project "$PROJECT_ID" >/dev/null 2>&1; then
    skip "$name already exists — left as it is"
    return
  fi
  gcloud secrets create "$name" --project "$PROJECT_ID" --replication-policy automatic >/dev/null
  gcloud secrets versions add "$name" --project "$PROJECT_ID" --data-file "$file" >/dev/null
  skip "$name created"
}

log "Deploy key"
DEPLOY_KEY_EXISTED=true
if ! gcloud secrets describe github-deploy-key --project "$PROJECT_ID" >/dev/null 2>&1; then
  DEPLOY_KEY_EXISTED=false
  ssh-keygen -t ed25519 -N "" -C "cloud-build@${PROJECT_ID}" -f "$WORK/deploy_key" >/dev/null
fi
create_secret github-deploy-key "$WORK/deploy_key"

log "Webhook secret"
# Long and random: this is the only thing standing between a leaked webhook URL
# and someone being able to start a build.
openssl rand -hex 32 > "$WORK/webhook_secret"
create_secret github-webhook-secret "$WORK/webhook_secret"

# The deployer reads both at build time. It holds roles/secretmanager.admin
# already, so this is belt and braces for a project where that was narrowed.
log "Secret access"
for secret in github-deploy-key github-webhook-secret; do
  gcloud secrets add-iam-policy-binding "$secret" \
    --project "$PROJECT_ID" \
    --member "serviceAccount:${SA_EMAIL}" \
    --role roles/secretmanager.secretAccessor \
    --quiet >/dev/null
  skip "$secret -> $SA_NAME"
done

# The webhook secret is different: it is checked when the URL is called, before
# any build exists and therefore before the deployer is involved at all. Cloud
# Build's own service agent is what reads it, and without this binding every
# webhook call is rejected with a message about the secret being invalid rather
# than being unreadable.
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
CLOUDBUILD_AGENT="service-${PROJECT_NUMBER}@gcp-sa-cloudbuild.iam.gserviceaccount.com"
# The agent is created lazily, and "lazily" can mean "after the first build",
# which is too late to grant it anything.
gcloud beta services identity create \
  --service cloudbuild.googleapis.com --project "$PROJECT_ID" >/dev/null 2>&1 || true
gcloud secrets add-iam-policy-binding github-webhook-secret \
  --project "$PROJECT_ID" \
  --member "serviceAccount:${CLOUDBUILD_AGENT}" \
  --role roles/secretmanager.secretAccessor \
  --quiet >/dev/null
skip "github-webhook-secret -> Cloud Build service agent"

cat <<OUT

$(printf '\033[1;32m')Cloud Build setup complete.$(printf '\033[0m')

Next, in order:

1. Apply the stack, so the triggers and the API key exist. Merging to main does
   this while .github/workflows/infra.yml is still in place.

2. Add the deploy key to GitHub — Settings > Deploy keys > Add deploy key on
   ${GITHUB_REPO}. Leave "Allow write access" UNCHECKED; the pipeline only
   ever reads.
OUT

if [[ "$DEPLOY_KEY_EXISTED" == true ]]; then
  cat <<OUT
   The key already existed, so its public half was not regenerated here. If it
   is not already on the repo, recover it from the private half:

     gcloud secrets versions access latest --secret github-deploy-key \\
       --project ${PROJECT_ID} > /tmp/k && chmod 600 /tmp/k \\
       && ssh-keygen -y -f /tmp/k && rm /tmp/k
OUT
else
  cat <<OUT

$(cat "$WORK/deploy_key.pub")
OUT
fi

cat <<OUT

3. Print the two webhook URLs and add them on GitHub — Settings > Webhooks:

     PROJECT_ID=${PROJECT_ID} ./scripts/print-webhooks.sh

   One webhook per URL, content type application/json:
     - the preview URL, with only the "Pull requests" event
     - the apply URL, with only the "Pushes" event

4. Confirm the build-failure email. The address is set in
   infra/Pulumi.dev.yaml (saijo-power-meter:alertEmail), and applying the stack
   creates the notification channel — but Cloud Monitoring emails a
   confirmation link, and the channel delivers nothing until it is clicked.
   An unverified channel looks healthy, so check the inbox rather than
   assuming.

5. Open a pull request touching infra/ and check that a Cloud Build preview
   runs. Once it has, delete .github/workflows/infra.yml.

   Builds are tagged with the commit they built, so the log for one is:

     gcloud builds list --project ${PROJECT_ID} --filter "tags=<sha>"
     gcloud builds log <build-id> --project ${PROJECT_ID}
OUT
