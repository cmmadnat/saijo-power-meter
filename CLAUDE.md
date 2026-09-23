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
start — the domain model, the MQTT payload decoder and the fixture generator, all four specified
screens (the 55-meter table, the kW and kWh charts, and History), the BigQuery warehouse behind the
same ports, the MQTT ingester, and the two data modes that put the screens on either. **Every
deployment still runs `DATA_MODE=demo`**: live mode refuses to boot while the scaling divisors are
guesses, and **the ingester has never connected to the customer's broker** — both are gated on the
scaling question, and live mode is verified end to end against a local broker replaying fixtures.

| Path | What it is |
| --- | --- |
| `infra/` | Pulumi program (TypeScript) — every Google Cloud resource except the bootstrap ones. |
| `bootstrap.sh` | One-time, run in Cloud Shell. Creates only what Pulumi cannot create for itself. |
| `scripts/setup-cloud-build.sh` | One-time, after `bootstrap.sh`. APIs and the deployer's three pipeline roles. |
| `ci/` | What the Cloud Build steps run: `step.sh`, `image.sh`, `migrate.sh`, `pulumi.sh`, `report.sh`. |
| `packages/domain` | Entities and rules. Imports nothing. |
| `packages/application` | Use cases and the port interfaces they need. Imports domain only. |
| `packages/infrastructure` | Adapters: the MQTT payload decoder, the scale-factor table, the warehouse and the stream that writes to it, the Firestore restart state, the ingester's `/latest` client, the replay's file store. Fixtures only via its second entry, `@power-meter/infrastructure/fixtures`. |
| `apps/web` | Next.js + shadcn/ui frontend. Deployed to Cloud Run. |
| `apps/ingester` | The MQTT ingester. Always-on, singleton, serves the hot state over HTTP. Deployed in observe mode since step 9: reads the broker, writes nothing. |
| `scripts/check-boundaries.mjs` | Enforces the dependency rule. Runs first in CI. |
| `.github/workflows/check.yml` | Application checks. Holds no cloud credentials. |
| `.github/workflows/logs.yml` | Reads the Cloud Run service's logs, on dispatch or a `/logs` comment. Runs no Pulumi and holds a read-only identity. |
| `.github/workflows/build-logs.yml` | Reads a Cloud Build run's status and log, on dispatch or a `/buildlog` comment. Same identity. |
| `docs/architecture/delivery-pipeline.md` | Why builds run on Cloud Build, and what that cost. |
| `docs/architecture/warehouse.md` | The two BigQuery tables, the migration rules, the per-table daily limit that moved the write path, and what has been run against the project. |
| `docs/architecture/ingester.md` | The ingester: why it is a singleton, what a failure costs, and what is still unproven. |
| `docs/architecture/data-modes.md` | `DATA_MODE`: the switch, the gate, the badge, which table each screen reads, and what the strip costs. |
| `.claude/hooks/session-start.sh` | Installs the Pulumi CLI and `infra/` deps into a fresh container. |
| `docs/runbooks/cloud-shell.md` | Every command a human runs in Cloud Shell, and what is outstanding now. |
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
Four steps now — `image`, `migrate`, `pulumi`, `report` — and `image` builds **both** deployables,
web and ingester, from the one commit, because they share the payload decoder verbatim and a deploy
must never put two versions of it in the same system.

**The `migrate` step applies the warehouse migrations before the revision that depends on them.**
It arrived with step 7, which is the first thing that reads the tables; on a pull request it is
`migrate --dry-run`, which connects, reads the ledger and prints what it would apply — weaker than
it looks, since it submits no DDL. `--skip-if-no-dataset` exists for the first apply on a new
project, where the dataset is a Pulumi resource the *next* step creates.

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

**A docs-only push builds nothing.** Both triggers carry an `ignoredFiles` list — `docs/**`, the
root `*.md` and `*.xlsx`, both `reference` directories — because the image is tagged with the
commit SHA and the apply updates Cloud Run to it, so a docs merge used to roll a revision for no
change in behaviour. It is an **ignore** list and not `includedFiles` on purpose: an include list
fails closed on anything unlisted, so a new top-level directory silently stops building and the
symptom is an absence. `check.yml` is the include-list version, which is why a `bootstrap.sh`
change gets no `verify` run. Observed on PR #34: a docs-only pull request runs no build, and
Cloud Build posts the filtered event as a **`neutral`** check of zero duration whose details link
points at the trigger rather than a build. So the feared hang — a required check that never
arrives — does not happen; whether `neutral` *satisfies* a required check is a separate question
this repository has never had to answer, because `infra-preview` is not required.

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

**A `ci/*.sh` must run under the trigger that is already deployed, not the one in its own commit.**
The trigger's steps and their environment live in `infra/index.ts` and reach Cloud Build only when
Pulumi applies them — which is a step in this pipeline. So a script that demands an environment
variable the *running* trigger does not set can never be applied: the apply that would update the
trigger is the run that fails. That is a red `main` on the step 7 merge, and the reason `ci/image.sh`
still reads the pre-step-7 `IMAGE`/`CACHE_IMAGE` as fallbacks and `ci/pulumi.sh` derives
`INGESTER_IMAGE` from `WEB_IMAGE` rather than requiring it. Keep the fallbacks: they are two lines,
and they are what makes the *next* pipeline change survivable. Adding a step is safe — it does not
run until the trigger knows about it. Adding a requirement to an existing step is not.

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
npm run warehouse -w @power-meter/infrastructure -- reset --yes         # drop every table; migrate after

npm run replay    -w @power-meter/ingester -- --minutes 7 --drop-at 120 --drop-for 40
npm start         -w @power-meter/ingester      # needs MQTT_URL; docs/architecture/ingester.md
npm run reconcile -w @power-meter/ingester -- --dir .ingester
npm run warehouse -w @power-meter/infrastructure -- cost --runs 20      # what live mode's reads bill and take
npm run warehouse -w @power-meter/infrastructure -- soak --dataset X    # the write path past the old daily cap; refuses power_meter
npm run hotstate  -w @power-meter/ingester -- --database X              # the Firestore restart state, round-tripped

npm test -w @power-meter/web                    # the screens' sources against both adapter sets
DATA_MODE=live INGESTER_URL=http://127.0.0.1:8099 WAREHOUSE=file WAREHOUSE_DIR=.ingester \
  npm start -w @power-meter/web                 # live code path over the replay; badged "Local replay"

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
- **Region `asia-southeast1`** throughout, with one exception: the ingester's free-tier e2-micro
  is in `us-central1-a`, because that VM is free only in three US regions (step 9).
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
  `packages/infrastructure/src/warehouse/migrations.ts`, and the pipeline's `migrate` step applies
  them. They are also **forward-only**: `0002` drops a table `0001` creates, because editing an
  applied migration changes its checksum and stops the runner dead.
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

Working in `apps/web` has these traps, each hit once already:

- **`tsc --noEmit` alone fails on a clean checkout.** Next 16 generates the `LayoutProps` route
  types during a build, so `npm run typecheck` runs `next typegen` first. Use the script.
- **Next 16's react-hooks rules reject `setState` inside an effect**, which rules out the usual
  mounted-flag pattern for anything theme-dependent. Read state from the class `next-themes` puts on
  the document instead.
- **Standalone output lands at `.next/standalone/apps/web/server.js`**, not at the standalone root,
  because `outputFileTracingRoot` points at the repository root so the workspace packages get
  traced in at all. There is no hoisted `node_modules` beside it — tracing puts everything under
  `apps/web`. The Dockerfile flattens this; changing either setting means re-checking it.
- **The BigQuery SDK is bundled, not traced.** Live mode constructs a client, and Turbopack folds
  `@google-cloud/bigquery` into the server chunks rather than adding it under `node_modules`
  (standalone 58 → 59 MB at step 8). A "not in `node_modules`" check therefore says nothing about
  whether it shipped; a client constructed inside the production build reaching the credentials
  check does.
- **A runtime-built filesystem path traces the whole project into the image.** Next warns
  "Dynamic filesystem access causes tracing of the whole project" and copies `apps/web`'s source,
  Dockerfile and README into the standalone output. The replay's file store did this at step 8;
  its paths go through one `turbopackIgnore` helper now. Read the build warnings, not just its exit
  code, after adding anything that touches the filesystem.
- **The root layout calls `connection()`, and must.** It prints the data-mode badge, and without it
  the 404 page is prerendered at build time — where `DATA_MODE` is unset — so a live deployment
  would say *Demo data* on every not-found page.
- **`instrumentation.ts` exits the process** when the data-mode gate refuses. That is the boot
  refusal, not a crash to debug — read the line above it.

Steps 0–8c are done: the spec is frozen into `docs/requirements/` (including all four screens, in
`power-meter-ui.md`), the shell is deployed, the domain model, decoder and fixtures are in place with
tests, the Real time route carries screens 1–3 — the 55-meter table and the kW and kWh charts — and
History carries screen 4, all on those fixtures. Step 6 added the warehouse behind those same ports —
schema, migrations and a fixture loader. Step 7 added the ingester — `apps/ingester`, the
`ReadingWriter` port behind it, the `migrate` step in the pipeline — built and verified against a
local broker, gated on the customer, and deployed nowhere. Step 8 put the screens on either data
mode — the live adapters beside the fixture ones, one switch between them — and verified live mode
against the replay. Its SQL has been parsed and timed against BigQuery by `warehouse cost`, over
step 6's fixture rows; no web process has read the warehouse yet. Step 8c changed how the ingester
writes: `latest` is gone from BigQuery and is one Firestore document, and raw and rollup go through
the Storage Write API instead of load jobs — because load jobs are capped per table per day and the
ingester's writes are a daily rate. That is measured, not argued: 1 600 appends to each table in
eight minutes against a scratch dataset, zero failures, where a load job is refused at 1 500 — see
`docs/architecture/warehouse.md`. **It is applied**: `0002` is in, the `(default)` Firestore
database exists, and the ingester's `roles/bigquery.jobUser` is gone. **Steps 9–11 were revised on
2026-09-23**: the ingester in *observe* mode against the customer's simulated feed, writing
nothing (9), then a viewer toggle between Demo and that Incoming feed (10), then go-live (11).
**Step 9's code is in** — `WAREHOUSE=none`, `/recent`, the observed publish interval — and verified
against the replay; `deployIngester` is `"true"`, so it deploys on that change's merge — to a
free-tier **Compute Engine e2-micro**, not Cloud Run (`ingesterHost`, below) — and its checks
against HiveMQ are in `docs/runbooks/cloud-shell.md`. The
passcode gate, the rollback rehearsal and the alerts are in the plan's Backlog, and the gate is due
before go-live. The rules below about exemptions and the one `DATA_MODE` still hold until the step
that changes each of them lands.

**The screens read their data through three files, `apps/web/lib/realtime-source.ts`,
`apps/web/lib/series-source.ts` and `apps/web/lib/history-source.ts`, and none of them knows the
mode.** Each asks `apps/web/lib/data-mode.ts` for a `DataSource` and hands its ports to a use case in
`packages/application`. Only `demo-adapters.ts` imports `@power-meter/infrastructure/fixtures`, and
only `data-mode.ts` loads it, by dynamic import in the demo branch; `npm run boundaries` walks the web
app's import graph and fails on any other route to a fixture. Do not reach for `generateFixtures`
from a component, a page or a source file — the check will say so, with the chain.

**The Real time route draws the strip and the two charts above the table, which inverts the
mock-up.** The customer asked for it; `docs/requirements/power-meter-ui.md` records it as a
deviation so a reviewer holding the PDF does not read it as a mistake. The 55-row table put both
charts below the fold on every screen it was checked on.

**There are two data modes, `live` and `demo`, and the fixture path is a shipped feature.** One
`DATA_MODE`, read only in `apps/web/lib/data-mode.ts`: unset or empty is `demo`, anything but `live`
or `demo` refuses to boot. Demo carries a badge in the header *and* pinned to the viewport on every
route; live carries none. `DATA_MODE=live` refuses to boot while `unconfirmedScales()` is non-empty,
naming the fields — `instrumentation.ts` exits — and its only exemption is the ingester's own,
applied to the web side: an ingester on loopback *and* `WAREHOUSE=file`, which is the replay
harness and is badged *Local replay*. Do not add another. No per-source override — a half-live app
is a bug generator. `saijo-power-meter:dataMode` in `Pulumi.dev.yaml` is `"demo"`, the program
refuses `"live"` without the ingester, and it flips in the same change as `deployIngester`.
`docs/architecture/data-modes.md` has the reasoning.

**In live mode the charts and the strip read `readings_1m`, History reads `readings`.** The rollup
path is a change of table, not of arithmetic — `meterSeries` folds a stored minute by the same
rules as a reading — *provided the window starts on a whole minute*, which the live adapters
guarantee; do not hand it an unaligned window. History stays on raw because running hours are read
off the gaps, and reads meters in batches under a row budget rather than one query per meter:
every BigQuery query bills at least 10 MB, so the number of queries is the cost.

**The fleet strip and the department bands are additions to the specification, and both are
flagged to the customer.** Their numbers — `totalActivePowerKw` and `byDepartment` — are summed in
`realtimeTable`, not in the components, so the strip and the bands cannot disagree. Two rules ride
with them: an offline meter's last reading is history and is excluded from "total load now", and
there is no energy subtotal on a band, because summing cumulative counters yields only how long a
department's meters have been installed. Since step 8 the strip also carries **energy since 00:00**
and **the last hour of total load** — `fleetTrend`, built from `meterSeries` and a sum, never a
second implementation of the walk. They are the one warehouse read behind a screen that refreshes
every ten seconds, so two rules keep that affordable and must stay: rollup reads are cached until
the minute turns, and the strip's two windows share one read. That is two queries a minute per
instance however many screens are open, asserted in `apps/web/lib/sources.test.ts`; uncached it is
eighteen a minute *per screen*.

**History's two quantities come from `packages/application/src/history.ts`, and its running-hours
rule is a judgement worth keeping.** Total energy is the last value of the same `consumptionFrom()`
walk the energy chart plots, reset rule included — do not write a second one. Running time sums the
gaps between readings, each credited to the state at its start, and a gap longer than three minutes
counts for nothing: a silence says nothing was observed, not that the machine kept running. Demo
mode raises that cap to twice its own sampling interval, because it samples a long window coarsely
and every gap would otherwise exceed it; live mode passes no cap and gets the three-minute default,
because its readings are real ones on the real schedule. The cap belongs to the adapter set, which
is why `DataSource.history()` returns it beside the repository.

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

**A real capture arrived on 2026-09-22 and the divisors are still guesses.** It confirmed the
wire format (ordinary JSON, `PF` unpadded as `50` — the workbook's `095` was notation), that slot
identity is positional with the uncommissioned tail simply absent, and that the broker and all nine
topics work. It also confirmed the registry: every station publishes exactly its commissioned
slots, 5/5/8/7/7/6/7/6/4, station for station. It did not confirm any scaling — all 55 slots across
all nine topics carried the *same* values, and V, I and PF imply 63.07 kW where `M<n>P` reads 53.50
kW, a factor of 1.179 that no power of ten reconciles. **The customer confirms those topics are a test
publisher, put up as a rough idea; the meters are not publishing yet.** So no further capture can
settle the divisors — a simulator cannot know what scaling the real device applies — and asking for
*better* test data would be worse than useless, because coherent synthetic numbers prove the
publisher's arithmetic and say nothing about the meter's. The blocker is now a date: when the meters
go live. `apps/ingester/capture.jsonl` is the capture;
`docs/requirements/power-meter-mqtt.md` has the arithmetic.

**Retained messages are not replayed to the ingester, and that was found the hard way.** Those nine
arrived within 193 ms of subscribing, out of order — a broker flushing retained frames to a new
subscription. Since a reading is stamped with the time it was *received* (the protocol carries no
timestamp), a replay after an outage would be stored as 55 readings taken now. The subscription sets
MQTT 5 `rh: 2`. Do not "improve" this by dropping messages whose retain flag is set: a publisher
that retains every publish is ordinary, and that filter would drop the entire feed.

**Two of the nine scale factors are guesses, and the code says so.** `packages/infrastructure/src/mqtt/scaling.ts`
holds every divisor with its confidence and the evidence behind it; the two marked `assumed` — active
power and energy — each have a test asserting the current guess, so changing one is loud rather than
silent. `unconfirmedScales()` is what step 7's startup check uses to refuse a live broker while they
remain. Do not quietly settle one from inference; it takes a captured payload.

**The warehouse dataset is a Pulumi resource and its tables are not.** `infra/index.ts` declares the
`power_meter` dataset; its tables arrive through the migration runner in
`packages/infrastructure/src/warehouse`. That line is the same one `bootstrap.sh` draws for the state
bucket — a container that must exist before anything can run is infrastructure, what goes inside it
is the application's own shape. Retention is a table setting (a 14-day partition expiry), so it lives
with the DDL and there is no cleanup job. **Dataset and tables both exist**, applied and migrated on
2026-09-22 — `migrate` twice (the second applied nothing), `settings` reading the 14-day expiry back
off both readings tables, a two-hour fixture load, and `verify` matching all 55 History rows between
the fixtures and the warehouse. The pipeline's `migrate` step now applies them, so the hand-run
command is for development rather than for deployment. `docs/architecture/warehouse.md` has the
evidence and the two things that follow from it — chiefly that **the fixtures are still in those
tables** and want dropping before real readings land beside them.

**BigQuery's parser is the one reviewer the fake client cannot stand in for.** `at` was a column name
here until BigQuery rejected it as a reserved keyword on the first real `migrate` — after review, a
full suite against the fake, and a green preview. A test now checks every migration's column names
against GoogleSQL's reserved list. Treat any DDL change the same way: the credential-free tests say
the code is consistent, never that the SQL is legal.

**`warehouse reset` exists because a fixture row and a real row are indistinguishable.** `load`
writes synthetic readings into the same two tables the ingester writes real ones into, and no
column says which is which — a 14-day partition keeps them for a fortnight either way. So the
dataset is dropped and re-migrated before the first real reading is written, and `reset --yes` is
that command. It refuses without `--yes`, it takes the ledger with the tables (a dropped table with
its migration still recorded is exactly the drift the runner stops on) and the retired `latest`
with them, and after go-live it destroys history that exists nowhere else.

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

**The restart state is not the real-time screen's data source.** The ingester serves that from
memory; the durable copy exists so a restart does not begin blind, and is replaced wholesale rather
than merged. Since step 8c it is **one Firestore document** holding all 55 readings, in the
project's `(default)` database — not 55 documents (~158 000 writes a day), and not the `latest`
BigQuery table it used to be (2 880 table modifications a day against a standard table's cap of
1 500, which cannot be raised). Migration `0002` drops that table. The web app has no Firestore
access at all, because it never read `latest`.

**The ingester's repeating writes may never go back to load jobs, and the reason is a number.**
A load job counts as a table modification, a **standard** table takes 1 500 of those a day — a
limit that cannot be raised, that failed jobs count against, and that 55 rows every 30 s blew
through by lunchtime. A **column-partitioned** table takes 30 000, which `readings` and
`readings_1m` were probably inside; what the quotas page does not settle is which of the two
governs a load job into a partitioned table, and a steady state that depends on how you read the
documentation is the defect. Streaming is excluded from every one of those counters, so the
ingester appends through the Storage Write API's default stream
(`packages/infrastructure/src/warehouse/stream.ts`) and `warehouse load` keeps the load jobs,
because one bulk write by hand is what they are for. Two things ride with it: **a TIMESTAMP crosses
as a `Date`, never a string** — the JSON writer encodes to int64 microseconds from a `Date`, and a
string fails inside the protobuf encoder naming nothing — and the default stream is
**at-least-once**, so a retried flush can land a row twice, as it could with load jobs.
`docs/architecture/warehouse.md` has the figures and their sources.

**Firestore's free quota covers exactly one database per project, the default one.** That is why
the restart state is in `(default)` rather than a tidier named database — a named one is billed
from its first write. The cost of the choice is that Pulumi creates rather than adopts, so a
project that already has a default database fails the apply; `gcloud firestore databases list`
says in advance, and `pulumi import` is the remedy.

**Creating it takes `roles/datastore.owner` on the deployer, and that cost a red `main`.** The
step 8c merge previewed green and applied 403 — `datastore.databases.create` is in that role and
the deployer held thirteen others. It is in `bootstrap.sh` now, and granted. The general rule, and this is its
second instance after the step 7 one: **a change that adds a kind of resource the stack has never
created before checks the deployer's role list in the same edit**, because a preview plans rather
than creates and passes over a missing role. The apply that failed had already run `migrate`, so
a failure there leaves a *partly* applied merge — harmless that time because nothing read either
store yet, and not something to rely on twice.

**The ingester is built and is not connected to anything.** The scaling divisors for active power
and energy are not documented anywhere in the workbook, and its sample payload is filler that does
not reconcile — see `docs/requirements/power-meter-mqtt.md`. Wrong scaling silently corrupts every
row it writes and no backfill recovers it, so `assertSafeToStart` in `apps/ingester/src/config.ts`
refuses to *write* while `unconfirmedScales()` names anything — a recording revision would
crash-loop and fail every apply from then on, which is why the deployed service observes. Its service account, the three broker secrets and its warehouse
access apply regardless, because none of them ingests anything. Since step 9
the service runs whatever `saijo-power-meter:ingesterMode` says — `"observe"` by default,
`"record"` at go-live — and turning `deployIngester` on also declares the three broker secrets'
first versions from `reference doc/mqtt` (already committed, so state exposes nothing new;
`deletionPolicy: ABANDON`, so dropping them at rotation destroys nothing). The program refuses
`dataMode: "live"` unless `ingesterMode` is `"record"`.

**The ingester runs on a VM because always-on Cloud Run is not free.** `saijo-power-meter:ingesterHost`
is `"vm"` by default: one e2-micro, Container-Optimized OS, a 10 GB *standard* disk (the default
disk type is not free), in `us-central1-a`, private behind an IAP-only SSH rule, replaced whole on
every code merge because the commit-pinned image is in its startup script — `deleteBeforeReplace`,
so never two. The Cloud Run service is still in the program as `"cloudrun"`, ~$45–70 a month.
**The web app cannot reach the VM**: nothing like `run.invoker` fronts it, so step 10's Incoming
source needs a route of its own, and the program refuses live mode on a VM. `/logs` does not see
it either; its output is under `gce_instance`. `docs/architecture/ingester.md` has the rest.

**There are two ways past that gate, and both write nowhere near BigQuery.** `WAREHOUSE=memory`
or `WAREHOUSE=file` with an `mqtt://127.0.0.1` URL is the replay harness — both halves checked,
because what is being protected is the warehouse and not the broker. `WAREHOUSE=none` is observe
mode (step 9): any broker, and the ingester is handed `writer: null` — no buffer, no flush, no
Firestore restart state, a clean MQTT session. Its client id is `power-meter-observer`, and the
gate refuses the writer's id in observe mode and the observer's id in a writing one, so an
observer can never evict the ingester that records. Do not add a fourth exemption.

**`apps/ingester/tools/capture.ts` is how a real payload gets read, and it is not an exemption.**
It is not the ingester: it subscribes, prints the raw integers and writes nothing, so there is
nothing behind it to corrupt. It connects with a random client id — never the ingester's fixed one,
which would evict a running ingester — and with a clean session at QoS 0. It reads the address and
credentials from **`reference doc/mqtt`**, which the customer supplied on 2026-09-22 (the workbook
itself never carried a hostname). Run it where TCP is allowed and its output settles active power on
a running meter; energy still needs that meter's display reading.

**A cloud session cannot reach that broker, and it is a blocked host rather than a blocked port.**
The egress proxy establishes a `CONNECT` tunnel to 8883, 8884 and 443 and then resets during the TLS
handshake, while the same tunnel completes one to `api.github.com`. Its README says to report a
policy denial rather than route around it, so do not go looking for a way through — run the capture
from a laptop or Cloud Shell instead.

**Those credentials are committed in plaintext and are in git history.** Rotate them before go-live
and put the new values in the `mqtt-broker-*` Secret Manager secrets, not back in a tracked file:
rotation is then a secret version plus a restart rather than a commit. Deleting the file does not
undo the exposure.

**Exactly one ingester, and it is three things rather than a setting.** `min-instances=1,
max-instances=1`; a fixed MQTT client id, so a broker evicts the older session when a new revision
attaches; and — the part that is easy to leave out — **an evicted instance exits instead of
reconnecting**. Without the third, two ingesters evict each other every few seconds and both write.
That last one reads MQTT 5's session-taken-over reason code. **HiveMQ sends it —
checked on 2026-09-22 with `npm run takeover -w @power-meter/ingester`, which saw reason code 142.**
The local replay broker (aedes, 3.1.1) cannot, which is why `MQTT_PROTOCOL_VERSION=4` is a harness
setting and never a deployment one.

**The ingester rolls up only minutes that have closed.** The flush timer does not divide the
minute, so a batch straddling 12:00 would otherwise write `(meter, 12:00)` twice — and since the
pair is the row's identity, the chart would simply draw that minute twice as heavily. Readings in
the running minute stay in memory for the next flush; their raw rows go out immediately, because
raw has no such identity. Raw and rollup are written in one call for the same reason: a crash
between two separate writes leaves a minute in one table and not the other, and nothing reads them
in a way that would notice.

**The decoder is imported by the ingester, never re-implemented in it.** `StationDecoder` comes
from `@power-meter/infrastructure`, the same object the fixtures and the screens use. That is what
the plan means by *shared verbatim*, and the one rule in this file that a well-meaning refactor is
most likely to break.
