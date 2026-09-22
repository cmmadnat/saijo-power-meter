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

Built so far: the Google Cloud footprint as Pulumi code, the pipeline that builds and applies it,
the frontend shell — scaffolded, themed, and deployed to Cloud Run so there is a live URL from the
start — the domain model, the MQTT payload decoder and the fixture generator, and all four
specified screens: the 55-meter table, the kW and kWh charts, and History. Every one of them runs
on fixture data; no meter data flows yet.

| Path | What it is |
| --- | --- |
| `infra/` | Pulumi program (TypeScript) — every Google Cloud resource except the bootstrap ones. |
| `bootstrap.sh` | One-time, run in Cloud Shell. Creates only what Pulumi cannot create for itself. |
| `scripts/setup-cloud-build.sh` | One-time, after `bootstrap.sh`. APIs and the deployer's three pipeline roles. |
| `ci/` | What the Cloud Build steps run: `step.sh`, `image.sh`, `pulumi.sh`, `report.sh`. |
| `packages/domain` | Entities and rules. Imports nothing. |
| `packages/application` | Use cases and the port interfaces they need. Imports domain only. |
| `packages/infrastructure` | Adapters: the MQTT payload decoder, the scale-factor table, fixture data, the warehouse. |
| `apps/web` | Next.js + shadcn/ui frontend. Deployed to Cloud Run. |
| `scripts/check-boundaries.mjs` | Enforces the dependency rule. Runs first in CI. |
| `.github/workflows/check.yml` | Application checks. Holds no cloud credentials. |
| `.github/workflows/logs.yml` | Reads the Cloud Run service's logs, on dispatch or a `/logs` comment. Runs no Pulumi and holds a read-only identity. |
| `.github/workflows/build-logs.yml` | Reads a Cloud Build run's status and log, on dispatch or a `/buildlog` comment. Same identity. |
| `docs/architecture/delivery-pipeline.md` | Why builds run on Cloud Build, and what that cost. |
| `docs/architecture/warehouse.md` | The three BigQuery tables, the migration rules, and what has never been run against a project. |
| `.claude/hooks/session-start.sh` | Installs the Pulumi CLI and `infra/` deps into a fresh container. |
| `docs/requirements/` | The frozen spec: the MQTT protocol, the meter registry, and the four screens. |
| `reference doc/`, root `.xlsx` | Customer specifications — the source those requirements were read from. |
| `reference/` | Old implementation. Look, never copy. |

## How infrastructure changes reach the cloud

Development happens in cloud sessions, which are ephemeral and re-cloned each time. The rule that
follows from that:

**This session never holds Google Cloud credentials, and never applies infrastructure.** Claude
edits the Pulumi program and typechecks it; a pull request gets a `pulumi preview` posted as a
comment; merging to `main` applies it.

So `pulumi up` is never the right command to reach for here, and a failed `pulumi preview` in-session
is expected — it fails on missing credentials, not on a broken program. To see a real preview, open
a PR.

**Builds and deploys run on Cloud Build, connected to GitHub through the Cloud Build GitHub
App.** The App is installed on this repository alone, with write access to commit statuses.
`docs/architecture/delivery-pipeline.md` has the reasoning, what it is worse at than the Actions
workflow was, and — in its last section — the webhook design this replaced and the four defects
that killed it. Read it before touching the pipeline. The shape in one line: the trigger holds a
thin inline build, Cloud Build fetches the source, and every step runs a script from `ci/` in that
checkout, so pipeline logic is ordinary reviewed code and only its skeleton is a Pulumi resource.

**The App connection is a console handshake and must exist before the triggers can be applied.** A
trigger naming an unconnected repository is rejected, so connecting the repo at
`console.cloud.google.com/cloud-build/repositories` precedes the apply. `scripts/setup-cloud-build.sh`
does everything either side of it and prints the step it cannot do.

**Cloud Build posts build status back to the pull request as a check**, which the webhook design
could not. For an apply on `main`, or from a session with no Google Cloud credentials,
`.github/workflows/build-logs.yml` fetches a log on a `/buildlog` comment — `workflow_dispatch`
needs `actions: write`, which a session token does not carry. `.github/workflows/logs.yml` is its
sibling for the running app's Cloud Run logs, on `/logs`. Both authenticate as
`power-meter-log-reader`, holding `roles/logging.viewer` and `roles/cloudbuild.builds.viewer` and
nothing else, so neither can deploy; both are guarded by `author_association`, and neither
interpolates a comment body into a `run:` block. Issue #12 is the channel.

```
/logs                    /logs 6h ERROR                    /logs freshness=2d -- textPayload:"ECONNREFUSED"
/buildlog                /buildlog failed                  /buildlog sha=4f2c1ab mode=apply
```

`/logs` excludes admin-activity audit entries unless `audit=true`: they share `resource.type` with
the service's own output, so a plain read would return deploy records — ~100 lines of JSON each — in
place of application logs. It prints the JSON first and a one-line-per-entry digest last, **reversed
into oldest-first**, because a reader is handed the *tail* of a run log: one line per entry is what
makes a whole window fit in that tail, and the reversal is what puts the most recent event on the
last line rather than the oldest.

Neither trigger works from a branch: `issue_comment` always runs the default branch's copy.

**The fork guard is a trigger setting, not hand-built.**
`commentControl: COMMENTS_ENABLED_FOR_EXTERNAL_CONTRIBUTORS_ONLY` means a pull request from
outside this repository does not build until someone with write access comments `/gcbrun`. That
matters because a build runs `ci/*.sh` from the commit it checks out, with the deployer's
credentials.

**Substitutions do not resolve in a build's `tags`.** They resolve in `steps` and `images`; a
`$COMMIT_SHA` tag is stored verbatim, a tag must match `[\w][\w.-]*`, and the build creation is
then rejected with a bare `INVALID_ARGUMENT` — while the trigger itself creates cleanly, because a
tag is only a string until a build is made from it. `build-logs.yml` finds a build by
`--filter "substitutions.COMMIT_SHA=<sha>"`; the mode stays a tag because it is a literal.

**Cloud Build validates very little at trigger-create time and a great deal at invocation.** "The
trigger was created" is not evidence that it works, and a `pulumi preview` is weaker still: it
plans rather than creates, so it passes over missing roles and missing secrets alike. That
asymmetry is what made the webhook design cost what it did.

**A failed build announces itself by email, through Cloud Monitoring.** Cloud Build has no
built-in setting for it. `infra/index.ts` declares a log-based alert policy matching three things —
`PIPELINE_VERDICT=FAILED` (`ci/report.sh`'s own marker, which is a marker and not prose, so do not
reword it), `ERROR: build step`, and a timeout. It takes `roles/logging.configWriter` alongside
`roles/monitoring.editor`, because a log-based policy also creates a Logging notification rule —
the channel succeeds on the monitoring role alone, so the failure reads oddly. The address is
`saijo-power-meter:alertEmail` in `Pulumi.dev.yaml`.

**Whether that alert actually delivers has never been observed, and is the one unproven part of
this pipeline.** Two links in it are untested: whether a log-based policy matches `resource.type=
"build"` entries at all, and whether the channel sends. `gcloud alpha monitoring channels list`
reports the channel `enabled` with an **empty** `verificationStatus` — not `UNVERIFIED` — so the
"click the confirmation email" step this file used to assert appears not to exist for a channel
created through the API. No such email was ever found. Do not repeat that claim without checking.
The way to settle it is to make a build fail on a pull request, which runs on the preview trigger
and never touches `main`, and see whether mail arrives; that also exercises `ci/step.sh` capturing
a non-zero exit and `ci/report.sh`'s failure branch, neither of which has run.

**`ci/step.sh` and `ci/report.sh` exist because Cloud Build has no `if: always()`.** Every real step
runs under the wrapper, which captures its output and swallows its exit code; the report step then
always runs, ends the log with a step-by-step verdict and the last 80 lines of whatever failed, and
exits non-zero itself so a red build reads as red. A step that never ran is reported as "did not
run", never as a pass.

**GitHub Actions no longer deploys anything.** `.github/workflows/infra.yml` is gone: Cloud Build
runs the preview on a pull request and the apply on `main`, and both have gone green. What is left
on Actions is `check.yml` — boundaries, typecheck, lint, test — which holds no cloud credentials and
stays, because moving it would blur the split that keeps a failing unit test from looking like a
failing apply.

**Three of the five `GCP_*` repository variables went with it, and two must stay.**
`GCP_STATE_BUCKET`, `GCP_KMS_KEY` and `GCP_DEPLOYER_SA` were only ever read by `infra.yml` — the
equivalents now live in `infra/index.ts` and are passed to the build as step environment variables.
`GCP_PROJECT_ID` and `GCP_WIF_PROVIDER` are still read by `logs.yml` and `build-logs.yml`; deleting
them breaks `/logs` and `/buildlog`. The WIF section of `bootstrap.sh` stays for the same reason.

**CI is the only thing that runs Pulumi at all.** Two things in `ci/pulumi.sh` look like they could
be simplified and must not be: stack creation stays on `pulumi stack ls` rather than `stack select`,
because selecting a stack that does not exist takes a lock in the state bucket and abandons it, and
the lock retry stays, because Cloud Build has no concurrency group — it is what keeps a second run
waiting rather than failing. The first cost a failed apply to learn; the second is what replaces the
guarantee the workflow's repo-wide concurrency group used to give, and it is weaker.

## Commands

```bash
npm ci                         # root: npm workspaces, covers apps/* and packages/*
npm run verify                 # boundaries, then typecheck, lint and test across the workspace
npm run boundaries             # the dependency rule on its own — cheapest check, run it first

npm run dev  --workspace @power-meter/web
npm run build --workspace @power-meter/web   # also the container build's inner step
npm test     --workspace @power-meter/domain

npm run warehouse -w @power-meter/infrastructure -- sql                 # render the DDL; needs nothing
npm run warehouse -w @power-meter/infrastructure -- migrate             # needs credentials
npm run warehouse -w @power-meter/infrastructure -- load --hours 24     # replay fixtures
npm run warehouse -w @power-meter/infrastructure -- verify --hours 24   # adapter vs. pure functions
npm run warehouse -w @power-meter/infrastructure -- settings            # read back partition expiry

cd infra && npm ci             # infra is deliberately NOT a workspace member
cd infra && npm run typecheck  # tsc --noEmit — the only infra check that works without credentials
```

`pulumi preview` in-session fails on missing credentials, not on a broken program. Open a pull
request to see a real one.

## Setup (done — repeat only for a new project)

Project `saijo-power-meter` is bootstrapped and applied: the state bucket, KMS key, deployer service
account and WIF provider exist, the two remaining repository variables are set, the repository is
connected to Cloud Build through the GitHub App, and both triggers have run green. Nothing below needs doing again unless a second project is being stood up.

1. Create a GCP project and link billing.
2. In **Google Cloud Shell** (browser-based, already authenticated — no local machine needed):
   `PROJECT_ID=your-project ./bootstrap.sh`
3. Set the two GitHub Actions *variables* the log workflows need — `GCP_PROJECT_ID` and
   `GCP_WIF_PROVIDER`. They are not secrets. The other three the script prints were for the
   retired `infra.yml` and are no longer used.
4. `PROJECT_ID=your-project ./scripts/setup-cloud-build.sh`, then connect the repository in the
   Cloud Build console as it instructs.
5. Open a PR touching `infra/` and check that the Cloud Build check appears on it.

## Architecture

**The code follows clean architecture, and the dependency rule is enforced rather than assumed.**
Imports point inward: `domain` imports nothing, `application` imports domain, `infrastructure`
imports both, `apps/*` import all three. The inner two layers may not import any third-party package
at all — that is the rule that bites, and it is what stops a BigQuery type or a React hook from
welding a use case to its delivery mechanism. `npm run boundaries` fails the build on a violation.
The reasoning, and where a given piece of code belongs, is in
`docs/architecture/clean-architecture.md`; read it before adding a package or moving logic between
layers. One consequence worth knowing up front: the MQTT payload decoder is *infrastructure*, not domain,
because it translates one specific wire format. `packages/infrastructure` now exists, holding that
decoder and the fixture data the screens are built against — it arrived with the first real adapter
rather than as an empty shell, which was the point of leaving it out until now.

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
  creates — it exists, at `asia-southeast1-docker.pkg.dev/saijo-power-meter/app`. Stateless;
  configuration arrives as environment variables and secrets wired by Pulumi.
- **The web image is built in the same workflow run that deploys it**, because Cloud Run rejects a
  reference to an image that does not exist yet — the push has to precede `pulumi up`. CI passes the
  reference to the program as `WEB_IMAGE`, alongside `GOOGLE_PROJECT`, rather than writing it into
  `Pulumi.dev.yaml` where it would cost a commit per deploy.
- **That reference is pinned to the commit SHA, never `:latest`.** Cloud Run only starts a new
  revision when the image reference changes, so a floating tag leaves the service on its old
  revision and the deploy silently does nothing.
- **The service runs as its own service account**, not the default compute one. It carries no roles
  yet; database and secret access get granted in `infra/` as those steps land.
- **It is public at the network edge for now** — there is nothing behind it but the shell. The
  passcode gate is an application concern and stays that way; `allUsers` invoker does not change
  when it lands.
- **Database migrations** are versioned, ordered, idempotent, and applied by an automated step
  *before* a new revision is promoted — never by hand against a deployed database, and
  forward-compatible so rolling back the app never requires rolling back the schema. They live in
  `packages/infrastructure/src/warehouse/migrations.ts`, and nothing in the pipeline runs them yet;
  that wiring belongs with step 7, where something first depends on the tables existing.
- **Cloud Storage** for blobs, buckets IaC-declared with explicit access policies. Nothing is
  world-readable by default.

## Next

The plan this follows is `docs/power-meter-rebuild-plan.md`, with per-step evidence and screenshots
in the build log it links to. Steps 0 and 1 are done, and the deploy step was pulled forward so
there is a live URL to look at from the start.

The theme is **Light Green** (tweakcn, by Alexander VQ), which replaced Doom 64 — that one was
picked for looks, and its light mode put page and panels 0.09 apart in lightness, which is what made
every chart on it read flat. Light Green grounds the page at `#fbfcf8` with white cards and
`#0f172a` ink, and `#020617` / `#0f172a` in dark. Three things about it are deliberate:

- It names Inter (sans), JetBrains Mono (mono) and Georgia (serif) without installing them. The
  first two are loaded via `next/font` in `apps/web/app/layout.tsx`, with the theme's font tokens
  pointed at the resulting CSS variables in a block appended to `apps/web/app/globals.css` — the
  registry's own values are left untouched, so re-applying the theme does not clobber the wiring.
- `--radius` is `0.25rem`, not the theme's published `1rem`: 16px corners on a 15-column, 55-row
  table read soft, and the density is the point. Square corners are no longer the design.
- **Primary `#aff33e` is a fill, never an ink.** Lime reaches 1.34:1 on the white card, so a lime
  border, sort arrow or focus ring is invisible; black on lime is 15.71:1, so a selected chip stays
  lime-filled. Where the brand hue has to be text or a border, `--accent-strong` (`#4d7c0f` light,
  the lime itself in dark) carries it, and `--ring` follows the same rule.

**Freshness no longer borrows interface tokens.** live / stale / offline used to be `--secondary`,
`--destructive` and `--primary`, which only worked while primary was a red. They are now
`--status-live`, `--status-stale` and `--status-offline`, a reserved role that is never a
categorical slot and never shared with chrome, checked against the card in both modes.

Working in `apps/web` has two traps, both hit once already:

- **`tsc --noEmit` alone fails on a clean checkout.** Next 16 generates the `LayoutProps` route
  types during a build, so `npm run typecheck` runs `next typegen` first. Use the script.
- **Next 16's react-hooks rules reject `setState` inside an effect**, which rules out the usual
  mounted-flag pattern for anything theme-dependent. Read state from the class `next-themes` puts on
  the document instead.
- **Standalone output lands at `.next/standalone/apps/web/server.js`**, not at the standalone root,
  because `outputFileTracingRoot` points at the repository root so the workspace packages get
  traced in at all. There is no hoisted `node_modules` beside it — tracing puts everything under
  `apps/web`. The Dockerfile flattens this; changing either setting means re-checking it.

Steps 0–6 are done: the spec is frozen into `docs/requirements/` (including all four screens, in
`power-meter-ui.md`), the shell is deployed, the domain model, decoder and fixtures are in place with
tests, the Real time route carries screens 1–3 — the 55-meter table and the kW and kWh charts — and
History carries screen 4, all on those fixtures. Step 6 added the warehouse behind those same ports —
schema, migrations and a fixture loader — and nothing reads it yet. Remaining, in order: the MQTT ingester,
wiring the screens to real data, and the passcode gate.

**The screens read their data through three files, `apps/web/lib/realtime-source.ts`,
`apps/web/lib/series-source.ts` and `apps/web/lib/history-source.ts`.** They are the only places
that know the numbers are fixtures: everything above them goes through a use case in
`packages/application` and a port. Step 8 replaces those three files, not the screens — keep it that
way, and do not reach for `generateFixtures` from a component.

**The fleet strip and the department bands are additions to the specification, and both are
flagged to the customer.** Their numbers — `totalActivePowerKw` and `byDepartment` — are summed in
`realtimeTable`, not in the components, so the strip and the bands cannot disagree. Two rules ride
with them: an offline meter's last reading is history and is excluded from "total load now", and
there is no energy subtotal on a band, because summing cumulative counters yields only how long a
department's meters have been installed. The strip deliberately carries nothing that needs history
— no energy-today tile, no sparkline — because that would put a warehouse query behind a screen
that refreshes every ten seconds.

**History's two quantities come from `packages/application/src/history.ts`, and its running-hours
rule is a judgement worth keeping.** Total energy is the last value of the same `consumptionFrom()`
walk the energy chart plots, reset rule included — do not write a second one. Running time sums the
gaps between readings, each credited to the state at its start, and a gap longer than three minutes
counts for nothing: a silence says nothing was observed, not that the machine kept running. The
fixture adapter raises that cap to twice its own sampling interval, because a long window is
sampled coarsely and every gap would otherwise exceed it; at step 8 it goes back to the default.

**Chart colours are the eight `--series-N` tokens in `globals.css`, not the theme's `--chart-1..5`.**
They were re-validated as a categorical set against Light Green's own surfaces — lightness band,
chroma floor, CVD separation, normal-vision separation, and now contrast too: on the white card
slots 3, 4 and 5 had to darken to `#07a874`, `#cb8400` and `#dc7099` to clear 3:1, after which the
validator passes every check, which it never did on Doom 64. Dark mode passed unchanged. The
relief that the old warning obliged — a legend, direct end labels and a table view — stays. A series
holds its slot when other series are removed, which is why the chart selection is eight slots with
holes rather than a list. Changing any of that means re-running the validation, not just picking a
nicer colour.

**Fixture load is a function of absolute time, profiles come from the whole fleet, and energy
accumulates at full precision.** The first two exist so two screens generating different windows, or
different subsets of meters, agree about the same machine at the same instant — pass
`defaultProfiles(registry)` when generating for a subset. The third exists because rounding the
counter at every step swallowed any increment under 0.05 kWh, which zeroed every idle meter's
consumption: round when emitting, never while accumulating.

**The energy chart plots consumption across the window, not the raw counter** — `consumptionFrom()`
in `packages/application/src/series.ts`, which is also where step 5's Total Energy comes from, reset
rule and all. Do not write a second version of that arithmetic. It is a reading of specification page
3 rather than a literal rendering of it, and it is flagged for the customer in
`docs/requirements/power-meter-ui.md`.

Two things the specification asks for that the workbook has no column for, both decided and both
written down as questions back to the customer in `docs/requirements/power-meter-ui.md`: the
**machine number** (parsed out of the one `Name` field, only when the suffix looks like a code — 27
of 55 have one) and the **meter number** (station and meter id, `01-1`, not the mock-up's flat
1–55). Both live in `packages/domain/src/meter.ts` with their cases as tests.

**Two of the nine scale factors are guesses, and the code says so.** `packages/infrastructure/src/mqtt/scaling.ts`
holds every divisor with its confidence and the evidence behind it; the two marked `assumed` — active
power and energy — each have a test asserting the current guess, so changing one is loud rather than
silent. `unconfirmedScales()` is what step 7's startup check uses to refuse a live broker while they
remain. Do not quietly settle one from inference; it takes a captured payload.

**The warehouse dataset is a Pulumi resource and its tables are not.** `infra/index.ts` declares the
`power_meter` dataset; the three tables arrive through the migration runner in
`packages/infrastructure/src/warehouse`. That line is the same one `bootstrap.sh` draws for the state
bucket — a container that must exist before anything can run is infrastructure, what goes inside it
is the application's own shape. Retention is a table setting (a 14-day partition expiry), so it lives
with the DDL and there is no cleanup job. **The dataset exists** — applied 2026-09-22, which is also
what proved the deployer's `roles/bigquery.admin`, since a preview plans rather than creates. **The
tables do not:** nothing in the pipeline runs `migrate`, so `readings`, `readings_1m` and `latest`
have never been created and no statement has ever reached BigQuery. Everything in the warehouse
module is tested against a fake client and nothing else. `docs/architecture/warehouse.md` has the
rest, and says what running `migrate` once would settle.

**The History aggregation did not move into SQL, and must not.** `consumptionFrom()`'s reset rule and
the three-minute running-hours cap have one implementation, in `packages/application`. The warehouse
adapter implements `ReadingRepository` and hands readings up; what gets checked is the *adapter*, by
running `historyTable` over the fixtures and over the warehouse and comparing every row
(`verifyAgainstFixtures`). A SQL copy of either rule would be free to disagree in the cases nobody
looks at.

**The 1-minute rollup is written by `rollupReadings()` in the application layer, not by a SQL
`GROUP BY`.** It shares its bucket primitives with `meterSeries`, so "a minute" means mean power,
last counter and a reading count in both, and a test asserts a rollup at the chart's bucket width
reproduces what the chart plots. One difference is deliberate: **rollup buckets floor to absolute
time**, where the charts align to the window's `from` — a stored row cannot align to a window,
because the ingester writing it has none.

**`latest` is not the real-time screen's data source.** The ingester serves that from memory; the
table exists so a restart does not begin blind, and is replaced wholesale rather than upserted.

**The ingester is blocked on the customer.** The scaling divisors for active power and energy are
not documented anywhere in the workbook, and its sample payload is filler that does not reconcile —
see `docs/requirements/power-meter-mqtt.md`. Wrong scaling silently corrupts every row it writes and
no backfill recovers it, so that step does not go live before one real captured payload arrives.
