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
decimal scaling lives, in one tested function. Plus a fixture generator producing plausible
multi-hour data for all ~45 meters from the sample payloads in the spreadsheet.

*Verify:* unit tests on the decoder, including the documented sample payload → expected engineering
values; fixtures cover an idle meter, a running meter, a meter that crosses the 0.1 kW standby
threshold, and an offline meter.

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
A small service that holds a subscription to the 9 station topics, decodes with the **step-2 decoder
shared verbatim**, buffers, and writes in batches. Broker credentials from Secret Manager — they are
currently sitting in plaintext in the customer spreadsheet and should be rotated before go-live.
Handles reconnect, duplicate delivery, and a broker that goes away for an hour.

*Verify:* runs against a local broker replaying the sample payloads; kill the broker mid-run and
confirm reconnect with no data loss beyond the documented window; 24 h soak with flat memory;
cost per day of writes measured, not estimated.

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

### Step 10 — Rollups, retention, operations
Pre-aggregated 1-minute and 1-hour rollups so charts never scan raw data; retention on raw; an
alert when a station stops publishing (the customer will notice bad data before we do otherwise).

*Verify:* history query cost and latency before/after rollups; retention actually deletes; unplug a
station in staging and confirm the alert fires.

---

## Where to put the data, and cheaply

Volume first, because it decides everything: ~45 live meters (72 slots), 9 payloads per publish
interval. At **one publish per minute** that is ~65 k readings/day, ~24 M/year — roughly 2–4 GB/year
raw. At one per second it is 60× that. **The publish interval is the single biggest unknown in this
plan** (open question 1).

A meter reading is append-only, never updated, and always queried by (meter, time range). That is a
time-series shape, and it argues for splitting hot from cold:

**Recommended: hot latest-state + cold history.**

- **Hot** — one row/document per meter holding the newest reading, overwritten each tick. 45 rows
  total, forever. Screen 1 is a single cheap read. Firestore is fine here (~45 writes/tick), and so
  is a single Postgres table.
- **Cold** — append-only history for screens 2–4. **BigQuery** is the cheap and effective option:
  $0.02/GB/month storage, Storage Write API ingestion around $0.025/GB, 1 TB of query free each
  month, and day-partitioned + meter-clustered tables mean a history query scans megabytes. At the
  volume above this is realistically **a few dollars a month**, and it does not care if the interval
  turns out to be 1 s instead of 1 min.

Two honest alternatives:

- **Postgres only** (Cloud SQL, or Supabase — you already have Supabase connected). Simpler: one
  store, one query language, real indexes, no streaming-buffer quirks. Cloud SQL's smallest instance
  is ~$10–25/month *always on*; Supabase's free/cheap tiers may cover this outright. Good if the
  interval is 1/min and stays there; gets expensive to keep fast if it is 1/s.
- **Firestore only** (what the old app assumed). Works, but time-range queries across 45 meters bill
  per document read on every chart load, and that is exactly the query this app does all day. It is
  the most expensive option at scale and the least suited to the aggregations in screen 4.

**Batch the writes either way.** Buffer 30–60 s in the ingester and write once per batch instead of
per message — it is the difference between a few dollars and a few tens of dollars a month.

### Monitor continuously, or cron?

**MQTT is push-only, so a cron job cannot poll it.** The two real options:

1. **Always-on subscriber** (recommended) — a Cloud Run service with `min-instances=1` and CPU
   always allocated, holding the connection. Roughly **$6–13/month** for the smallest size. Simple,
   no data loss, and the only option that works if messages arrive faster than once a minute.
2. **Cron-drain** — subscribe with a persistent session (`cleanSession=false`, QoS 1) so HiveMQ
   queues messages while you are disconnected, then have Cloud Scheduler wake a job every N minutes
   to drain the queue and exit. Genuinely cheaper (scales to zero). But HiveMQ Cloud caps the
   offline queue per client (1000 messages on the free plan), and 9 stations × 60 messages/minute
   overflows that in under two minutes — **silent data loss**. Only viable at a slow publish
   interval and a paid plan with a large queue.

So: **option 1 unless the publish interval turns out to be minutes, not seconds.** The delta is a
coffee a month and it removes a whole class of "why is there a hole in the chart" bugs.

A third option worth a sentence: if the factory side can be changed, having the gateway POST to an
HTTPS endpoint instead of publishing MQTT removes the always-on cost entirely (Cloud Run scales to
zero between requests). That is a customer conversation, not a technical blocker.

---

## Open questions — these change the plan

1. **What is the MQTT publish interval?** Drives storage choice, ingester shape, and cost. Nothing
   in the spreadsheet says.
2. **Exact scaling per field.** The sheet documents conversions for the Function Test / Field Test
   values but **not for the power meter ones**. `2321 → 232.1 V` and `095 → 0.95` are inferences from
   the sample; `"M1CL1":1522` could be 152.2 A or 15.22 A, and `"M1P":4995` could be 49.95 kW or
   499.5 kW. Needs one confirmation from the customer before step 2 is trustworthy.
3. **Is `M<n>E` a cumulative kWh counter?** Screen 4's "Total Energy over a window" only makes sense
   if it is, and resets/rollovers then need a documented rule.
4. **Retention.** How far back must History go — a year? three? It decides whether raw data is kept
   or only rollups.
5. **Scope: is this Power Meter only, or the whole Smart Factory app again?** This plan is Power
   Meter only. The other four modules in `reference doc/` are a much larger piece of work.
6. **Auth.** The old app had none ("admin UI without login per PRD"). Same here, or real accounts?
7. **Timezone.** Asia/Bangkok throughout for day boundaries and the History picker, presumably —
   worth stating once rather than discovering it in a rollup bug.

## Explicitly not doing

Power quality / THD / phase balance, cost-per-kWh, efficiency scores, alerts UI, and the per-meter
"comprehensive" detail page. All of those exist in the old frontend; none appear in the customer
spec. If any are wanted, they are their own step with their own requirement.
