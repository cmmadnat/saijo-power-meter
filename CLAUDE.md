# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

Greenfield. The only committed content is `reference/`, a snapshot of an earlier, unrelated
implementation. It exists to be *looked at* — nothing is copied, ported, or carried forward from
it, and it is never modified. Build everything new at the repository root.

There is no application code, build file, or test suite yet. This file describes the intended
shape; replace each section with real commands as it gets built.

## Target architecture

Google Cloud from the ground up, provisioned as code:

- **Infrastructure as code first.** Every Google Cloud resource — project services/APIs, Artifact
  Registry, Cloud Run service, database instance, storage buckets, service accounts and IAM
  bindings, build triggers, secrets — is declared in the IaC program and applied from there. No
  resource is created by hand in the console or with a one-off `gcloud` command; if it exists in
  the cloud, it exists in the repo.
  - Working default: **Pulumi with TypeScript**, so infra and app share one language and toolchain.
    OpenTofu (HCL) is the alternative if Terraform-ecosystem modules turn out to matter more —
    nothing is scaffolded yet, so this is still a cheap decision to revisit.
  - Separate stacks per environment (e.g. `dev`, `prod`) rather than branching logic inside one stack.
- **Application on Cloud Run**, deployed as a container image from Artifact Registry. The app is
  stateless; all configuration arrives as environment variables and secrets wired by the IaC program.
- **Versioned database migrations** checked into the repo, applied by an automated step that runs
  *before* the new revision is promoted — never by hand against a deployed database. Migrations are
  ordered, idempotent, and forward-compatible so a rollback of the app doesn't require a rollback
  of the schema.
- **Cloud Storage** for file and blob payloads; buckets are IaC-declared with explicit access
  policies. Nothing is world-readable by default.
- **Frontend: Next.js + shadcn/ui** with light/dark theming — bootstrapped with the stock
  generators (`create-next-app`, `npx shadcn@latest init`) rather than a hand-rolled setup.
  Not started yet.

## Build order

1. IaC program + the base Google Cloud footprint.
2. Next.js + shadcn bootstrap.
3. Database, migrations, and the deploy pipeline into Cloud Run.

Work top-down: don't add a cloud resource to support step 2 or 3 without declaring it in step 1's program.

## Conventions

- Region: `asia-southeast1`.
- No credentials in the repo. Cloud Run uses an attached service account; local development uses
  Application Default Credentials (`gcloud auth application-default login`).
