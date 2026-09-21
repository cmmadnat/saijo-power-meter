# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

Greenfield. Two kinds of material sit alongside the code, and they pull in opposite directions:

- **`reference/`** is a snapshot of an earlier implementation, kept only to be *looked at*. Nothing
  is copied, ported, or carried forward from it, and it is never modified.
- **`reference doc/`** and **`Smart Factory - Server and MQTT Rev01.xlsx`** are the customer's own
  specifications — Calorie Testing Room, Function test, EMC, Power meter, Field & Reliability,
  TIS 1155-2558, and a training document. These are what the new system is built *from*. Nothing has
  been derived from them yet; no requirement in this repo traces to them so far.

Built so far: the Google Cloud footprint as Pulumi code, plus the pipeline that applies it, both
live. The application itself does not exist yet.

| Path | What it is |
| --- | --- |
| `infra/` | Pulumi program (TypeScript) — every Google Cloud resource except the bootstrap ones. |
| `bootstrap.sh` | One-time, run in Cloud Shell. Creates only what Pulumi cannot create for itself. |
| `.github/workflows/infra.yml` | The only thing that runs `pulumi up`. Preview on PR, apply on `main`. |
| `.claude/hooks/session-start.sh` | Installs the Pulumi CLI and `infra/` deps into a fresh container. |
| `reference doc/`, root `.xlsx` | Customer specifications — the requirements source, unread so far. |
| `reference/` | Old implementation. Look, never copy. |

## How infrastructure changes reach the cloud

Development happens in cloud sessions, which are ephemeral and re-cloned each time. The rule that
follows from that:

**This session never holds Google Cloud credentials, and never applies infrastructure.** Claude
edits the Pulumi program and typechecks it; a pull request gets a `pulumi preview` posted as a
comment; merging to `main` applies it. CI authenticates with Workload Identity Federation, so no
service-account key exists anywhere to leak.

So `pulumi up` is never the right command to reach for here, and a failed `pulumi preview` in-session
is expected — it fails on missing credentials, not on a broken program. To see a real preview, open
a PR.

**CI is the only thing that runs Pulumi at all.** That invariant is what makes the workflow's
concurrency group (repo-wide, not per-ref) sufficient to keep two runs off one state object. Two
things in `.github/workflows/infra.yml` look like they could be simplified and must not be: the
concurrency group stays repo-wide, and stack creation stays on `pulumi stack ls` rather than
`stack select`, because selecting a stack that does not exist takes a lock in the state bucket and
abandons it. Both cost a failed apply to learn.

## Commands

```bash
cd infra && npm ci             # after a fresh container, if the session hook didn't
cd infra && npm run typecheck  # tsc --noEmit — the only check that works without credentials
```

## Setup (done — repeat only for a new project)

Project `saijo-power-meter` is bootstrapped and applied: the state bucket, KMS key, deployer service
account and WIF provider exist, the five repository variables are set, and the stack has been
applied from CI. Nothing below needs doing again unless a second project is being stood up.

1. Create a GCP project and link billing.
2. In **Google Cloud Shell** (browser-based, already authenticated — no local machine needed):
   `PROJECT_ID=your-project ./bootstrap.sh`
3. Set the five GitHub Actions *variables* the script prints at the end (`GCP_PROJECT_ID`,
   `GCP_STATE_BUCKET`, `GCP_KMS_KEY`, `GCP_DEPLOYER_SA`, `GCP_WIF_PROVIDER`). They are not secrets.
4. Open a PR touching `infra/` and check the preview comment.

## Architecture

- **All Google Cloud resources are declared in `infra/`.** Nothing is created by hand in the console
  or with a one-off `gcloud` command. The one exception is `bootstrap.sh`, which exists because the
  Pulumi state bucket, its KMS key, the deployer service account, and the WIF provider must exist
  *before* Pulumi can run at all. That script is the boundary; anything else belongs in the program.
- **State** lives in a versioned GCS bucket, with secrets encrypted by a Cloud KMS key. The stack
  name is `dev`; add environments as separate stacks rather than branching inside the program.
- **`infra/Pulumi.dev.yaml` carries `secretsprovider` and must stay committed.** CI runs on a fresh
  runner every time, so a secrets provider set by `pulumi stack init --secrets-provider` exists only
  for that one job; without the committed key, later runs fall back to the passphrase provider and
  fail. The same applies the first time a secret config value is added: Pulumi writes an
  `encryptedkey` alongside it, and that has to be committed too or the value cannot be decrypted on
  the next run.
- **The GCP project is not pinned in `Pulumi.dev.yaml`** — CI passes it as `GOOGLE_PROJECT` from the
  `GCP_PROJECT_ID` variable, so the program can target another project without a code change.
- **Region `asia-southeast1`** throughout.
- **Application: Cloud Run**, from an image in the `app` Artifact Registry repository that `infra/`
  creates — it exists, at `asia-southeast1-docker.pkg.dev/saijo-power-meter/app`. Stateless; configuration arrives as environment variables and secrets wired by Pulumi.
- **Database migrations** will be versioned, ordered, idempotent, and applied by an automated step
  *before* a new revision is promoted — never by hand against a deployed database, and
  forward-compatible so rolling back the app never requires rolling back the schema.
- **Cloud Storage** for blobs, buckets IaC-declared with explicit access policies. Nothing is
  world-readable by default.

## Next

1. **Next.js + shadcn/ui** frontend with light/dark theming, from the stock generators
   (`create-next-app`, `npx shadcn@latest init`) rather than a hand-rolled setup. Its own pull
   request, no infrastructure changes in it.
2. **Cloud Run service** in `infra/`, serving an image from the `app` repository, plus whatever
   builds and pushes that image.
3. **Database and migrations**, under the rules above.

Before any of it, the specifications in `reference doc/` still need reading — what the system has to
do has not been established in this repo, only how it will be deployed.
