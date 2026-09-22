#!/usr/bin/env bash
#
# Apply the warehouse migrations, before the revision that depends on them.
#
# This is the step step 6 deliberately left out: nothing read the tables, so
# nothing needed them to exist. Step 7's ingester does, and CLAUDE.md's rule is
# that migrations are applied by an automated step *before* a new revision is
# promoted — never by hand against a deployed database.
#
# Runs in node:22 from the checkout Cloud Build provides, as the build's own
# service account. The deployer carries roles/bigquery.admin, which is what
# creating a table takes.
#
# On a pull request it runs as a dry run: it connects, reads the ledger and
# prints what it would apply. That is a weaker check than it looks — it submits
# no DDL, so BigQuery's opinion of the SQL goes unasked until the apply — but it
# does catch a dataset that has drifted from the code, which is the failure that
# would otherwise be found by an apply on main.
set -euo pipefail

: "${MODE:?MODE must be preview or apply}"
: "${GOOGLE_PROJECT:?GOOGLE_PROJECT must be set}"

export WAREHOUSE_DATASET="${WAREHOUSE_DATASET:-power_meter}"
export WAREHOUSE_LOCATION="${WAREHOUSE_LOCATION:-asia-southeast1}"

# Scoped to the one workspace: the web app's dependency tree has no part in
# this, and installing it would double the step for nothing.
npm ci --workspace @power-meter/infrastructure --include-workspace-root --omit=dev

# --skip-if-no-dataset is for the first apply on a brand-new project, where the
# dataset is a Pulumi resource that the *next* step creates. It exits clean with
# a message rather than failing a build that was about to create the thing it is
# waiting for. On this project the dataset has existed since step 6.
args=(migrate --skip-if-no-dataset)
if [[ "$MODE" != "apply" ]]; then
  args+=(--dry-run)
fi

node --experimental-strip-types packages/infrastructure/src/warehouse/cli.ts "${args[@]}"
