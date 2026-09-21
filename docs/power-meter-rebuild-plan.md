# Power Meter — rebuild plan (rough, for discussion)

Status: **agreed in outline.** Rate, retention, scope, auth and timezone are settled (see Answered).
One blocker remains before step 7 can go live, and it needs an answer from the customer: see Still open.

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
keyed `M<n>VL1..3`, `M<n>CL1..3`, `M<n>P`, `M<n>PF`, `M<n>E`. ~45 of the 72 slots are populated and
named (press machines, laser cutters, coil lines, injection moulding, air pumps, MDB panels).
Values are integers with implied decimals (`"M1VL1":2321` → 232.1 V, `"M1PF":095` → 0.95). Station
and meter identity, department and machine name are **static config from the spreadsheet**, not
carried in the payload.

---

## The steps

Each step is one PR, small enough to review in a sitting, and ends in something you can look at.
UI first: steps 1–5 ship a complete, clickable app on fixture data before any backend exists.

### Step 0 — Freeze the spec into the repo
Turn the four PDF screens + the MQTT sheet into `docs/requirements/power-meter.md`, and the station/
meter/department/standby table into a committed `meters.json` (or `.ts`) seed — 9 stations, 72 slots,
the ~45 real ones named. This file is the single source of meter identity for the whole app.

*Verify:* the seed parses; every meter in the MQTT sheet appears exactly once; a reviewer who has
never seen the PDF can describe all four screens from the doc alone.

### Step 1 — Frontend scaffold
`create-next-app` + `npx shadcn@latest init https://tweakcn.com/r/themes/doom-64.json`, per
CLAUDE.md. Load Oxanium / Source Code Pro / Georgia via `next/font` or the theme falls back
silently. Light/dark toggle. App shell: nav with Real time / History, nothing else. No infra
changes in this PR.

*Verify:* `npm run build` and `npm run lint` clean; dark and light both render; `--radius: 0px` is
visible (square corners) and Oxanium is actually loading, not a system fallback.

### Step 2 — Domain model + fixtures
TypeScript types for a reading (meter id, timestamp, 3×V, 3×A, PF, kW, kWh), the meter registry
type, and a **decoder** that turns a raw station payload into readings — this is where the implied
decimal scaling lives, in one tested function with the scale factors as named constants in one
table, so the unanswered ones are a one-line change when the customer confirms them. Voltage is
`data / 10` (documented). Current, power, PF and energy are **assumptions until open question 1 is
answered** and must be marked as such in the code. The decoder also flags a decreasing energy
counter rather than silently accepting it. Plus a fixture generator producing plausible multi-hour
data for all ~45 meters.

*Verify:* unit tests on the decoder, including `2325 → 232.5 V` (the one documented conversion);
every assumed scale factor has a test asserting the assumption so it fails loudly when changed;
fixtures cover an idle meter, a running meter, a meter that crosses the 0.1 kW standby threshold, an
offline meter, and an energy-counter reset.

### Step 3 — Real time table (screen 1)
The table, reading fixtures. Sort, department filter, stale/offline indicator, the exact columns
from the PDF. Thai labels as the customer wrote them.

*Verify:* side-by-side against page 1 of the PDF — every column present, same order; 45 rows render
without layout break at 1080p and on a tablet; offline meter visibly distinct.

### Step 4 — Real time charts (screens 2 & 3)
kW-over-time and kWh-over-time, multi-meter selector, time-window control. One chart component,
two configurations.

*Verify:* matches PDF pages 2–3; 8 series × 24 h of fixture points stays responsive; legend
readable in both themes; energy series is monotonic (it is a cumulative counter, not a rate).

### Step 5 — History (screen 4)
Department + date/time range filters, table of Total Energy (kWh) and running hours (Hr:min). All
day boundaries and picker values in **Asia/Bangkok**; instants stored UTC, converted at the edges.
Total energy = last kWh reading − first kWh reading in the window, **with counter-reset handling**.
Running hours = time above standby level. Both computed client-side over fixtures for now, in pure
functions that move to the backend unchanged in step 8.

*Verify:* hand-computed expected values on a small fixture match to the minute; a counter reset
inside the window does not produce a negative total; empty range and single-reading range both
behave.

**← At this point the customer can review the whole app and we have changed no infrastructure.**

### Step 6 — Schema and migrations
The store is decided (BigQuery, day-partitioned, 14-day partition expiry — see the storage section).
Ships: migration tooling (versioned, ordered, idempotent, per CLAUDE.md), the raw and 1-minute-rollup
schemas, the 45-row `latest` table, and a loader that replays step-2 fixtures into it.

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
same batch. It also holds the latest reading for all 45 meters **in memory** and serves them over
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

### Step 10 — Deploy
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
writes alone** — more than the rest of the system combined, to serve 45 numbers that are obsolete a
second later. Cold storage of the same data in BigQuery is **~$0.07/month**. The intuition inverts:
keeping 14 days of history is nearly free, and it is the live view that costs money if built
carelessly.

So don't store the hot state at all:

- **Hot (screen 1, and the live end of screens 2–3)** — the ingester is already a persistent process
  holding the MQTT connection. It keeps the latest reading for 45 meters **in memory** and serves
  them over HTTP (or pushes via SSE). Cost: nothing. It also flushes those 45 rows to the database
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

**The one blocker left, and it is a customer question, not a technical one:** current, active power,
PF and energy scaling, plus whether active power is kW or W.

I went through all four tabs of the workbook for these. They are not documented, and what is there
cannot settle it:

- *The sample payloads are filler.* `"M1VL1":2321,"M1CL1":1522,"M1P":4995,"M1PF":095` appears
  byte-identical on every topic and all 8 meter slots, and again on the Function Test and Field Test
  topics.
- *They are not physically consistent.* With V = 232.1 (the one confirmed conversion) and PF = 0.95,
  three-phase power must be `3 x V x I x PF` — which gives **100.7 kW** if current is `data/10`, or
  **10.07 kW** if `data/100`. The payload's own `M1P` of 4995 reads as 4995 kW, 49.95 kW or 4995 W
  depending on scaling. **Nothing reconciles.** It was never a real reading.
- *The workbook contradicts itself on units.* The `MQTT Protocol` tab's power-meter header says
  **kW**; the `Sample data` tab labels the equivalent field **W**. With 300–500 ton presses on the
  other end, 4995 W versus 4995 kW is not a guess worth making.

**What settles all of it in one shot:** one real captured payload from a meter that is running, plus
that meter's own display reading at the same moment.

Steps 0–6 do not need it — fixtures are synthetic and the scale factors live in one constants table.
**Step 7 is gated on it**, because wrong scaling silently corrupts every row it writes and no
backfill recovers data that was never captured correctly.

## Explicitly not doing

Power quality / THD / phase balance, cost-per-kWh, efficiency scores, alerts UI, and the per-meter
"comprehensive" detail page. All of those exist in the old frontend; none appear in the customer
spec. If any are wanted, they are their own step with their own requirement.
