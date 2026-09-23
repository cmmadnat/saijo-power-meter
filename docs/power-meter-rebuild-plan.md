# Power Meter — rebuild plan (rough, for discussion)

Status: **agreed in outline.** Rate, retention, scope, auth and timezone are settled (see Answered).
One blocker remains before step 7 can go live, and it needs an answer from the customer: see Still
open. Step 7 is built around that blocker rather than waiting for it — the ingester exists and
refuses to connect to a real broker until the answer arrives.

## Architecture

The code follows **clean architecture**, with the dependency rule enforced by `npm run boundaries`
rather than left to discipline. `docs/architecture/clean-architecture.md` has the reasoning and the
placement rules; the short version is that three things in this plan already demanded it:

- The web app and the MQTT ingester are separate deployables with opposite scaling shapes, and
  step 7 requires them to share the decoder *verbatim*. A shared inner layer makes drift impossible
  rather than merely discouraged.
- Step 5's aggregations are promised to move server-side "unchanged" at step 8. Ports make that
  true by construction.
- The scaling divisors are still unresolved, so keeping raw payloads out of the domain confines
  that question to one adapter.

Layers: `packages/domain` (imports nothing) → `packages/application` (ports and use cases) →
`packages/infrastructure` (adapters) → `apps/*` (composition). The payload decoder is
infrastructure, not domain.

## Build log

Progress, evidence and per-step verification are recorded as a published artifact, updated as each
step lands: **https://claude.ai/artifact/31tF2FwCTTJ8LPAkU4ZPCF**

It carries each step's status, the files that shipped, the exact commands to re-verify it, what the
step turned up, and — from step 1 onward — a screenshot of the application as it stood at that
point. The step definitions mirror this document; status and evidence live in the artifact's own
store, so the log updates without the page being rewritten. It is private to the repository owner
until shared.

## What the old app actually did

Findings from reading `reference/` (looked at, not copied) and `reference doc/`:

- The old system was the whole Smart Factory app — Function Test, Calorie Meter, EMC, Field &
  Reliability, and Power Meter as one Quarkus + React + Firestore service on Cloud Run.
- **Power Meter was the thinnest module in it.** `PowerMeterResource.java` is six read-only GET
  endpoints over Firestore collections (`power-readings`, `power-meters`, `meters`, `dashboard`),
  with aggregation done in Java by looping over every returned document.
- **There is no MQTT anywhere in the old codebase.** Nothing subscribes, nothing ingests, nothing
  writes those Firestore collections. The dashboard read data that some other, unbuilt thing was
  supposed to put there. The old app's own docs list Power Meter as "❌ Not implemented".
- The screens that exist: a dashboard (4 summary cards, a 3-phase realtime kW chart, an uptime
  tracker, a grid of meter cards) and a per-meter detail page (performance, power quality, energy
  efficiency tabs, historical table). Several of those panels — power quality, THD, phase balance,
  efficiency, cost — have **no source in the customer spec**. They were invented.

So "match the old application" is a low bar on the backend and a *wrong* target on parts of the UI.
The plan below targets **the customer spec** and keeps old-app parity only where the two agree.

## What the customer actually asked for

From `reference doc/power meter/Smart Factory - Power meter.pdf` (4 pages, the real UI spec) and
`reference doc/Smart Factory - Server and MQTT Rev01.xlsx`:

**Screen 1 — Real time (table).** One row per meter: meter no, department (แผนก), machine number,
machine name, Voltage L1/L2/L3, Current L1/L2/L3, PF, Power (kW), Energy (kWh).

**Screen 2 — Real time (kW chart).** Power over time, one series per selected meter.

**Screen 3 — Real time (kWh chart).** Energy over time, same selector.

**Screen 4 — History.** Filter by department + start date/time → end date/time. Table: meter no,
department, machine no, machine name, **Total Energy (kWh)** and **running hours (Hr:min)** over the
window. Running hours comes from the "Stand by Power Level" column in the MQTT sheet (0.1 kW for
every meter today) — a meter counts as running while active power is above its standby level.

That is the whole app. Four screens. No cost, no THD, no AI.

**The data.** 9 MQTT stations, topic `PMeterStation01`–`09`, each carrying up to 8 meters, flat JSON
keyed `M<n>VL1..3`, `M<n>CL1..3`, `M<n>P`, `M<n>PF`, `M<n>E`. **55 of the 72 slots are
commissioned** and named (press machines, laser cutters, coil lines, injection moulding, air pumps,
MDB panels).
Values are integers with implied decimals (`"M1VL1":2321` → 232.1 V, `"M1PF":095` → 0.95). Station
and meter identity, department and machine name are **static config from the spreadsheet**, not
carried in the payload.

---

## The steps

Each step is one PR, small enough to review in a sitting, and ends in something you can look at.
UI first: steps 1–5 ship a complete, clickable app on fixture data before any backend exists.

### Step 0 — Freeze the spec into the repo — **done**
Shipped: `docs/requirements/power-meter-mqtt.md` (the protocol block extracted, with the verbatim
sample, the scaling status field by field, and the source's two errata) and
`docs/requirements/meters.json` (72 slots, 55 commissioned, stable `s<station>m<slot>` ids),
generated by `tools/extract-meters.py` so a new workbook revision is a re-run, not a hand edit.

Completed with step 3: `docs/requirements/power-meter-ui.md`, the four screens read off the PDF —
every column with its Thai heading, what the mock-up does *not* say, and the two things the
specification asks for that the workbook has no source for (machine number, meter numbering).

*Verified:* the extractor asserts 9x8 slots and fails otherwise; every meter appears exactly once; a
reviewer who has never seen the PDF can describe all four screens from the doc alone.

### Step 1 — Frontend scaffold
`create-next-app` + `npx shadcn@latest init https://tweakcn.com/r/themes/doom-64.json`, per
CLAUDE.md. Load Oxanium / Source Code Pro / Georgia via `next/font` or the theme falls back
silently. Light/dark toggle. App shell: nav with Real time / History, nothing else. No infra
changes in this PR.

*Verify:* `npm run build` and `npm run lint` clean; dark and light both render; `--radius: 0px` is
visible (square corners) and Oxanium is actually loading, not a system fallback.

### Step 2 — Domain model + fixtures — **done**
Shipped in two parts. First the layering, pulled forward because the entities needed somewhere to
live: the meter registry, the `Reading` entity and the running-vs-standby rule in `packages/domain`,
the ports in `packages/application`. Then `packages/infrastructure`, which is the rest of it:

- `src/mqtt/scaling.ts` — every divisor in one table, each carrying its confidence
  (`documented` / `inferred` / `assumed`) and the evidence behind it. `unconfirmedScales()` names the
  two still open, so step 7's startup check can refuse a live broker while they are.
- `src/mqtt/payload.ts` — tolerates the workbook's `"M1PF":095`, which is not valid JSON, and the
  quoted `"095"` the device may really send. Nothing else malformed is tolerated.
- `src/mqtt/decoder.ts` — station payload in, readings out. Uncommissioned slots are dropped rather
  than shown reading zero; a meter missing a field is skipped whole rather than emitted
  half-populated; `StationDecoder` holds the last energy counter per meter and flags a decrease.
- `src/fixtures/generate.ts` — deterministic multi-hour data for all 55 commissioned meters, with
  `toStationPayload` as the decoder's exact inverse (which is also how step 7's local broker replay
  gets its data). Step 4 made two properties of it explicit: load is a function of absolute time,
  not of where the window starts, and `defaultProfiles()` takes the fleet-wide profile assignment so
  generating for a handful of meters does not re-roll them. Without either, the table and the charts
  disagreed about the same machine on the same page.
- `src/fixtures/repository.ts` — those fixtures behind the `ReadingRepository` and
  `LatestReadingStore` ports, so step 8 swaps an argument rather than a call site.

*Verified:* 37 tests in the package. `2321 → 232.1 V`, the one documented conversion; each assumed
factor has a test asserting the assumption; the workbook's own sample decodes to 5 readings and 3
dropped slots on station 01 and to 55 readings across all nine; a decreasing counter raises an issue
and still yields the reading. Fixtures cover an idle meter, a running meter, one that crosses the
0.1 kW standby threshold in both directions, one that goes silent partway, and exactly one
energy-counter reset.

*Left for step 3:* the four screens from the PDF as `docs/requirements/power-meter-ui.md` — step 0's
one outstanding item, and it belongs with the screens rather than ahead of them. Done there.

### Step 3 — Real time table (screen 1) — **done**
Shipped:

- `docs/requirements/power-meter-ui.md` — step 0's leftover, all four screens (see above).
- `packages/domain/src/meter.ts` — `machineLabel` and `meterNumber`. The specification wants machine
  number and machine name as two columns and the workbook has one field, so the split is a rule with
  its cases written down rather than a `split(":")` in a component.
- `packages/application/src/realtime.ts` — the table as a use case: one row per commissioned meter,
  built from the `LatestReadingStore` port, each row carrying the reading's age and a `live` /
  `stale` / `offline` status derived from it.
- `apps/web` — the table itself under the customer's Thai headings, with the fixture adapters wired
  in `lib/realtime-source.ts`, which is the one file step 8 replaces.

**One addition to the specification, deliberately:** the mock-up has no freshness column and the
payloads carry no timestamp, so a table built straight off the latest reading shows a meter that
died an hour ago exactly as it shows one reporting now. Each row therefore carries a status marker,
and an offline row is muted and prints how long it has been silent. Worth confirming with the
customer, not worth shipping without.

*Verified:* every column of page 1 is present in the specification's order, under the customer's own
Thai headings; 55 rows render at 1920x1080 and at 1024x768 with no page-level horizontal scroll (the
table scrolls inside its own frame on the tablet); the four offline fixture meters are visibly
distinct in both themes; sorting holds on every column and the department filter narrows to 11 rows
for ผลิต พลาสติก; the 10-second refresh advances the "as of" clock without losing the filter, the
sort or the pause; no console errors in either theme.

### Step 4 — Real time charts (screens 2 & 3) — **done**
kW-over-time and kWh-over-time below the table, as page 1 of the specification draws them. Shipped:

- `packages/application/src/series.ts` — both charts are one query, bucketed. Active power is a
  rate and averages across a bucket; energy is a counter and takes the bucket's last value.
  Bucketing is here rather than in the chart because it is the same definition step 6's 1-minute
  rollup needs, and two copies of it would drift.
- `apps/web/components/meter-chart.tsx` — one component, two configurations. Plain SVG: the
  requirement is a multi-series line with a crosshair, and a charting library would have brought a
  dependency and its own theming for marks this simple.
- `apps/web/components/realtime-charts.tsx` — the meter selector the specification draws beside the
  plot, plus a window control it does not draw. Selection and window live in the URL, so the server
  builds only the series being looked at and a view can be linked to.
- `apps/web/app/globals.css` — eight validated series colours. Not the theme's own `--chart-1..5`:
  two of those are below the chroma floor at which a hue stops carrying identity, and they were
  never validated as a set.

**A meter keeps its colour when other series are removed.** The selection is eight slots with
holes rather than a list — deselecting empties a slot. Otherwise removing the second of four series
would renumber the rest, two lines would change colour, and the reader would think the data had
changed.

*Verified:* matches pages 2–3 — kW and kWh over time, one series per selected meter, the meter list
beside the plot; 8 series × 24 h loads in ~0.8 s and the crosshair reads all eight at once; the
legend is present on every chart in both themes and the values never depend on colour (direct end
labels where lines end clear of each other, a crosshair readout, and a table view of the same
numbers — which the light-mode contrast warning obliged on Doom 64's mid-grey surface, and which is
kept now that Light Green's white card lets every slot clear 3:1); the energy series climbs
monotonically across 24 h, and the note under it says why; the
palette passes the lightness, chroma, CVD-separation and normal-vision checks in both modes against
this theme's own surfaces.

### Step 4b — Chart legibility — **done**
Step 4 shipped charts that were correct and hard to read. Raised on review, fixed as its own step so
the before and after are both on the record.

The substantive change is **what the energy chart plots**. It drew the meter's raw cumulative
counter, which is literally what the protocol carries — and four counters plotted together are four
flat parallel lines whose spacing is only how long each meter has been installed. It now draws the
counter's **rise across the window**: lines start at zero and fan out by what each machine actually
used. That is the same arithmetic as the History screen's Total Energy, counter-reset rule included,
so `consumptionFrom()` in `packages/application/src/series.ts` is the one implementation both screens
use — step 5 inherits it rather than writing a second one.

**This is a reading of the specification, not a literal rendering of it.** Page 3 says
`Energy (kWh)` and the meter sends a counter. Worth putting to the customer: if they want the raw
counter, it is one argument at the call site.

Also: one series key above both charts instead of a legend under each, carrying every meter's
current kW and consumed kWh, so both charts are readable as numbers and not only as lines; pointing
at a key row dims the other lines, which is what makes eight of them separable; axis ticks stepped so
the data fills the plot rather than the lower half of it; the floating axis captions dropped, the
chart titles already carrying the unit; the meter list grouped by department; and the day shown on
the time axis when a window crosses midnight.

One fixture bug surfaced while checking the new column: energy was rounded to 0.1 kWh at *every*
step rather than when emitted, so any increment below 0.05 kWh vanished and an idle meter accumulated
**exactly zero** consumption. Standby draw is precisely what the History screen exists to make
visible, so that would have read as a screen-4 bug months from now.

*Verified:* the energy series rises from zero and separates — 348.6 / 312.0 / 413.3 / 430.1 kWh across
six hours for the four default meters, against four flat parallel lines before; the idle meter now
accumulates a non-zero standby figure instead of 0.0; pointing at a key row leaves that series at full
strength and drops the other seven to 0.18 opacity, checked in the browser; 8 series × 24 h still
loads in ~0.8 s; both themes, 1920×1080 and 1024×768, no page-level horizontal scroll, no console
errors.

### Step 5 — History (screen 4) — **done**
Department + date/time range filters, table of Total Energy (kWh) and running hours (Hr:min), all
boundaries in **Asia/Bangkok** with instants kept UTC underneath. Shipped:

- `packages/application/src/history.ts` — one pass over the readings stream produces both
  quantities. Total energy is the last value of `consumptionFrom()`, the same walk the energy chart
  plots, so the counter-reset rule has one implementation rather than two. Running time sums the
  gaps between readings, each credited to the state at its start.
- `apps/web/lib/history-source.ts` — the third and last of the fixture adapters, and the only place
  the Bangkok offset is applied. Thailand has had no daylight saving since 1920, so a picker value
  converts by appending `+07:00`, which is exact rather than approximately right.
- `apps/web/components/history-filters.tsx` and `apps/web/app/history/page.tsx` — the filter row as
  the mock-up lays it out, and the six specified columns. A plain `<form method="get">`: this
  screen's whole state is five values that belong in the URL anyway, so it needs no client component
  and works with no JavaScript at all.

**A gap longer than three minutes is not running time.** Running hours read a sampled signal, and
the honest reading of a silence is that nothing is known through it — not that the machine kept
running at whatever it was last seen doing. The cap matches the offline threshold. The energy the
counter accumulated meanwhile is still counted, because the counter carries it.

*Verified:* nine hand-computed tests in `history.test.ts` — minute-by-minute energy and running
time, a counter reset inside the window that does not go negative, a meter with no readings, a
single reading (zero consumption, not null), a gap past the cap, the department filter, the
half-open boundary, and an inverted range that is rejected. Built and run: an 08:00–17:00 window
over the 55 fixtures totals 12 938.9 kWh and 332:12, with continuously-running meters at 8:59 of a
nine-hour window; screenshots taken in both themes, and the malformed-range fallback checked.

### Step 5b — Fleet strip and department grouping — **done**
Not in the specification, and not in this plan until it was asked for: two additions to the Real
time screen that make 55 rows readable. Shipped:

- `packages/application/src/realtime.ts` — `totalActivePowerKw` and `byDepartment`, summed where the
  rows are built. Aggregates are data, not presentation: the same numbers head the bands and the
  strip, and a second summation in the component would have been free to disagree.
- `apps/web/components/fleet-strip.tsx` — reporting out of 55 with a square per meter, total load,
  running against idle and silent, the freshness split, and the busiest department.
- `apps/web/components/realtime-table.tsx` — department bands carrying each department's census and
  its kW subtotal, on by default, dismissable, with sorting applied inside a band.

**Offline meters do not count toward total load.** Their last reading stays on screen — that is the
point of showing it — but it is history, and adding an hour-old 90 kW into a figure labelled "now"
would overstate the factory by exactly the meters that have stopped saying what they are doing.

**The strip carries nothing that needs history.** The design sketch had an "energy today" tile and a
sparkline; both need a baseline or a window, neither is available from the latest reading per meter,
and putting a warehouse query behind a screen that refreshes every ten seconds is a cost decision
for step 8 rather than a detail to slip in here.

*Verified:* three tests on the aggregates — an offline meter's kW excluded from the total, per
department census and loads that sum to the fleet figure, and an all-silent fleet that reads zero
rather than empty. Built and run in both themes: strip and bands on 55 fixture meters, subtotals
matching the strip's total.

**← At this point the customer can review the whole app and we have changed no infrastructure.**

### Step 5c — Real time page order — **done**
Decided with the customer: on the Real time route the fleet strip and the two charts are drawn above
the 55-row table, inverting the mock-up, which puts the table first with the kW panel beginning
below it. No screen changed — same columns, same series, same controls — only the order of the three
on the one route that carries them all, because the table is taller than any screen it was checked
on and put both charts below the fold. Flagged as a deviation in `docs/requirements/power-meter-ui.md`
so a reviewer holding the PDF does not read it as an error.

*Verified:* `npm run verify` clean; screenshotted at 1920×1080 and 1440×800. At 1920 the strip, the
series key and the whole power chart are above the fold with the energy chart beginning below it; at
1440 the strip and the key are above the fold and the power chart begins. That is the honest result —
*both* charts never fit on one screen, and the claim is that the first one does, where before the
reorder neither did.

### Step 6 — Schema and migrations — **done**
The store is BigQuery, day-partitioned, 14-day partition expiry — see the storage section. Shipped,
with the reasoning in `docs/architecture/warehouse.md`:

- `infra/index.ts` — the **dataset**, and read-only access to it for the web service account. The
  tables are not here: they are schema, and the dataset/table line is the same one `bootstrap.sh`
  draws for the state bucket. The deployer gains `roles/bigquery.admin` in `bootstrap.sh`.
- `packages/infrastructure/src/warehouse/` — the three tables as an ordered migration list, a runner
  that records what it applied and refuses to run against a dataset that disagrees with the code,
  the two ports backed by the tables, a fixture loader, and a four-command CLI.
- `packages/application/src/series.ts` — `rollupReadings()`, the 1-minute rollup. The charts and the
  rollup now share their bucket primitives rather than each defining "a minute".

**The aggregation did not move into SQL, and that is the change to the plan.** This step used to
promise two history queries checked against the step-5 pure functions. There are no history queries:
the counter-reset walk and the three-minute gap cap have one implementation, in
`packages/application`, and a SQL copy would be free to disagree with it in exactly the cases nobody
checks — which CLAUDE.md already forbids in as many words. What arrived instead is the adapter, so
that is what is checked: `verifyAgainstFixtures` runs `historyTable` twice over the same window,
once against the fixtures in memory and once against what the warehouse gave back, and requires
every row to agree.

**Rollup buckets align to absolute time, not to a window's start.** The charts align to whatever
`from` they were handed; a stored row cannot, because the ingester writing it has no window.

**`latest` is not the real-time screen's source.** It is what a restarted ingester rehydrates from.
Paying per write for a value obsolete a second later costs more per month than all the history.

*Verified, without credentials:* 54 tests in the package, of which the load-bearing ones are — a
second `runMigrations` applies nothing and issues only the ledger DDL and the ledger read; an edited
migration and a dataset ahead of the code each stop the run; every shipped statement is
`CREATE ... IF NOT EXISTS`; raw and rollup carry `partition_expiration_days = 14` and
`require_partition_filter`, and `latest` carries neither; a reading survives the round trip to a row
and back through JSON; every readings query carries the partition filter the table demands; and
History over the warehouse matches History over the fixtures for all 55 rows. `npm run verify` is
green across the workspace (108 tests), the web build is unchanged, and the BigQuery SDK stays out
of its 58 MB standalone output because the client is imported dynamically.

*Applied and migrated, 2026-09-22.* The dataset, the API and the two bindings went in on the apply
after #24 — which is what proved the deployer's `roles/bigquery.admin`, a preview having planned
rather than created. The tables followed from `migrate`, run by hand.

*Verified against the project:* a second `migrate` applied nothing; `settings` read
`partition_expiration_days = 14` and `require_partition_filter` back off both readings tables and
neither off `latest`; a two-hour load wrote 41 730 readings, 6 314 rollup rows and 55 `latest` rows,
which reconcile at 6.61 readings per bucket against 60/9 expected; and `verify` matched all 55
History rows between the fixtures and the warehouse.

*What that run cost, and it is the lesson of the step:* the DDL did not parse the first time. `at` is
reserved in GoogleSQL, and it had passed review, 54 tests against the fake client and a green
preview. A test now checks every column name against the reserved list. **Nothing that runs without
credentials knows what BigQuery's parser will refuse.**

*Left behind:* the fixtures are still in the tables and expire in 14 days. Drop and re-migrate before
step 7 writes real readings, or the warehouse holds both with nothing telling them apart.

### Step 7 — MQTT ingester — **built, and connected to nothing**
**Still gated on open questions 1 and 2.** The service exists, it is verified against a local
broker, and it refuses to run against a real one while the divisors for active power and energy
are guesses. That refusal is code, not a note: `assertSafeToStart` in `apps/ingester/src/config.ts`
throws with both field names, and the only way past it is a broker on `127.0.0.1` writing
somewhere that is not BigQuery.

Shipped:

- `apps/ingester` — the service. `broker.ts` (the `Broker` port and the MQTT.js adapter),
  `ingester.ts` (decode, buffer, roll up, hold the hot state), `service.ts` (what happens on
  connect, disconnect and takeover), `http.ts` (`/latest`, `/stats`, `/healthz`, `/readyz`),
  `config.ts` (the gate), and `tools/replay.ts` + `tools/reconcile.ts`, which are how the claims
  below were checked.
- `packages/application/src/ports.ts` — `ReadingWriter`, the write side of the warehouse stated as
  an interface the application owns, so the ingester is testable without BigQuery.
- `packages/infrastructure/src/warehouse/writer.ts` — that port, backed by load jobs. Raw and the
  rollup in one call; `latest` replaced wholesale, and never truncated to nothing.
- `infra/index.ts` — the ingester's service account, the three broker secrets, its warehouse write
  access and its secret access, all applied; the Cloud Run **service** behind
  `saijo-power-meter:deployIngester`, which is `"false"`.
- `ci/migrate.sh` and the pipeline's new `migrate` step, plus `ci/image.sh` building both images
  from the one commit. Step 6 left the migrations hand-run because nothing depended on the tables;
  this is the step that does.
- `warehouse reset` — see *Loose ends* below.

`docs/architecture/ingester.md` has the reasoning: why exactly one instance is correctness rather
than tuning, what each failure mode costs, and what is still unproven.

**The singleton guarantee is three things, not one.** `min-instances=1, max-instances=1`; a fixed
client id, so a broker evicts the older session when a new revision attaches; and an evicted
instance that **exits rather than reconnecting**. The third is the one that is easy to leave out,
and leaving it out is worse than having neither: the two instances evict each other every few
seconds and both write. It reads MQTT 5's session-taken-over reason code, which is the only way a
client is told *why* it was dropped.

**Only closed minutes are rolled up.** The flush timer does not divide the minute, so a batch
straddling 12:00 would otherwise write `(meter, 12:00)` twice — and the pair is the row's identity,
so nothing downstream would catch it; the chart would draw that minute twice as heavily. Raw goes
out immediately either way, because raw has no such identity.

*Verified, against a local broker (aedes) replaying the fixtures through `toStationPayload`:*
a seven-minute run at 60 messages/minute — 419 published, 415 received, 2 537 readings across all
55 commissioned meters, 783 uncommissioned slots dropped, zero decode issues. The broker was killed
at 11:59:24 for 40 s: the client reconnected at 12:00:04 with the session resumed, the buffer was
kept across it, and no reading that arrived was lost (`droppedReadings: 0`, `failedFlushes: 0`).
`SIGTERM` flushed the last 91 readings before exiting. Restarting against the written `latest`
rehydrated **55 meters** and served them on `/latest` immediately, with `/readyz` correctly 503
while the broker was down. `tools/reconcile.ts` over the run: 385 rollup rows, every
`(meter, minute)` exactly once, mean power and last counter matching the raw readings behind every
bucket, and 2 391 counted + 146 still in the open minute = 2 537 raw. RSS held at 111–118 MB across
the run. In unit tests: a retried flush that neither loses nor duplicates, a capped buffer that
counts its drops, a hot state that keeps the *newest* reading when a queue drains out of order, and
the takeover path driven through a fake broker — 33 tests in the app, 144 across the workspace.

*Not verified, and each for a reason:*

- **No real broker, and no real payload.** The address and credentials arrived on 2026-09-22 in
  `reference doc/mqtt`, and `apps/ingester/tools/capture.ts` reads them — but **this session's
  egress policy does not allow that host**. A `CONNECT` tunnel is established to 8883, 8884 and 443
  and then reset during the TLS handshake, where the same tunnel handshakes with `api.github.com`
  fine, so it is a blocked host and not a blocked port. Run the capture from a laptop, Cloud Shell
  or the factory network: it subscribes, prints the raw integers and writes nothing. Its output
  settles active power on a running meter, because V, I and PF are pinned independently and
  `3 x V x I x PF` is what `M<n>P` has to agree with; energy still needs that meter's own display
  reading.
- ~~**The takeover has never run against MQTT 5.**~~ **Done, 2026-09-22.** `tools/takeover.ts`
  opened two connections to HiveMQ under one client id and the first was handed `DISCONNECT, reason
  code 142` — the signal the guard reads. What remains untested is only the ingester *process*
  doing this against HiveMQ, since it has never been allowed to connect; the adapter's mapping and
  the service's shutdown are asserted against a fake. Against aedes (3.1.1, no reason code) two
  ingesters instead flap, each evicting the other every ~5 s, which is the evidence the guard is
  needed rather than that it works.
- **The image has never been built** (no Docker daemon in a cloud session) and **the Cloud Run
  service has never existed**, so `min/max-instances`, the probes and the secret environment are
  declared and unapplied.
- **No 24-hour soak**, and **cost per day is still an estimate**. Both need the service running.
- **The `migrate` step has never executed.** The first pull request touching `infra/` runs its dry
  run.

*Loose ends from step 6, decided:*

- **The fixture rows stay until the dataset is reset, and `reset` is now a command.** `load` writes
  synthetic readings into the same tables the ingester writes real ones into and nothing in a row
  tells them apart. `warehouse reset --yes` drops all three tables and the ledger with them; the
  sequence before the first real ingest is `reset` then `migrate`. A `source` column was the
  alternative and was rejected: it costs a migration, a column on ~9.7 M rows, and a filter every
  query has to remember.
- **`migrate` is no longer hand-run.** It is a pipeline step, before the apply that promotes a
  revision depending on it.

### Step 8 — Wire the UI to real data — **built; live mode verified against the replay, not BigQuery**
Shipped together with 8b, because the one decides what the other may delete. The reasoning, the
cost table and what is unproven are in `docs/architecture/data-modes.md`. Shipped:

- `packages/application` — a `RollupRepository` port; `meterSeries` takes either port and folds a
  stored minute into its buckets by the same three rules it folds a reading by; `fleetTrend`, the
  strip's two windowed tiles, built from `meterSeries` and a sum across meters.
- `packages/infrastructure` — `WarehouseRollupRepository`; `WarehouseReadingRepository` batching
  meters under a row budget; `CachedRollupRepository`; `IngesterLatestReadingStore` and
  `metadataIdToken` for the private ingester; the `/latest` wire shape moved here so both
  deployables share it; the replay's file store moved here and given a read side;
  `warehouse cost`.
- `apps/web/lib/live-adapters.ts`, and the three source files rewritten to ask for a port.
- `apps/web/components/fleet-strip.tsx` and `sparkline.tsx` — the two deferred tiles.
- `apps/web/app/error.tsx` — live mode can fail where demo cannot, and the real-time route is a
  wall display, so a failed read shows a retrying error screen rather than Next's default page.
- `infra/index.ts` — `DATA_MODE` and, once the ingester exists, `INGESTER_URL` on the web
  service, which now sits below the ingester so it can read its URL.

**Decided: the charts and the strip read `readings_1m`; History reads raw.** A change of table, not
of arithmetic — proved by drawing the same chart from raw readings and from their rollup, in the
application layer and again through the warehouse adapter. The cost is a right-hand edge that
trails by up to a closed minute plus a flush. History stays on raw because running hours are read
off the gaps; its gap cap is **back at the three-minute default** in live, and stays widened in demo,
where the sampling is still coarse.

**Decided: "since the shift started" is since 00:00 Bangkok.** The specification defines no shifts,
and 00:00 is where History's default window opens. The load line sits under "total load now"
rather than in a sixth tile.

**Measured: what the strip costs behind a ten-second refresh.** Every one of these reads bills
BigQuery's 10 MB minimum, so the number of queries is the cost. Uncached, the route would issue 18
a minute per open screen — ~7.4 TiB a month *per screen*. Shipped, rollup reads are cached until the
minute turns and the strip's two windows share one read: **2 queries a minute per instance,
~0.82 TiB a month, independent of screens open** — asserted in `sources.test.ts` with a counting
client. The per-query bytes and the latency need BigQuery; `warehouse cost` measures both and has
not been run.

**Changed from step 6: History no longer issues one query per meter.** Fifty-five queries each
billing the 10 MB floor, and each able to scan the day's partitions since clustering need not prune
at this size, became batches under a 750 000-row budget — one query for today, eleven for a
fortnight.

*Verified:* `npm run verify` green. The web app's source functions run the same assertions against
both adapter sets (`apps/web/lib/sources.test.ts`) — the demo set, and the live set over a loopback
`/latest` and the file warehouse — and live History over what was stored equals History over the
readings themselves, row for row. End to end: the replay broker, a real ingester process writing
`WAREHOUSE=file`, and the production web build in `DATA_MODE=live` reading both; screenshots of all
four screens in each mode. Page load, sequential, production build, p50 / p95: demo `/` 81 / 102 ms,
History today 116 / 145 ms; live over twenty minutes of replay `/` 36 / 50 ms, History 62 / 74 ms.
On the same replay the energy tile read 475 kWh against History's default footer of 485.7 — the
difference is the not-yet-rolled-up tail, which the tile labels, plus each meter's first minute,
since the replay began mid-day with no pre-midnight baseline. The image: the
BigQuery SDK is bundled into the server chunks, standalone 58 → 59 MB, and a client constructed inside
the production build reaches the credentials check.

*Not verified, and why:*

- ~~**No BigQuery.**~~ **Done, 2026-09-23**, from Cloud Shell: `warehouse cost --runs 20` parsed
  and ran all three statements against the project. p50 / p95 per cache miss — strip 949 / 1 281 ms,
  24-hour chart 308 / 720 ms, today's History 258 / 545 ms in one query — each billing the 10 MB
  floor. What remains is that the data read was step 6's fixtures, and that no web process has yet
  read the warehouse: that happens when live mode is switched on.
- **The ID token has not been minted on Cloud Run**, because the ingester service does not exist.
- **The two strip tiles have not been checked against History in BigQuery.** In the replay they
  differ by the rollup's lagging tail, as designed; the warehouse still holds step 6's fixtures.

*As specified:*

Replace fixture calls with API routes / server components. The step-5 aggregation functions move
server-side unchanged. Fixtures stay — as the test fixtures, and as the demo mode step 8b makes a
shipped feature, so this step *adds* the live adapters beside them rather than deleting the
fixture path.

**Finish the fleet strip here.** Step 5b left two tiles out — energy since the start of the shift,
and a sparkline of total load across the last hour — because both need a baseline or a window, and
the latest-reading-per-meter store has neither. Once the warehouse exists they are one query each;
the open question is what that query costs behind a screen that refreshes every ten seconds, which
is answerable then and not now. The design they complete is on the canvas the build log links.

*Verify:* every screen matches its step 3–5b behaviour against real stored data; p95 page load
measured; the four screens are the only thing that changed; the strip's two deferred tiles read the
warehouse, with the cost of that refresh measured rather than assumed.

### Step 8b — Two data modes: live and demo — **done**
Shipped as specified below, with the reasoning in `docs/architecture/data-modes.md`:
`apps/web/lib/data-mode.ts` reads `DATA_MODE` once, runs the gate, and loads one of
`demo-adapters.ts` or `live-adapters.ts` by dynamic import; the three source files ask it for a
`DataSource` and never learn which. `instrumentation.ts` refuses to boot.

Three decisions beyond the text below:

- **An unrecognised `DATA_MODE` refuses to boot** rather than falling back to demo. Unset is demo, as
  specified; a typo is a misconfiguration and deserves a crash loop.
- **The replay harness is live mode, badged *Local replay*.** An ingester on loopback with
  `WAREHOUSE=file` passes the gate — the ingester's own exemption, both halves required — and
  runs live code over fixture numbers, so it is marked exactly as demo is.
- **Fixtures are a second entry point, `@power-meter/infrastructure/fixtures`,** and
  `check-boundaries.mjs` walks the web app's import graph to prove live mode never reaches it —
  with one exempt edge, the dynamic import of the demo set.

*Verified:* `DATA_MODE` unset, empty and `demo` are demo (unit tests, and the production server's
boot line). The badge renders on `/`, `/history` and a 404 in demo and in the harness; live renders
none on any of the three, checked in a browser against a throwaway build with the divisors marked
confirmed — which is also what found the 404 page prerendered with the demo badge baked in, now
fixed by making the layout request-time. With the ingester stopped, live mode shows a retrying
error screen and recovers by itself when it returns. `DATA_MODE=live`
with the two assumed scales exits 1 on the production build, naming `activePower, energy`; so does a
loopback ingester in front of BigQuery, and so does `DATA_MODE=prod`. A planted import of the demo
set from the fleet strip fails `npm run boundaries` with the chain printed.

*As specified:*

Decided with the customer, and it changes what step 8 is allowed to do: replacing the three source
files must not delete the fixture path. The application runs in one of two modes, chosen by
configuration, and both are first-class:

- **`live`** — the real path. Real-time reads the ingester's in-memory hot state over HTTP; the
  charts and History read the warehouse. This is what a production deployment runs.
- **`demo`** — the fixture path, which is what every screen runs on today. The generator in
  `packages/infrastructure` stays a shipped adapter rather than becoming test-only, so the app can
  be shown, reviewed and demonstrated with no broker, no BigQuery and no credentials — which is
  also what makes a preview deploy and a local `npm run dev` work unchanged.

**The mode is one switch and it is read in exactly one place.** A `DATA_MODE` environment variable
(`live` | `demo`, defaulting to `demo` so a misconfigured deployment degrades to obviously-fake
numbers rather than to a blank screen) is read by a single composition module in `apps/web/lib`,
which picks the adapter set. `realtime-source.ts`, `series-source.ts` and `history-source.ts` keep
their current shape and ask that module for a port; nothing above them — no use case, no
component — learns which mode it is in. Per-source overrides are explicitly not offered: a half-live
app whose table is real and whose History is synthetic is a bug generator, and one switch makes
that state unrepresentable.

**Demo mode is visible, always.** A persistent badge in the shell header reads *Demo data* and the
Real time header's "Fixture data · no meter is connected yet" line becomes its mode-aware form. A
screenshot of demo mode must be unmistakable as demo in isolation, out of context, months later —
the failure this guards against is a synthetic number being read as a measurement, and it costs one
badge to make impossible.

**Live mode refuses to start while the scaling divisors are unconfirmed.** `unconfirmedScales()`
already exists for exactly this; here it gains its second caller. `DATA_MODE=live` with an
`assumed` divisor is a startup failure with a message naming the fields, not a warning in a log.
Demo mode is unaffected, because nothing it produces is a measurement.

*Verify:* the same four screens render in both modes with no component change, proved by running
the existing screen tests against each adapter set; `DATA_MODE` unset behaves as `demo`; the demo
badge is present on every route in demo mode and absent in live; `DATA_MODE=live` with the two
`assumed` scales fails to boot, with both field names in the message; no fixture module is reachable
from a live-mode render path, asserted the way `check-boundaries.mjs` asserts the dependency rule.

### Step 8c — Fit the ingester's writes inside BigQuery's per-table limit — **done, verified and applied**
**Had to land before `deployIngester` is flipped, and has.** Found after step 8, and not a cost
problem — a correctness one. The ingester wrote with **load jobs**, and BigQuery caps table
modifications per table per day.

**The quota figures, confirmed against the quotas page on 2026-09-23** (the entry that planned this
step had 1 500 from memory, and was partly wrong):

| Quota | Default | Applies to |
| --- | --- | --- |
| Load jobs per table per day | **1 500** | Counts toward the destination table's operations limit; failed jobs included. |
| Table modifications per day | **1 500** | A **standard** table. Cannot be raised. |
| Partition modifications per column-partitioned table per day | **30 000** | A table partitioned on a column, which both readings tables are. |
| Partition modifications during ingestion-time per partitioned table per day | **11 000** | Not used here. |

DML and **streaming are excluded from all of them**. Against the rates step 7 chose:

| Table | Written every | Jobs / day | Limit that applied | Verdict |
| --- | --- | --- | --- | --- |
| `latest` | 30 s | 2 880 | 1 500, standard table | **Over.** Would have stopped at ~12:30 daily. |
| `readings` | 45 s | 1 920 | 30 000, column-partitioned | Under — on one reading of the docs. |
| `readings_1m` | 45 s | 1 920 | 30 000, column-partitioned | Same. |

So the original table in this entry was **right about `latest` and wrong about the other two**: a
partitioned table has its own, higher limit which replaces the standard one. What the docs do not
settle is which limit governs a *load job* into a partitioned table, because the load section
states its own 1 500 and then refers to both table sections. That ambiguity was the real defect —
the ingester's steady state sat 28% over one candidate limit and 94% under the other, and nobody
could say which. Streaming removes the question rather than answering it. The replay harness writes
files, never BigQuery, which is why nothing caught any of it.

**What shipped (option A, as decided):**

- **`latest` is one Firestore document**, `ingester/latest`, holding all 55 readings at ~15 KB
  against the 1 MiB limit, overwritten every 30 s — 2 880 writes a day, inside the free quota of
  20 000. Not 55 documents: that would be ~158 000 writes a day and real money for a value obsolete
  a second later.
  **One correction to the decision as written:** the free quota covers *exactly one database per
  project, the default one* — named databases get none. So this is the `(default)` database rather
  than a named one, which keeps "the restart state is free" true. The cost of that choice is that a
  project which already has a default database fails the apply with *already exists*, since Pulumi
  creates rather than adopts; `gcloud firestore databases list` says in advance and `pulumi import`
  is the remedy.
- **`readings` and `readings_1m` stay in BigQuery**, written through the **Storage Write API**
  default stream. No per-day cap, 20 MB per request against a flush of a few tens of KB, and
  $0.025/GiB with the first 2 TiB a month free against ~1 GB a fortnight. `warehouse load` keeps
  using load jobs, which is what they are for: one bulk write, run by hand.
- **`ReadingWriter` is unchanged**, as required. `WarehouseReadingWriter` now takes a `RowStream`
  and a latest-writer, so the split is visible in its constructor. Raw and rollup still go out in
  one call — two `AppendRows` requests issued and awaited together, the API having no way to make
  them one — and only closed minutes are still rolled up.
- **Migration `0002` drops `latest`**, forward-only. `infra/index.ts` gains the Firestore API, the
  `(default)` database and `roles/datastore.user` for the ingester account; the web app gets
  nothing, because it never read `latest`. The ingester account **lost** `roles/bigquery.jobUser`,
  which only a load job needed.
- Nothing in `ci/` changed, so nothing had to survive a trigger it does not know about yet.

**Rough cost:** about $0 a month either way — load jobs were free too. The gain is that the
ingester keeps working after lunchtime.

**Rejected (option B): keep load jobs, write less often** — raw every 90 s, `latest` every 2 min,
under 1 000 jobs a day. No new service and two numbers to change, but a crash loses up to 90 s of
readings instead of 45, a restart rehydrates state up to 2 min old, and failed jobs count against
the same limit, so a bad hour of retries eats the margin.

**Later, optional (option D): serve today's minutes from the ingester.** It could hold the fleet's
per-minute buckets for the day in memory and serve them, taking the strip and the charts off
BigQuery entirely — strip 1.3–1.6 s p95 per cache miss down to milliseconds, and up to ~$5 a month
per extra warm web instance. More logic in the singleton, and a restart reloads the day with one
query. Worth doing for speed if the strip's cache miss is noticed; not for money.

*Verified:* `npm run verify` green — 83 tests in `packages/infrastructure` including the new row
mapping, the two-store writer, the document round trip and the soak's own arithmetic. The replay
harness runs unchanged end to end: 737 raw readings over five flushes with `failedFlushes: 0`, a
restart rehydrating 55 meters from `latest.json`, and `reconcile` clean over 110 buckets. The web
build is unchanged at 60 MB standalone and contains neither new SDK — grepped for, with
`@google-cloud/bigquery` found in the same grep as a control.

*Still unproven, and this is the part that needs a project:*

**Settled against the project on 2026-09-23**, using a throwaway `scratch_8c` dataset and a scratch
Firestore database, both deleted the same afternoon:

- **`0002` is legal DDL** — BigQuery's parser accepted the `DROP TABLE`, and `settings` afterwards
  showed `latest` gone.
- **`0001`'s checksum survived the edits around it.** That is the one that mattered: the scratch
  dataset had been migrated by the *pre-8c* code first, so the run had to agree with a ledger
  written before this step, and it did, applying only `0002`. `power_meter` carries the same ledger
  row from 2026-09-22, so the pipeline's `migrate` has nothing to stumble over. A test now pins
  that checksum.
- **The daily cap is gone, measured.** `soak --cycles 1600 --interval 200` put **1 600 appends into
  each table in about eight minutes — 176 000 rows, zero failures.** A load job would have been
  refused at 1 500.
- **The rows are readable and the timestamps decoded**: 88 000 rows and 55 meters per table,
  `reading_at` spanning the run, rollup minutes walking back ~27 hours. Accepted and correct are
  different claims, and a TIMESTAMP sent as a string rather than a `Date` would have failed this.
- **The restart-state document round-trips**: 55 meters, 10 755 bytes, 1% of the 1 MiB limit.
- `gcloud firestore databases list` returned nothing, so Pulumi creates `(default)` rather than
  colliding with one.

That run also found a bug — in the soak, not the write path. It produced 1 592 distinct rollup
minutes instead of 1 600, because each cycle's bucket was anchored to that cycle's clock and
repeated whenever the wall clock crossed a minute. Anchored once now, and the test moves its clock,
which is what would have caught it. The ingester's closed-minute rule is separate code and was
never involved.

**Applied, on the second attempt.** The merge's `migrate` passed and its `pulumi` step failed 403
creating the Firestore database — the deployer did not hold `roles/datastore.owner`, and the
preview had gone green because a preview plans rather than creates. Granting the role and
re-applying finished it: `image / migrate / pulumi` all passed on build `96715c14`, `+ 2 created,
~ 1 updated, - 1 deleted`. So `0002` is in, the `(default)` Firestore database exists, the ingester
holds `roles/datastore.user`, and its `roles/bigquery.jobUser` is gone.

The failure is recorded rather than tidied away, in `docs/architecture/delivery-pipeline.md`,
because it is the second instance of one rule: **a change that adds a kind of resource the stack
has never created before checks the deployer's role list in the same edit.** The half-applied state
in between broke nothing only because nothing reads either store yet.

| Unproven | What settles it |
| --- | --- |
| The ingester process itself writing to either store | blocked by the scaling gate, as everything else about it is |

The plan's own verify list asked for `/stats` showing `failedFlushes: 0` against a real dataset.
**That cannot be done without breaking the startup gate** — `WAREHOUSE=bigquery` is refused while
the divisors are guesses, and no new exemption was added. `warehouse soak` is the honest substitute:
the same writer, the same batch shape, the same two tables, driven by a tool that has no broker
behind it. It runs faster than real time on purpose, because the limit being disproved is per *day*
and crossing it in an hour is a stronger result than crossing it in thirteen.

### Steps 9–11 — revised 2026-09-23: show the customer what is arriving, beside what it will be

The previous steps 9–11 (passcode gate, deploy, operations) moved to the **Backlog** below. The
reason is the customer's own message of 2026-09-22: they have put a **simulated** feed for all nine
stations on HiveMQ, publishing **once a minute**, and the useful thing to give them now is a way to
see that feed on the real screens next to the demo of the finished product — not a gate in front of
a demo nobody needs to protect.

The constraint that shapes all three steps: the live gate exists to keep **wrongly-scaled numbers
out of the warehouse**, where no backfill can fix them — not to keep them off a screen. So the
incoming feed can be shown as long as nothing stores it and every screen says what it is. Three
rules in `CLAUDE.md` bend to make room for that — a third gate exemption, a data source chosen per
viewer rather than per deployment, and the ingester deployed before go-live — and each is changed in
the step that needs it, with the reasoning beside it, not before.

### Step 9 — The ingester in observe mode
Deploy the ingester to Cloud Run, connected to the customer's broker, **writing nothing**: no
BigQuery, no Firestore. It keeps the latest reading per slot in memory and serves it on `/latest`,
as it already does, plus a rolling in-memory hour per meter so a kW chart has something to draw.

- `WAREHOUSE=none` — a writer that persists nothing. `assertSafeToStart` accepts a remote broker
  *only* with it: the third exemption, justified in the code by the same argument as the other two
  — what is protected is the warehouse, and this touches none of it.
- Its own MQTT client id, distinct from the go-live ingester's, so the observe instance can never
  evict the real one or be mistaken for it. Still `min=max=1`.
- `deployIngester` flips to true; the three `mqtt-broker-*` secrets get versions (the values
  already committed in `reference doc/mqtt` — rotation stays a go-live item); the deployer's role
  list is checked in the same change, per the rule that cost step 8c a red `main`.
- The feed publishes once a minute, not the specification's ~9 s per station. `DEFAULT_FRESHNESS`
  (live ≤ 30 s, stale ≤ 180 s) would show every meter flickering live → stale each minute, so the
  observe source carries its own thresholds derived from the interval it actually sees, and the
  screen says which interval that is.

*Verify:* the deployed `/latest` returns the nine topics' slots, 5/5/8/7/7/6/7/6/4; no job appears
in BigQuery's history and `ingester/latest`'s update time does not move while it runs; a restart
begins empty and fills within one publish; a second instance with the go-live client id is not
evicted by it.

*Status, 2026-09-23:* built and verified against the replay broker — `WAREHOUSE=none` hands the
ingester no writer at all, `/recent` serves the rolling hour, `/latest` carries `recording` and the
measured `publishIntervalMs`, and `freshnessForInterval()` derives thresholds from it by the
default's own rule. `deployIngester` is `"true"` in the same change, so its merge deploys the
observer — on a free-tier Compute Engine e2-micro in `us-central1-a` rather than Cloud Run, whose
always-on vCPU would bill ~$45–70 a month. That leaves step 10 one more job: the web app has no
route to a VM, so the Incoming source needs one. The four checks above are in `docs/runbooks/cloud-shell.md` with one correction —
the Storage Write API creates no jobs, so "no job in BigQuery's history" proves nothing, and the
runbook reads `MAX(ingested_at)` and the rollup's row count instead.

### Step 10 — A viewer toggle: Demo ↔ Incoming
A control in the header, remembered in a cookie, that chooses the data source for **the whole app
at once** — never one screen — so "no half-live app" still holds; it becomes a choice of the
viewer's instead of the deployment's.

- **Demo** — today's fixtures on every screen, badged *Demo data*. "What it will be."
- **Incoming** — the observe ingester's `/latest` and its in-memory hour, badged *Incoming — test
  publisher, scaling unconfirmed*. The table shows scaled values with the raw integers one click
  away, so the customer can compare them with what HiveMQ's console shows. The kW chart draws the
  last hour. The kWh chart and History say **not recorded yet**: nothing is stored, and they never
  fall back to fixtures to fill the space.
- `DATA_MODE` keeps its meaning. `live` and its gate are untouched and still reserved for go-live;
  Incoming is a third `DataSource`, not a weaker live mode. The deployment's `DATA_MODE` decides the
  default, the toggle decides the rest.
- `npm run boundaries` still allows fixtures only through `demo-adapters.ts`; the toggle picks
  between two loaded sources, it does not open a new path to the fixtures.

*Verify:* switching changes every route in one navigation; Incoming never renders a fixture value
(asserted, not eyeballed); both badges present on every route including not-found; the raw
integers on screen match a `capture` run taken at the same minute.

**Step 10 is where the project waits until the customer goes live, and it is a safe place to wait.**
Nothing is stored, so nothing accumulates that step 11 must undo. When the real meters begin
publishing they appear in Incoming first, raw integers on screen, and reading one meter's display at
the same moment is the evidence the divisors need — so step 11 starts from a screen the customer is
already looking at. What waiting costs: the observe ingester is billed around the clock, and
History and the kWh chart stay *not recorded yet*. The passcode gate and the subscription alert are
done during the wait.

### Step 11 — Go-live, when the meters publish
Everything `CLAUDE.md` already says must happen together, gathered into one step: divisors confirmed
in `scaling.ts` from a real payload and that meter's display; broker credentials rotated into Secret
Manager; `warehouse reset --yes`; the ingester switched from observe to writing, on the go-live
client id; `DATA_MODE=live`. The toggle's Incoming becomes **Live** — charts and History from the
warehouse — and Demo stays on the toggle as the product tour.

**The passcode gate lands before this step.** Test-publisher numbers on a public URL are harmless;
a factory's real load is not.

*Verify:* as old step 10 — the deployed app shows live meter data, and the rollback path is
exercised once.

### Backlog
Moved out of steps 9–11 on 2026-09-23, unchanged in substance.

- **Passcode gate** *(old step 9 — due before go-live).* A single shared passcode, checked
  server-side against Secret Manager, httpOnly + secure session cookie, every route and API behind
  it. No user accounts. Rate-limit the attempt endpoint. *Verify:* every route and API path 302s or
  401s when unauthenticated (enumerate them, don't spot check); the passcode never reaches the
  client bundle or a log line; rotating it invalidates existing sessions; cookie flags correct over
  HTTPS.
- **Deploy leftovers** *(old step 10).* The passcode secret and the rollback rehearsal. The web
  service is deployed; the ingester's deployment moved into new step 9.
- **Operations** *(old step 11).* An alert when a station stops publishing, and one when the
  ingester's subscription drops — the second is worth having as soon as step 9 runs. The hourly
  rollup is not needed: 14 days does not justify it. *Verify:* silence a station and confirm the
  alert fires within a defined window (there is no staging stack; the replay harness or a paused
  publisher stands in); confirm 14-day-old partitions are gone; confirm a killed ingester pages
  someone.

---

## Where to put the data, and cheaply

All the inputs are now known: **60 messages/minute total across the 9 stations**, **14 days of
history**, Asia/Bangkok.

That works out much smaller than the first two drafts assumed:

| | |
| --- | --- |
| Each station publishes every | ~9 s (so each meter gets a reading every ~9 s) |
| Readings/day | ~691,000 |
| Rows in the 14-day window | ~9.7 M |
| Raw size | **~1 GB — steady state, not growing** |

One gigabyte that never grows. That is small enough that the interesting cost is not history at all:

**The expensive part is the realtime screen, not the history.** 691 k readings/day is ~20.7 M
writes/month. If every reading upserts a "latest value" row, that is **~$19/month in Firestore
writes alone** — more than the rest of the system combined, to serve 55 numbers that are obsolete a
second later. Cold storage of the same data in BigQuery is **~$0.07/month**. The intuition inverts:
keeping 14 days of history is nearly free, and it is the live view that costs money if built
carelessly.

So don't store the hot state at all:

- **Hot (screen 1, and the live end of screens 2–3)** — the ingester is already a persistent process
  holding the MQTT connection. It keeps the latest reading for all 55 commissioned meters **in
  memory** and serves
  them over HTTP (or pushes via SSE). Cost: nothing. It also flushes those 55 rows to the database
  every ~30 s purely so a restart doesn't start blind.
- **Cold (screens 2–4)** — **BigQuery**, day-partitioned with a **14-day partition expiry** so
  retention is configuration rather than a cleanup job. ~$0.07/month at this volume, and queries sit
  inside the 1 TB free tier with room to spare.

**This makes the ingester a singleton, which is a correctness requirement, not a tuning choice.**
Cloud Run `min-instances=1, max-instances=1`. Two instances means two subscriptions to the same
topics, which means every reading stored twice and every energy total wrong. Use a fixed MQTT client
ID so that during a deploy the broker evicts the old connection when the new one attaches, instead
of both running briefly.

**At ~1 GB, Postgres is now genuinely competitive** — it was a tuning exercise at the volumes I
assumed two drafts ago, and isn't anymore. One store, real SQL, no streaming-buffer latency. The
only reason I still lead with BigQuery is cost: Cloud SQL's smallest always-on instance is
~$10–25/month, which roughly doubles the bill to remove a modest amount of complexity. Worth
revisiting if the query patterns get richer than these four screens.

Rollups get simpler too. A 1-minute rollup is still worth writing in the same batch as raw (a
14-day chart is ~20 k points per meter at 1-minute resolution versus ~134 k raw), but the hourly
rollup from step 10 is now **unnecessary** — there is no long range left to serve.

### Monitor continuously, or cron?

**Settled: continuous.** MQTT is push-only so cron cannot poll it, and the one trick that makes cron
work — a persistent session (`cleanSession=false`, QoS 1) letting HiveMQ queue while disconnected,
drained by a scheduled job — needs the queue to outlast the gap. HiveMQ Cloud's free-plan queue is
1000 messages per client; at 60/min that **overflows in under 17 minutes**, silently.

So: an always-on subscriber on Cloud Run, `min/max-instances=1`, CPU always allocated. Roughly
**$6–13/month**, and it is what makes the free in-memory hot path possible.

### Rough monthly bill

| | |
| --- | --- |
| Cloud Run ingester (always on, singleton) | $6–13 |
| Cloud Run web app (scales to zero) | $0–3 |
| BigQuery storage + ingest + queries | ~$1 |
| Artifact Registry | ~$0.10 |
| **Total** | **~$10–18/month** |

Swapping BigQuery for Cloud SQL would put this at ~$25–40.

## Answered

- **Rate: 60 messages/minute, total across all 9 stations.** ~691 k readings/day.
- **History: 14 days.** Raw retention is therefore 14 days and there is no long-term archive —
  a `require_partition_filter` table with a 14-day partition expiry covers it.
- **Scope: Power Meter only.** The other four modules in `reference doc/` are out.
- **Auth: a single shared passcode.** Not per-user accounts. Checked server-side against a value in
  Secret Manager, with an httpOnly session cookie; every route behind it. Deliberate consequence:
  there is no audit trail of who looked at what, and rotating the passcode signs everyone out. Both
  are fine for a factory dashboard and both are cheap to revisit later. **Flagging one reading I had
  to make:** I took "passkey" to mean a shared passcode rather than WebAuthn/FIDO passkeys — say the
  word if you meant the latter, it is a different (and not simple) piece of work.
- **Timezone: Asia/Bangkok** for day boundaries, the History picker, and rollup bucket edges. Stored
  as UTC instants, converted at the edges only.
- **Voltage scaling: `data / 10`,** documented in the `Sample data` tab.
- **`M<n>E` cumulative-vs-interval:** still to be settled empirically, in the first hour of live
  data. Step 7 is built and cannot answer it, because it has never connected to a meter; the
  decoder already flags a counter that goes backwards, so the first hour will say.

## Still open

**The one blocker left, and it is a customer question, not a technical one:** the scaling divisors
for current, active power, PF and energy.

**As of 2026-09-22 it is also a scheduling question.** The broker is live and the nine topics carry
traffic, but the customer confirms that is a **test publisher, put up as a rough idea** — the meters
are not publishing yet. So no capture can settle the divisors, however many are taken: a simulator
cannot know what scaling the real device applies. The question is now *when the meters go live*, and
step 7 waits on that rather than on an answer somebody could write down today.

**The test publisher sends once a minute** (customer, 2026-09-22), against the specification's
60 messages a minute across nine stations. That is the simulator's rate, not a revision of the
meters' — worth confirming in the same conversation, because the freshness thresholds, History's
three-minute running-hours cap and the ingester's rates were all sized for ~9 s.

**Units are settled: active power is kW** (customer-confirmed). That narrows the question without
closing it — 4995 raw would be ~5 MW, so the value is scaled, and the divisor is still unknown.

I went through all four tabs of the workbook for these. They are not documented, and what is there
cannot settle it:

- *The sample payloads are filler.* `"M1VL1":2321,"M1CL1":1522,"M1P":4995,"M1PF":095` appears
  byte-identical on every topic and all 8 meter slots, and again on the Function Test and Field Test
  topics.
- *They are not physically consistent.* With V = 232.1 (the one confirmed conversion) and PF = 0.95,
  three-phase power must be `3 x V x I x PF` — which gives **100.7 kW** if current is `data/10`, or
  **10.07 kW** if `data/100`. The payload's own `M1P` of 4995 reads as 4995 kW, 49.95 kW or 4995 W
  depending on scaling. **Nothing reconciles.** It was never a real reading.
- *Current, though, is pinned by the physics.* At `data/10` → 152.2 A the implied three-phase power
  is 100.7 kW, right for a 300–500 ton press; at `data/100` it is 10.07 kW, too low for the named
  machines. So current is `data/10` with reasonable confidence, and PF is `data/100`. Active power
  and energy remain genuinely unknown.
- *One more thing to confirm in the same breath:* `"M1PF":095` is not valid JSON — a leading zero on
  a number is illegal. Either the device quotes it or the sheet is loose with notation. The decoder
  will tolerate both, but it is worth knowing which.

**What settles all of it in one shot:** one real captured payload from a meter that is running, plus
that meter's own display reading at the same moment. The broker's address and credentials arrived on
2026-09-22 and `npm run capture -w @power-meter/ingester` is pointed at them; it has to be run from
somewhere whose network allows that host, which a Claude cloud session does not.

Steps 0–6 do not need it — fixtures are synthetic and the scale factors live in one constants table.
**Step 7 is gated on it**, because wrong scaling silently corrupts every row it writes and no
backfill recovers data that was never captured correctly. The gate is now enforced in two places
rather than written down: the service refuses to start (`assertSafeToStart`), and its Cloud Run
service is not deployed (`saijo-power-meter:deployIngester: "false"`). Answering the question is
one edit to `packages/infrastructure/src/mqtt/scaling.ts`, three secret versions and that flag.

## Explicitly not doing

Power quality / THD / phase balance, cost-per-kWh, efficiency scores, alerts UI, and the per-meter
"comprehensive" detail page. All of those exist in the old frontend; none appear in the customer
spec. If any are wanted, they are their own step with their own requirement.
