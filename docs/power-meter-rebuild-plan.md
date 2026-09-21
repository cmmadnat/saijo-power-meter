# Power Meter — rebuild plan (rough, for discussion)

Status: **draft for review.** Nothing here is committed to a design yet. Read the open questions at
the bottom first — three of them change the shape of steps 6–8.

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
Department + date/time range filters, table of Total Energy (kWh) and running hours (Hr:min).
Total energy = last kWh reading − first kWh reading in the window, **with counter-reset handling**.
Running hours = time above standby level. Both computed client-side over fixtures for now, in pure
functions that move to the backend unchanged in step 8.

*Verify:* hand-computed expected values on a small fixture match to the minute; a counter reset
inside the window does not produce a negative total; empty range and single-reading range both
behave.

**← At this point the customer can review the whole app and we have changed no infrastructure.**

### Step 6 — Pick the store, write the schema
Decision step, not much code. See the storage section below. Ships: migration tooling (versioned,
ordered, idempotent, per CLAUDE.md), schema, and a loader that replays fixture data into it.

*Verify:* migrations run twice with no diff on the second run; fixture load succeeds; the two
history queries (energy total, running hours) return the same numbers the step-5 pure functions do.

### Step 7 — MQTT ingester
**Gated on open questions 1 and 2 — do not go live before they are answered**, because wrong
scaling silently corrupts every row it writes and a backfill cannot fix what was never captured
correctly.

A small service that holds a subscription to the 9 station topics, decodes with the **step-2 decoder
shared verbatim**, buffers ~30–60 s, and writes raw **and a 1-minute rollup** in the same batch (the
rollup was step 10 in the first draft; at 60 msg/min it belongs here). Broker credentials from
Secret Manager — they are currently sitting in plaintext in the customer spreadsheet and should be
rotated before go-live. Handles reconnect, duplicate delivery, and a broker that goes away for an
hour.

First hour of live data also answers the `M<n>E` question: watch whether the counter only climbs.

*Verify:* runs against a local broker replaying payloads at 60/min; kill the broker mid-run and
confirm reconnect with no data loss beyond the documented window; 24 h soak with flat memory; rollup
totals reconcile against raw for the same window; cost per day of writes measured, not estimated.

### Step 8 — Wire the UI to real data
Replace fixture calls with API routes / server components. The step-5 aggregation functions move
server-side unchanged. Fixtures stay as the test fixtures.

*Verify:* every screen matches its step 3–5 behaviour against real stored data; p95 page load
measured; the four screens are the only thing that changed.

### Step 9 — Deploy
Cloud Run service + ingester in `infra/`, image build and push, secrets wired, `asia-southeast1`.
Preview on the PR, apply on merge — no credentials in-session, per CLAUDE.md.

*Verify:* `pulumi preview` comment is clean; post-merge the deployed app shows live meter data;
rollback path exercised once.

### Step 10 — Retention, hourly rollup, operations
The 1-minute rollup already landed in step 7. This adds the 1-hour rollup for long-range History,
the retention policy on raw data (open question 3), and an alert when a station stops publishing —
otherwise the customer notices bad data before we do.

*Verify:* history query cost and latency before/after the hourly rollup; retention actually deletes;
unplug a station in staging and confirm the alert fires.

---

## Where to put the data, and cheaply

Volume, now that the publish rate is known: **~60 messages/minute**. Each station payload carries 8
meter slots, ~45 of them live.

| Reading of "60/min" | Messages/day | Readings/day | Readings/year | Raw/year (~100 B each) |
| --- | --- | --- | --- | --- |
| 60/min **total** across 9 stations | 86 k | ~690 k | ~250 M | ~25 GB |
| 60/min **per station** (540/min total) | 778 k | ~6.2 M | ~2.3 B | ~225 GB |

*(Which of these it is, is open question 7 below — but the recommendation holds either way, which is
why it is not blocking.)*

A meter reading is append-only, never updated, and always queried by (meter, time range). That is a
time-series shape, and at this rate the hot/cold split stops being a nicety:

**Recommended: hot latest-state + cold history.**

- **Hot** — one row per meter holding the newest reading, overwritten each tick. 45 rows, forever.
  Screen 1 is a single cheap read, and it stays fast no matter how fast the meters publish.
- **Cold** — append-only history for screens 2–4. **BigQuery**, day-partitioned and meter-clustered:
  $0.02/GB/month storage, ~$0.025/GB ingest via the Storage Write API, 1 TB of query free monthly.
  Even at the high end of the table that is **single-digit dollars a month**, and it does not care
  which row of the table turns out to be true.

The rate changes the *alternatives* more than it changes the recommendation:

- **Firestore** (what the old app assumed) is now clearly wrong. 690 k writes/day is ~21 M
  writes/month ≈ **$19/month in writes alone** at the low end, ~$170/month at the high end, before
  a single chart is drawn — and charts bill per document read on exactly the query this app runs all
  day.
- **Postgres** (Cloud SQL or Supabase) needs real partitioning at 250 M rows/year and outgrows
  Supabase's free tier immediately. Viable, but it is now a tuning exercise rather than the simple
  option it would have been at 1/min.

**Two things follow directly from the rate:**

1. **Roll up in the ingester, not later.** Write raw *and* a 1-minute aggregate in the same batch.
   Charts and History read the rollup and never touch raw. This was step 10 in the first draft; at
   60/min it belongs in step 7.
2. **Raw data gets a short retention** (30 days, say) while rollups are kept forever. Rollups are
   ~1/60th the volume, so "keep history for three years" costs almost nothing if raw is not what is
   being kept. This is open question 3.

### Monitor continuously, or cron?

**Settled by the rate: continuous.** MQTT is push-only so cron cannot poll it, and the one trick
that makes cron work — a persistent session (`cleanSession=false`, QoS 1) letting HiveMQ queue
messages while disconnected, drained by a scheduled job — needs the queue to outlast the gap. HiveMQ
Cloud's free-plan queue is 1000 messages per client; at 60/min that **overflows in under 17 minutes**,
and silently. It was marginal at 1/min. At this rate it is not an option.

So: **an always-on subscriber** — a Cloud Run service with `min-instances=1` and CPU always
allocated, holding the connection. Roughly **$6–13/month** for the smallest size. That is the
cheapest correct answer, and the gap to the "cheaper" broken one is a few dollars.

Worth one sentence: if the factory side can be changed, having the gateway POST to an HTTPS endpoint
instead of publishing MQTT removes the always-on cost entirely (Cloud Run scales to zero between
requests). That is a customer conversation, not a technical blocker.

## Answered since the first draft

**Publish rate: ~60 messages/minute.** 10–40x the 1/min the first draft assumed. This kills the
cron-drain option outright (see below), makes raw-data retention a real cost decision rather than a
footnote, and moves rollups from step 10 into the ingester itself.

**Voltage scaling is confirmed: `data / 10`.** The `Sample data` tab documents `FT01VL1 2325` →
`232.5 V`. That is the only field in the entire workbook with a documented power-meter conversion.

**Cumulative-vs-interval for `M<n>E` will be settled empirically** in step 7 by watching live data
for an hour: a counter that only ever climbs is cumulative. Until then the decoder treats it as
cumulative and flags any decrease, so the ambiguity surfaces as data rather than as a silent wrong
number in History.

## Still open

**1. Current, active power, PF and energy scaling.** I went through all four tabs of the workbook
looking for these and they are not documented. What is there cannot settle it, for two reasons:

- *The sample payloads are filler.* `"M1VL1":2321,"M1CL1":1522,"M1P":4995,"M1PF":095` appears
  byte-identical on every topic and every one of the 8 meter slots, and again on the Function Test
  and Field Test topics. It is placeholder text, not a capture.
- *They are not physically consistent.* Taking V = 232.1 (the one confirmed conversion) and
  PF = 0.95, three-phase power must be `3 x V x I x PF`. That gives **100.7 kW** if current is
  `data/10`, or **10.07 kW** if it is `data/100`. The payload's own `M1P` is 4995 — which reads as
  4995 kW, 49.95 kW, or 4995 W depending on scaling. **No combination reconciles.** So the sample
  cannot be reverse-engineered into a scaling rule; it was never a real reading.

**2. Is active power in kW or W?** The `MQTT Protocol` tab's power-meter header row says **kW**. The
`Sample data` tab labels the equivalent field `FT01PL1` as **W**. These contradict each other, and
with a 300–500 ton press on the other end the difference between 4995 W and 4995 kW is not something
to guess at.

Both are one question to the customer: *send one real captured payload from a meter that is running,
with the meter's actual instantaneous reading from its own display.* That single datapoint settles
scaling and units for every field at once. Everything through step 5 can be built without it — the
decoder is one tested function and the fixtures are synthetic — but step 7 must not go live until it
is answered, because wrong scaling silently corrupts every stored reading.

**3. Raw retention.** Now a cost question rather than a detail — see the sizing below. How far back
must History go at full resolution, versus at 1-minute or 1-hour rollup?

**4. Scope.** This plan is Power Meter only. The other four modules in `reference doc/` (Function
Test, Calorie Meter, EMC, Field & Reliability) are a much larger piece of work.

**5. Auth.** The old app had none ("admin UI without login per PRD"). Same here, or real accounts?

**6. Timezone.** Asia/Bangkok for day boundaries and the History picker, presumably — worth stating
once rather than discovering it in a rollup bug.

**7. Is 60/min the total across all 9 stations, or 60/min from each?** A 9x difference in volume.
Not blocking — BigQuery absorbs either — but it decides raw retention and rollup granularity in
step 10.

## Explicitly not doing

Power quality / THD / phase balance, cost-per-kWh, efficiency scores, alerts UI, and the per-meter
"comprehensive" detail page. All of those exist in the old frontend; none appear in the customer
spec. If any are wanted, they are their own step with their own requirement.
