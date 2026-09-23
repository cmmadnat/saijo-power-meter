# Data modes: live and demo

The web app runs in one of two modes, chosen by one environment variable, and both are shipped
features. Written at step 8 and 8b of `docs/power-meter-rebuild-plan.md`, which is where the screens
stopped being fixture-only.

| | |
| --- | --- |
| `apps/web/lib/data-mode.ts` | Reads `DATA_MODE`, runs the gate, loads one adapter set. The only reader of the variable. |
| `apps/web/lib/data-source.ts` | The `DataSource` interface: the ports each screen needs, asked for by window. |
| `apps/web/lib/demo-adapters.ts` | Demo: the fixture generator. Loaded only in demo mode. |
| `apps/web/lib/live-adapters.ts` | Live: the ingester's `/latest`, the warehouse's rollup and raw readings. |
| `apps/web/lib/{realtime,series,history}-source.ts` | Parse the URL, ask for a port, call a use case. Mode-blind. |
| `apps/web/instrumentation.ts`, `lib/boot-check.ts` | Runs the gate at boot and exits non-zero if it refuses. |
| `apps/web/app/error.tsx` | What a screen shows when its source did not answer; retries every 10 s. |
| `packages/infrastructure/src/hot-state/` | The `/latest` wire shape (shared with the ingester) and its HTTP client. |
| `packages/infrastructure/src/warehouse/cache.ts` | A rollup read remembered until the minute turns. |
| `packages/infrastructure/src/fixtures/index.ts` | `@power-meter/infrastructure/fixtures`, the only way in to anything synthetic. |

## The switch

`DATA_MODE` is `live` or `demo`. **Unset or empty is `demo`**, so a deployment that forgot to say
degrades to numbers that are visibly fake rather than to a blank screen. **Anything else is refused
at boot** — `Live`, `prod`, a typo. That is a decision beyond the plan's wording: "misconfigured
degrades to demo" was written about the variable being absent, and a *wrong* value is a different
failure, one worth a crash loop rather than a quietly badged demo on the factory wall.

It is read once, in `data-mode.ts`. The three source files call `dataSource()` and hand whatever
ports come back to `realtimeTable`, `meterSeries`, `historyTable` and `fleetTrend`. They do not
learn which mode produced them — the only mode-aware things above `lib/` are the badge in the
shell and the one-line provenance under each page header, and both print a string they are given.
There is no per-source override: a half-live app whose table is real and whose History is synthetic
is a bug generator, and with one switch it cannot be configured.

The ports come back window-shaped (`DataSource.series(…)` returns a range *and* a repository)
because the two modes disagree about windows in ways that belong to them. Demo generates readings
per request and samples a long window coarsely, which obliges it to widen History's gap cap. Live
reads stored minutes, which obliges it to start a chart's window on a whole minute.

## The gate

`DATA_MODE=live` refuses to boot while `unconfirmedScales()` is non-empty, with both field names in
the message. `instrumentation.ts` runs it before the server takes a request and `process.exit(1)`s,
so a Cloud Run revision configured that way fails its startup probe and never serves. Observed on
the production build:

```
$ DATA_MODE=live INGESTER_URL=https://… node server.js
Refusing to start in DATA_MODE=live: the scale factors for activePower, energy are still assumed, not confirmed.
…
exit: 1
```

The exemption is the ingester's, applied to the other end of the same wire: an ingester on
**loopback** *and* `WAREHOUSE=file`. That is the replay harness — live code over fixture numbers —
and it is badged *Local replay* for the same reason demo is badged. Both halves are required; a
loopback ingester in front of BigQuery is refused, because the warehouse is what would put a real,
wrongly-scaled number on screen. It is the same exemption rather than a new one, and
`isLoopbackUrl` in `packages/infrastructure/src/net.ts` is now the single definition both gates use.

`infra/index.ts` adds a second lock: `saijo-power-meter:dataMode` is `"demo"`, and the program throws
if it is `"live"` while `deployIngester` is false. Flip both in the change that confirms the
divisors.

## The badge

Demo carries *Demo data* and the harness carries *Local replay*, each twice: in the shell header,
and pinned to the bottom-right of the viewport, so a screenshot cropped to a chart or scrolled to
the bottom of the table still has it. It is inverted ink on a hatched edge rather than a colour,
because every hue on these screens already means something — lime is the brand fill, the status
colours are freshness, the series colours are meters — and a badge borrowing one would be read as
one of those. Live carries none. Checked against the running server on `/`, `/history` and a 404,
in both modes, and in a real browser against a throwaway build with the two divisors marked
confirmed — the only way to render true live mode today: no badge on any of the three.

**The layout reads the mode per request, and has to.** The 404 page was prerendered at build time,
where `DATA_MODE` is unset, so that throwaway live build printed *Demo data* on every not-found
page. `await connection()` in the root layout makes every route request-time; there is nothing
static here worth prerendering.

## When the data source does not answer

Demo cannot fail; live can — the ingester unreachable, a warehouse query refused. `app/error.tsx`
replaces the screen, inside the shell, with a line saying nothing on it would be current, and
retries every ten seconds, the table's own rhythm, because the real-time route is a wall display
and nobody is standing at it to press reload. Observed on the harness: the ingester stopped, the
error screen up at the next refresh; the ingester restarted, the screen back ten seconds later
with no reload.

## Which table each screen reads

| Screen | Live source | Why |
| --- | --- | --- |
| Real time table | ingester `GET /latest`, ID token | Free per read; the only thing as fresh as a 10 s refresh. |
| kW and kWh charts | `readings_1m` | A 24 h chart is 1 440 rows a meter against ~9 600 raw. |
| Fleet strip tiles | `readings_1m` | Same; behind the 10 s refresh, so cost matters most here. |
| History | `readings` (raw) | Running hours are read off the gaps between real readings. |

**The charts moved to the rollup, and it is a change of table, not of arithmetic.** `meterSeries`
now takes either port. A stored minute is a closed bucket — a count, a mean, a last counter — and
`addRollupToBucket` folds it in exactly: power sum is mean × count, counts add, the later minute's
counter wins. A chart bucket is always a whole number of minutes, so on a minute-aligned window
every stored minute lands in exactly one of them. Two tests hold that: in `packages/application`,
three hours of uneven readings with a gap and a counter reset draw the same chart from raw and from
`rollupReadings` of the same readings; in `packages/infrastructure`, the same through the warehouse
adapter and the JSON round trip.

**The cost of the rollup is a lagging right-hand edge.** The ingester writes only closed minutes and
flushes every ~45 s, so the last one or two minutes of a chart are empty until they land. The table
above the charts is live to the second, so nothing on the page claims otherwise.

**History stays on raw, and its gap cap is back at three minutes.** Demo still widens it to twice its
sampling interval, because demo samples a week coarsely; live reads real readings on the real
schedule, so it passes no cap and gets `DEFAULT_MAX_RUN_GAP_MS`.

**History reads in batches now, not one query per meter.** Step 6 chose per-meter queries so no
single `ORDER BY` would sort a fortnight of the fleet. On a short window that costs twice: every
query bills at least 10 MB, and at this table's size clustering on `meter_id` need not prune
anything, so each of 55 queries can scan the day's partitions. `metersPerQuery` batches meters under
a 750 000-row budget: today is one query; a fortnight is eleven, each sorting at most ~670 000 rows.
Batches stream in meter order and are never buffered.

## The strip's two windowed tiles

Step 5b left out *energy since the shift started* and *a sparkline of the last hour* because both
need a window. They are `fleetTrend` in `packages/application/src/trend.ts`, built from two
`meterSeries` calls and a sum across meters — the reset walk, the bucket rules and the gap rule are
the charts' own, so the strip cannot disagree with a chart of the same meters.

- **"The shift" is the day, from 00:00 Bangkok.** The specification defines no shifts, and 00:00 is
  where History's default window opens, so the tile answers the same question as History's default
  footer. **It does not give the same number, and should not:** the tile reads the rollup, which
  ends at the last closed minute, and History reads raw readings up to now. Over the replay the tile
  read 475 kWh against History's 485.7 — the 2% is about 25 seconds of the fleet's ~1 545 kW, made
  of the tail not yet rolled up and, because the replay began mid-day with no minute before
  midnight to take a baseline from, the first minute each meter reported in. On a real day the
  second part vanishes; the first is why the tile says "to the last closed minute".
- **Energy is read from the minute before midnight.** The walk measures from the first bucket's last
  counter; starting at 00:00 would take the baseline at 00:00:59 and drop a minute.
- **The load line is a point a minute**, the sum of the meters that reported in it, with a silent
  minute a break rather than a zero. It sits under "total load now" instead of in a tile of its own.

### What it costs behind a ten-second refresh

The route re-renders every 10 s per open screen (`router.refresh()` in the table component), and
every render asks for the strip's two windows and the charts' window. BigQuery's on-demand pricing
bills the bytes a query processes, **rounded up to the MB with a 10 MB minimum per query** — and
these queries read far less than 10 MB: a whole UTC day of `readings_1m` is 79 200 rows of about 39
bytes, ~3 MB, and "today" in Bangkok spans two UTC partitions. So every one of them bills the floor,
and the count of queries is the whole cost.

| | queries / min | billed / month |
| --- | --- | --- |
| Uncached, one open screen | 18 (3 per render × 6 renders) | ~7.4 TiB **per screen** |
| Cached per minute, strip windows separate | 3 per instance | ~1.2 TiB per instance |
| **Shipped:** cached, strip windows share one read | **2 per instance** | **~0.82 TiB per instance** |

"Per instance" is independent of how many screens are open; Cloud Run scaling out multiplies it by
the instance count and nothing worse. 0.82 TiB sits inside BigQuery's 1 TiB monthly free tier for one
warm instance and costs single-digit dollars past it. The query count is asserted, not estimated:
`sources.test.ts` renders the route six times against a counting client and requires two queries
for the minute.

**Measured against BigQuery, 2026-09-23.** `npm run warehouse -w @power-meter/infrastructure --
cost --runs 20`, run from Cloud Shell against `saijo-power-meter`, dry-runs the exact SQL the
adapters issue, then times each read 20 times through the same adapters and use cases the web app
runs. It was also the first time BigQuery parsed the step-8 SQL — `IN UNNEST(@meterIds)` and the
meter-major `ORDER BY` on raw — and all three statements ran.

| Read (cache miss) | Processes | Bills | p50 / p95, run 1 | p50 / p95, run 2 |
| --- | --- | --- | --- | --- |
| Strip — 55 meters since 00:00 | 0.23 MB | 10 MB | 949 / 1 281 ms | 571 / 1 568 ms |
| Chart — 4 meters, 24 h | 0.23 MB | 10 MB | 308 / 720 ms | 297 / 340 ms |
| History — 55 meters, raw, today | 3.46 MB, 1 query | 10 MB | 258 / 545 ms | 256 / 442 ms |

It confirms the cost table: 20 MB a minute per warm instance, 0.82 TiB a month. Its uncached figure
is 4.94 TiB a month per open screen, lower than the 7.4 above because it assumes the strip's two
windows already share one read — two queries a render rather than three.

**Two limits on those numbers.** The tables still hold only step 6's two hours of fixture rows. A
full real day of `readings_1m` is ~3 MB, so the strip and the charts stay on the 10 MB floor; a
full day of raw `readings` is tens of MB, so History on a real day bills above the floor — still one
query. And the latencies are per cache miss: the strip's 1.3–1.6 s p95 is paid once a minute per
instance, not on every ten-second refresh.

## No fixture on the live path, checked like the dependency rule

`@power-meter/infrastructure` no longer exports anything synthetic. The generator, the fixture
ports and the warehouse loader are at `@power-meter/infrastructure/fixtures`, a second declared
entry point. `scripts/check-boundaries.mjs` then walks the web app's import graph — every file under
`app/`, `components/` and `lib/` except tests, plus `instrumentation.ts`, following static and
dynamic imports through the workspace packages' entry points — and fails if any chain reaches the
fixture directory or the loader. Exactly one edge is exempt: `data-mode.ts` → `demo-adapters.ts`,
the dynamic import in the demo branch. Planting `import "@/lib/demo-adapters"` in the fleet strip
fails the build with the chain printed.

## The image

Live mode is the first thing in `apps/web` to construct a BigQuery client. Turbopack **bundles** the
SDK into the server chunks rather than tracing it in as `node_modules`: the standalone output went
from 58 MB to 59 MB and gained no package directories. A throwaway route constructing a client and
running `SELECT 1` inside the production build got as far as `Could not load the default
credentials` — the SDK loads and runs; only the credentials are missing, which is this session's
design. `apps/web/Dockerfile` now copies `packages/infrastructure/package.json` into the install
layer so the SDK is installed on purpose rather than by luck of hoisting.

**The first measurement was wrong, and the reason is a trap.** It read 60 MB, and the extra
megabyte was not the SDK: the replay's file store, now reachable from the web app, builds its paths
at runtime, and Next's tracer answered "Dynamic filesystem access causes tracing of the whole
project" by copying the web app's source, Dockerfile and README into the image. Every path in
`file-store.ts` now goes through one helper carrying `turbopackIgnore`, the build is warning-free,
and the standalone tree is `server.js`, `package.json` and `node_modules` again. Read the build's
warnings after adding anything that touches the filesystem.

## Page load

Sequential full-page GETs against the production build (`next start` standalone), three warm-ups
then sixty timed, on this session's container:

| Route | demo p50 / p95 | live (replay) p50 / p95 |
| --- | --- | --- |
| `/` (strip, charts 6 h, table) | 81 / 102 ms | 36 / 50 ms |
| `/?window=24h` | 81 / 106 ms | 34 / 42 ms |
| `/history` (today) | 116 / 145 ms | 62 / 74 ms |
| `/history`, 27 h window | 237 / 298 ms | 63 / 71 ms |

The live column is the replay harness after twenty minutes of replay: `/latest` from a real ingester
process over loopback, the charts, strip and History read from the files that ingester wrote. It is
faster than demo because twenty minutes of stored readings are less work than generating a day, and
the rollup read is cached. It proves the live code path end to end and says nothing about
BigQuery's latency, which `warehouse cost` is for.

## What is still unproven

- **The live screens have not rendered from BigQuery.** The SQL parses and the adapters' reads
  are measured (above), but only through the CLI; no web process has read the warehouse, and the
  data read was step 6's fixtures.
- **The ID token path has not run on Cloud Run.** `metadataIdToken` is tested against a stub
  metadata server; the ingester service it would call does not exist.
- **Live mode has not been deployed.** It cannot be until the divisors are confirmed, by design.
