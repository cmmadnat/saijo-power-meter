# Power Meter — rebuild plan (rough, for discussion)

Status: **agreed in outline.** Rate, retention, scope, auth and timezone are settled (see Answered).
One blocker remains before step 7 can go live, and it needs an answer from the customer: see Still open.

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

**← At this point the customer can review the whole app and we have changed no infrastructure.**

### Step 6 — Schema and migrations
The store is decided (BigQuery, day-partitioned, 14-day partition expiry — see the storage section).
Ships: migration tooling (versioned, ordered, idempotent, per CLAUDE.md), the raw and 1-minute-rollup
schemas, the 55-row `latest` table, and a loader that replays step-2 fixtures into it.

*Verify:* migrations run twice with no diff on the second run; fixture load succeeds; the two history
queries (energy total, running hours) return **the same numbers the step-5 pure functions do** — that
equivalence is the whole point of having written them as pure functions first; partition expiry is
set, not assumed.

### Step 7 — MQTT ingester
**Gated on open questions 1 and 2 — do not go live before they are answered**, because wrong
scaling silently corrupts every row it writes and a backfill cannot fix what was never captured
correctly.

A single always-on service that holds a subscription to the 9 station topics, decodes with the
**step-2 decoder shared verbatim**, buffers ~30–60 s, and writes raw **and a 1-minute rollup** in the
same batch. It also holds the latest reading for all 55 commissioned meters **in memory** and
serves them over
HTTP — that is the realtime screen's data source, and it is what keeps the hot path free.

**It must be a singleton: `min-instances=1, max-instances=1`.** Two instances means two subscriptions,
every reading stored twice, and every energy total wrong. Fixed MQTT client ID so the broker evicts
the stale connection across a deploy.

Broker credentials from Secret Manager — they are currently plaintext in the customer spreadsheet and
should be rotated before go-live. Handles reconnect, duplicate delivery, and a broker that goes away
for an hour.

First hour of live data also answers the `M<n>E` question: watch whether the counter only climbs.

*Verify:* runs against a local broker replaying payloads at 60/min; kill the broker mid-run and
confirm reconnect with no data loss beyond the documented window; **force a second instance and
confirm it refuses to start or the broker evicts one** — duplicate ingestion must be impossible, not
merely unlikely; restart and confirm the in-memory hot state rehydrates from the `latest` table; 24 h
soak with flat memory; rollup totals reconcile against raw; cost per day measured, not estimated.

### Step 8 — Wire the UI to real data
Replace fixture calls with API routes / server components. The step-5 aggregation functions move
server-side unchanged. Fixtures stay as the test fixtures.

*Verify:* every screen matches its step 3–5 behaviour against real stored data; p95 page load
measured; the four screens are the only thing that changed.

### Step 9 — Passcode gate
A single shared passcode, checked server-side against Secret Manager, httpOnly + secure session
cookie, every route and API behind it. No user accounts. Rate-limit the attempt endpoint.

*Verify:* every route and API path 302s or 401s when unauthenticated (enumerate them, don't spot
check); the passcode never reaches the client bundle or a log line; rotating it invalidates existing
sessions; cookie flags correct over HTTPS.

### Step 10 — Deploy — *pulled forward, awaiting merge*
Cloud Run web service + the singleton ingester in `infra/`, image build and push, Secret Manager
wiring (broker credentials, passcode), `asia-southeast1`.
Preview on the PR, apply on merge — no credentials in-session, per CLAUDE.md.

*Verify:* `pulumi preview` comment is clean; post-merge the deployed app shows live meter data;
rollback path exercised once.

### Step 11 — Operations
The 1-minute rollup landed in step 7 and retention is a partition-expiry setting from step 6, so the
hourly rollup this step used to carry is **no longer needed** — 14 days is not a long enough range to
justify it. What remains: an alert when a station stops publishing, and one when the ingester's
subscription drops. Otherwise the customer notices bad data before we do.

*Verify:* unplug a station in staging and confirm the alert fires within a defined window; confirm
14-day-old partitions are actually gone; confirm a killed ingester pages someone.

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
- **`M<n>E` cumulative-vs-interval:** settled empirically in step 7's first hour of live data.

## Still open

**The one blocker left, and it is a customer question, not a technical one:** the scaling divisors
for current, active power, PF and energy.

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
that meter's own display reading at the same moment.

Steps 0–6 do not need it — fixtures are synthetic and the scale factors live in one constants table.
**Step 7 is gated on it**, because wrong scaling silently corrupts every row it writes and no
backfill recovers data that was never captured correctly.

## Explicitly not doing

Power quality / THD / phase balance, cost-per-kWh, efficiency scores, alerts UI, and the per-meter
"comprehensive" detail page. All of those exist in the old frontend; none appear in the customer
spec. If any are wanted, they are their own step with their own requirement.
