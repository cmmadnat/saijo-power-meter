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
| `packages/domain` | Entities and rules. Imports nothing. |
| `packages/application` | Use cases and the port interfaces they need. Imports domain only. |
| `packages/infrastructure` | Adapters: the MQTT payload decoder, the scale-factor table, fixture data. |
| `apps/web` | Next.js + shadcn/ui frontend. Deployed to Cloud Run. |
| `scripts/check-boundaries.mjs` | Enforces the dependency rule. Runs first in CI. |
| `.github/workflows/check.yml` | Application checks. Holds no cloud credentials. |
| `.github/workflows/infra.yml` | Builds and pushes the web image, then runs Pulumi. Preview on PR, apply on `main`. |
| `.github/workflows/logs.yml` | Reads the Cloud Run service's logs on dispatch. Runs no Pulumi and holds a read-only identity. |
| `.claude/hooks/session-start.sh` | Installs the Pulumi CLI and `infra/` deps into a fresh container. |
| `docs/requirements/` | The frozen spec: the MQTT protocol, the meter registry, and the four screens. |
| `reference doc/`, root `.xlsx` | Customer specifications — the source those requirements were read from. |
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

**Reading the running application's logs works the same way round.** The session cannot query Cloud
Logging, so `.github/workflows/logs.yml` does it: dispatch-only, authenticating as
`power-meter-log-reader`, which holds `roles/logging.viewer` and nothing else. Claude dispatches it
and reads the output back through the GitHub API, so "read the log" is a request that can be made
here in chat — at the cost of a CI round trip per read, which is why it takes a free-form `filter`
input and why one wide read beats several narrow ones. Two things about it are deliberate: it is a
second service account rather than a role added to the deployer, because the value is that the logs
job cannot deploy; and its concurrency group is *not* `infra`, or a log read would queue behind a
deploy and vice versa. Every read also copies application log lines into the Actions run log, which
has its own retention and audience — worth revisiting when real meter data and the passcode gate
land.

**CI is the only thing that runs Pulumi at all.** That invariant is what makes the workflow's
concurrency group (repo-wide, not per-ref) sufficient to keep two runs off one state object. Two
things in `.github/workflows/infra.yml` look like they could be simplified and must not be: the
concurrency group stays repo-wide, and stack creation stays on `pulumi stack ls` rather than
`stack select`, because selecting a stack that does not exist takes a lock in the state bucket and
abandons it. Both cost a failed apply to learn.

## Commands

```bash
npm ci                         # root: npm workspaces, covers apps/* and packages/*
npm run verify                 # boundaries, then typecheck, lint and test across the workspace
npm run boundaries             # the dependency rule on its own — cheapest check, run it first

npm run dev  --workspace @power-meter/web
npm run build --workspace @power-meter/web   # also the container build's inner step
npm test     --workspace @power-meter/domain

cd infra && npm ci             # infra is deliberately NOT a workspace member
cd infra && npm run typecheck  # tsc --noEmit — the only infra check that works without credentials
```

`pulumi preview` in-session fails on missing credentials, not on a broken program. Open a pull
request to see a real one.

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
- **Database migrations** will be versioned, ordered, idempotent, and applied by an automated step
  *before* a new revision is promoted — never by hand against a deployed database, and
  forward-compatible so rolling back the app never requires rolling back the schema.
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

Steps 0–5 are done: the spec is frozen into `docs/requirements/` (including all four screens, in
`power-meter-ui.md`), the shell is deployed, the domain model, decoder and fixtures are in place with
tests, the Real time route carries screens 1–3 — the 55-meter table and the kW and kWh charts — and
History carries screen 4, all on those fixtures. Remaining, in order: the store, the MQTT ingester,
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

**The ingester is blocked on the customer.** The scaling divisors for active power and energy are
not documented anywhere in the workbook, and its sample payload is filler that does not reconcile —
see `docs/requirements/power-meter-mqtt.md`. Wrong scaling silently corrupts every row it writes and
no backfill recovers it, so that step does not go live before one real captured payload arrives.
