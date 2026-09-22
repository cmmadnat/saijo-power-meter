#!/usr/bin/env bash
#
# One-time Google Cloud bootstrap. Run this in Google Cloud Shell (or anywhere
# with an authenticated gcloud), once per GCP project.
#
# It creates only what Pulumi cannot create for itself:
#   - the APIs needed to run the bootstrap at all
#   - the GCS bucket holding Pulumi state
#   - the KMS key encrypting Pulumi secrets
#   - the deployer service account and its roles
#   - the Workload Identity Federation pool/provider that lets GitHub Actions
#     impersonate that account with no long-lived key
#
# Everything else belongs in infra/. Re-running is safe.
#
# The pipeline that consumes all this is Cloud Build, not GitHub Actions; its
# own one-time setup is scripts/setup-cloud-build.sh, which runs after this.
# The Workload Identity Federation section below is what remains of the Actions
# setup, and it is here only until .github/workflows/infra.yml is deleted —
# nothing but that workflow uses it.
#
# Usage: PROJECT_ID=your-project ./bootstrap.sh

set -euo pipefail

# Non-interactive, for the reason scripts/setup-cloud-build.sh records: this
# script redirects gcloud's output in places, and a gcloud that stops to ask a
# question then waits on stdin with the question sent to /dev/null. What the
# operator sees is a script that halted for no reason.
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-asia-southeast1}"
GITHUB_REPO="${GITHUB_REPO:-cmmadnat/saijo-power-meter}"

SA_NAME="${SA_NAME:-pulumi-deployer}"
POOL_ID="${POOL_ID:-github}"
PROVIDER_ID="${PROVIDER_ID:-github-oidc}"
KEYRING="${KEYRING:-pulumi}"
KEY="${KEY:-state}"

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
skip() { printf '    \033[0;90m%s\033[0m\n' "$*"; }
die()  { printf '\n\033[0;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

[[ -n "$PROJECT_ID" ]] || die "PROJECT_ID is required. Usage: PROJECT_ID=your-project ./bootstrap.sh"
command -v gcloud >/dev/null || die "gcloud not found. Run this in Google Cloud Shell."
gcloud auth list --filter=status:ACTIVE --format='value(account)' | grep -q . \
  || die "No active gcloud account. Run: gcloud auth login"
gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1 \
  || die "Project '$PROJECT_ID' not found (or no access). Create it and link billing first."

BUCKET="${BUCKET:-${PROJECT_ID}-pulumi-state}"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

log "Project $PROJECT_ID ($PROJECT_NUMBER), region $REGION, repo $GITHUB_REPO"

# --- APIs needed by the bootstrap itself; app-level APIs are Pulumi's job ------
log "Enabling bootstrap APIs"
gcloud services enable \
  cloudresourcemanager.googleapis.com \
  serviceusage.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  storage.googleapis.com \
  cloudkms.googleapis.com \
  --project "$PROJECT_ID"

# --- Pulumi state bucket ------------------------------------------------------
log "State bucket gs://$BUCKET"
if gcloud storage buckets describe "gs://$BUCKET" --project "$PROJECT_ID" >/dev/null 2>&1; then
  skip "already exists"
else
  gcloud storage buckets create "gs://$BUCKET" \
    --project "$PROJECT_ID" \
    --location "$REGION" \
    --uniform-bucket-level-access \
    --public-access-prevention
fi
# Versioning is what makes a corrupted or concurrently-written state recoverable.
gcloud storage buckets update "gs://$BUCKET" --versioning --project "$PROJECT_ID"

# --- KMS key for Pulumi secret encryption ------------------------------------
log "KMS key $KEYRING/$KEY"
if gcloud kms keyrings describe "$KEYRING" --location "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
  skip "keyring already exists"
else
  gcloud kms keyrings create "$KEYRING" --location "$REGION" --project "$PROJECT_ID"
fi
if gcloud kms keys describe "$KEY" --keyring "$KEYRING" --location "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
  skip "key already exists"
else
  gcloud kms keys create "$KEY" \
    --keyring "$KEYRING" --location "$REGION" --purpose encryption --project "$PROJECT_ID"
fi
KMS_KEY="projects/${PROJECT_ID}/locations/${REGION}/keyRings/${KEYRING}/cryptoKeys/${KEY}"

# --- Deployer service account -------------------------------------------------
log "Deployer service account $SA_EMAIL"
if gcloud iam service-accounts describe "$SA_EMAIL" --project "$PROJECT_ID" >/dev/null 2>&1; then
  skip "already exists"
else
  gcloud iam service-accounts create "$SA_NAME" \
    --project "$PROJECT_ID" \
    --display-name "Pulumi deployer (GitHub Actions)"
fi

# Broad enough to build the stack, narrow enough that a compromised CI run
# cannot touch billing, org policy, or the project's own lifecycle.
ROLES=(
  roles/serviceusage.serviceUsageAdmin   # enable app-level APIs
  roles/run.admin                        # Cloud Run
  roles/artifactregistry.admin           # container images
  roles/storage.admin                    # app buckets + Pulumi state
  roles/cloudsql.admin                   # database instances
  roles/secretmanager.admin              # runtime secrets
  roles/iam.serviceAccountAdmin          # create the app's runtime identity
  roles/iam.serviceAccountUser           # actAs, to deploy Run as that identity
  roles/resourcemanager.projectIamAdmin  # bind roles to it
  roles/cloudbuild.builds.editor         # declare the pipeline's own triggers
  roles/serviceusage.apiKeysAdmin        # the webhook triggers' API key
  roles/monitoring.editor                # the alert that emails on a failed build
  roles/logging.configWriter             # ...and its Logging notification rule
)
log "Granting project roles"
for role in "${ROLES[@]}"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member "serviceAccount:${SA_EMAIL}" \
    --role "$role" \
    --condition None \
    --quiet >/dev/null
  skip "$role"
done

gcloud kms keys add-iam-policy-binding "$KEY" \
  --keyring "$KEYRING" --location "$REGION" --project "$PROJECT_ID" \
  --member "serviceAccount:${SA_EMAIL}" \
  --role roles/cloudkms.cryptoKeyEncrypterDecrypter \
  --quiet >/dev/null
skip "roles/cloudkms.cryptoKeyEncrypterDecrypter (on $KEYRING/$KEY)"

# --- Workload Identity Federation: GitHub Actions -> the deployer SA ----------
log "Workload Identity Federation pool/$POOL_ID"
if gcloud iam workload-identity-pools describe "$POOL_ID" \
     --location global --project "$PROJECT_ID" >/dev/null 2>&1; then
  skip "pool already exists"
else
  gcloud iam workload-identity-pools create "$POOL_ID" \
    --location global --project "$PROJECT_ID" \
    --display-name "GitHub Actions"
fi

if gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
     --workload-identity-pool "$POOL_ID" --location global --project "$PROJECT_ID" >/dev/null 2>&1; then
  skip "provider already exists"
else
  # The attribute condition is what stops any other repository on GitHub from
  # minting tokens against this project.
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
    --location global --project "$PROJECT_ID" \
    --workload-identity-pool "$POOL_ID" \
    --display-name "GitHub OIDC" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
    --attribute-condition "assertion.repository == '${GITHUB_REPO}'"
fi

POOL_NAME="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}"
# This is the one step that touches the service account's OWN IAM policy, which
# needs iam.serviceAccounts.setIamPolicy — a permission roles/editor does not
# carry. It also runs seconds after the account was created, so a first failure
# is often just IAM propagation. Retry before believing it.
IMPERSONATION_OK=true
for attempt in 1 2 3 4; do
  if gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
      --project "$PROJECT_ID" \
      --role roles/iam.workloadIdentityUser \
      --member "principalSet://iam.googleapis.com/${POOL_NAME}/attribute.repository/${GITHUB_REPO}" \
      --quiet >/dev/null 2>&1; then
    IMPERSONATION_OK=true
    skip "$GITHUB_REPO may impersonate $SA_NAME"
    break
  fi
  IMPERSONATION_OK=false
  if [[ $attempt -lt 4 ]]; then
    skip "binding failed (attempt $attempt), retrying in $((attempt * 5))s..."
    sleep $((attempt * 5))
  fi
done

# --- Hand off to GitHub -------------------------------------------------------
if [[ "$IMPERSONATION_OK" == true ]]; then
  BANNER="$(printf '\033[1;32m')Bootstrap complete.$(printf '\033[0m')"
else
  BANNER="$(printf '\033[1;33m')Bootstrap incomplete — see the warning below.$(printf '\033[0m')"
fi

cat <<OUT

${BANNER}

Set these as GitHub Actions *variables* (none of them are secrets) on
${GITHUB_REPO} — Settings > Secrets and variables > Actions > Variables,
or with the gh CLI:

  gh variable set GCP_PROJECT_ID   --repo ${GITHUB_REPO} --body "${PROJECT_ID}"
  gh variable set GCP_STATE_BUCKET --repo ${GITHUB_REPO} --body "${BUCKET}"
  gh variable set GCP_KMS_KEY      --repo ${GITHUB_REPO} --body "${KMS_KEY}"
  gh variable set GCP_DEPLOYER_SA  --repo ${GITHUB_REPO} --body "${SA_EMAIL}"
  gh variable set GCP_WIF_PROVIDER --repo ${GITHUB_REPO} --body "${POOL_NAME}/providers/${PROVIDER_ID}"

Then run the Cloud Build setup, which is what actually builds and deploys:

  PROJECT_ID=${PROJECT_ID} ./scripts/setup-cloud-build.sh

The five variables above are only for .github/workflows/infra.yml, which exists
to apply the stack that creates the Cloud Build pipeline in the first place.
Once a Cloud Build run has gone green, that workflow and these variables both
go away.
OUT

if [[ "$IMPERSONATION_OK" != true ]]; then
  cat >&2 <<OUT
$(printf '\033[1;31m')One step did not complete.$(printf '\033[0m') Everything above exists; CI cannot
authenticate until this last binding lands:

  the repo ${GITHUB_REPO} is not yet allowed to impersonate ${SA_NAME}

That binding needs the permission iam.serviceAccounts.setIamPolicy on the
service account. roles/owner and roles/iam.serviceAccountAdmin carry it;
roles/editor does not. Check what you hold:

  gcloud projects get-iam-policy ${PROJECT_ID} \\
    --flatten="bindings[].members" \\
    --filter="bindings.members:\$(gcloud config get-value account)" \\
    --format="value(bindings.role)"

If you can change project IAM, grant yourself the role and re-run this script:

  gcloud projects add-iam-policy-binding ${PROJECT_ID} \\
    --member="user:\$(gcloud config get-value account)" \\
    --role="roles/iam.serviceAccountAdmin"

OUT
  exit 1
fi
