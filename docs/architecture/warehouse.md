# The warehouse

Two tables in one BigQuery dataset, and a migration runner that puts them there.
Written at step 6 of `docs/power-meter-rebuild-plan.md`. Step 7 added the write side — the
`ReadingWriter` port and the ingester behind it — and wired `migrate` into the delivery pipeline.
Step 8 added the read side the screens use: the web app's live mode reads `readings_1m` for the
charts and the fleet strip and `readings` for History — see `docs/architecture/data-modes.md`.
Step 8c took the third table away and changed how the other two are written: `latest` is a
Firestore document now, and the ingester appends through the Storage Write API rather than through
load jobs. *Why* is [the daily limit](#the-limit-that-moved-the-write-path), below, and it is the
one thing on this page to read before touching the write path again.

## What is where

| | |
| --- | --- |
| `infra/index.ts` | The **dataset** — a Google Cloud resource, declared with the rest. |
| `packages/infrastructure/src/warehouse/migrations.ts` | The **tables** — schema, not infrastructure. |
| `packages/infrastructure/src/warehouse/runner.ts` | Applying them, and reading back what was applied. |
| `packages/infrastructure/src/warehouse/repository.ts` | The three read ports, backed by the tables. |
| `packages/infrastructure/src/warehouse/cache.ts` | A rollup read remembered until the minute turns. |
| `packages/infrastructure/src/warehouse/cost.ts` | `warehouse cost`: what the screens' reads process, bill and take. |
| `packages/infrastructure/src/warehouse/writer.ts` | The write port: raw and rollup in one batch, restart state delegated. |
| `packages/infrastructure/src/warehouse/stream.ts` | The Storage Write API default stream. How the ingester appends. |
| `packages/infrastructure/src/firestore/latest-store.ts` | The restart state: one document, all 55 meters. |
| `packages/infrastructure/src/warehouse/loader.ts` | Replaying the step-2 fixtures, and the equivalence check. |
| `packages/infrastructure/src/warehouse/soak.ts` | `warehouse soak`: the write path against a scratch dataset, past the old cap. |
| `packages/infrastructure/src/warehouse/cli.ts` | `migrate`, `load`, `verify`, `settings`, `reset`, `cost`, `soak`. |

The dataset/table line is the same one `bootstrap.sh` draws for the Pulumi state bucket: a
container that has to exist before anything else can run is infrastructure; what goes inside it is
the application's own shape, versioned with the code that reads it.

## The two tables

**`readings`** — every reading in engineering units, partitioned by `DATE(at)`, clustered by
`meter_id`, `partition_expiration_days = 14`, `require_partition_filter = TRUE`.

~691 k rows a day, ~9.7 M in the window, about a gigabyte that never grows. Retention is the
partition expiry and nothing else: there is no cleanup job to fail silently. The partition filter is
required because a query that forgets it scans fourteen days to answer a question about one
afternoon, and the cost of finding that out in a bill is higher than the cost of a rejected query.

**`readings_1m`** — the 1-minute rollup, same partitioning and expiry.

Written in the same batch as raw, by `rollupReadings()` in `packages/application/src/series.ts`
rather than by a SQL `GROUP BY`. That matters: the charts bucket readings with the same three rules
— mean power, last counter, count the readings — and a second definition of "a minute" in SQL would
be free to drift from the one the chart draws. `rollupReadings` and `meterSeries` now share their
bucket primitives, and a test asserts that a rollup at the chart's bucket width reproduces exactly
what the chart plots.

**Rollup buckets are aligned to absolute time, not to a window's start.** The charts align to
whatever `from` they were handed, which is right for a plot and wrong for a stored row: the rollup
is written by an ingester that has no window. Flooring to the epoch is what makes a row's identity
`(meter, minute)`.

A minute a meter said nothing in produces no row. Storing a zero would turn "we did not hear from
this machine" into "this machine drew no power" — the distinction the charts draw as a gap.

**`latest`** — gone at step 8c. Migration `0002` drops it.

It held 55 rows, one per commissioned meter, so that a restarting ingester did not begin blind. It
was never the real-time screen's data source — the ingester holds that in memory and serves it —
and rewriting 55 rows every 30 s turned out to be the one thing in this design that could not be
done in BigQuery at all. The restart state is one Firestore document now; see *The limit that moved
the write path* below and `docs/architecture/ingester.md`.

Nothing reads it in the meantime, so the drop is forward-only: the pipeline's `migrate` step
applies `0002` whenever it next runs, and the ingester was never deployed against the old shape.

## Migrations

Versioned, ordered, idempotent, which each mean something specific:

- **Versioned.** Four digits, and a SHA-256 of the migration's own statements recorded beside it.
  An applied migration may never be edited: the runner compares checksums and stops. It also stops
  when the dataset carries a version the code does not know, which is the same mistake seen from the
  other side — the database is ahead of the checkout, and migrating *back* is not the cure.
- **Ordered.** Contiguous from `0001`, applied ascending. `validate()` fails on a gap or a
  duplicate, which is what two branches each adding "the next" migration produces.
- **Idempotent.** Every statement is `CREATE ... IF NOT EXISTS` or `DROP ... IF EXISTS`. BigQuery
  has no transaction spanning DDL, so there is no way to make the statements and the row recording
  them atomic. A run that dies between the two re-applies that migration on the next run, every
  statement no-ops, and the record is written. Idempotence is what makes that a non-event rather
  than a recovery.
- **Forward-only.** `0002` drops a table `0001` creates, and on a fresh dataset both run in order:
  the table exists for the length of one statement. Editing `0001` instead would change its
  checksum and stop the runner dead on the one project that has already applied it.

The checksum covers the template text, with `{{dataset}}` unsubstituted, so applying the same
migration to a second project is the same migration.

## Reading it back

`WarehouseReadingRepository` implements the same `ReadingRepository` port the fixtures do, so the
History and chart aggregations move server-side at step 8 by being handed a different object.

**There is deliberately no SQL that sums energy or running hours.** The counter-reset walk
(`consumptionFrom`) and the three-minute gap cap live in `packages/application` and have one
implementation. A SQL copy would be free to disagree with it in exactly the cases nobody checks —
and the plan's own verification item, "the history queries return the same numbers the pure
functions do", is answered better by there being nothing to compare.

What is checked instead is the adapter. `verifyAgainstFixtures` runs `historyTable` twice over the
same window — once against the fixtures in memory, once against what the warehouse gave back — and
requires every row to agree. A mismatch means the round trip lost something: a timestamp that came
back at second resolution, a float that went through a string, readings that arrived out of order
and turned a counter rise into a reset. The unit tests run that comparison against a fake client
that stores rows as JSON the way a load job does; `warehouse verify` runs it against a real project.

**History reads in batches of meters; the charts read the rollup.** Step 6 read raw one query per
meter, because a single `ORDER BY meter_id, reading_at` over a fortnight of 55 meters is ~9.7 M rows
through one sort, which BigQuery refuses. Step 8 found the other side of that trade: every query
bills at least 10 MB, and at this table's size clustering on `meter_id` need not prune anything, so
each of the 55 could scan the whole day. `metersPerQuery` now batches meters under a 750 000-row
budget — one query for a day, eleven for a fortnight — and each batch streams in meter order.

`WarehouseRollupRepository` implements the `RollupRepository` port over `readings_1m`, one query
for every meter asked for, and the charts and the fleet strip read it. That is a change of table,
not of arithmetic: `meterSeries` folds a stored minute into its buckets by the same three rules it
folds a reading by, and a test draws the same chart both ways through this adapter. History stays
on raw, because running hours are read off the gaps between actual readings and a
minute-resolution source would quietly round them.

**`warehouse cost` is how the price of those reads is measured.** It dry-runs the exact SQL the
adapters issue — the strip, a 24-hour chart, today's History — prints the bytes each processes and
what that bills, and times each through the adapters and use cases the web app runs. First run
2026-09-23: all three statements parsed; each billed the 10 MB floor over step 6's fixture rows;
p95 1 281 ms for the strip, 720 ms for a 24-hour chart, 545 ms for today's History in one query.
The figures are in `docs/architecture/data-modes.md`.

## Writing, from the ingester

`WarehouseReadingWriter` implements the `ReadingWriter` port. The port is one interface and the
implementation is two stores: raw and rollup go to BigQuery through the Storage Write API, and the
restart state goes to one Firestore document. Three things about it are rules rather than choices:

- **Raw and rollup go in one call.** They are one flush of one buffer, and writing them separately
  would let a crash between the two leave a minute present in `readings` and absent from
  `readings_1m` — which no reader is built to notice, because the chart would fall back to raw and
  agree while the rollup under-reported that minute forever. They are two `AppendRows` requests,
  issued together and awaited together, because the API has no way to make them one; a failure of
  either fails the flush, and the ingester retries the whole batch.
- **An empty `replaceLatest` writes nothing.** Overwriting the restart state with no readings would
  empty the one document a restarting ingester reads, so a broker outage at the moment the timer
  fires would cost the next restart its rehydration as well.
- **Timestamps cross as `Date`s, not strings.** A load job is fed newline-delimited JSON, where a
  TIMESTAMP is an ISO string. The Storage Write API encodes each row into protobuf against the
  table's schema, where a TIMESTAMP is an int64 of microseconds — which the JSON writer produces
  from a `Date` and not from a string. `readingToStreamRow` and `bucketToStreamRow` are
  `readingToRow` and `bucketToRow` with exactly that swapped, and a test asserts they differ in
  nothing else.

Which minutes are eligible to be rolled up at all is the ingester's rule, not this layer's — only
closed ones, see `docs/architecture/ingester.md`.

**At-least-once, not exactly-once.** The default stream can land rows twice if a request fails
after BigQuery accepted it and the ingester retries the batch. That was true of the load-job path
as well, so it is not a regression — and exactly-once needs a committed stream with offsets, which
is a larger change than step 8c wanted to make. What it means in practice: a raw row can appear
twice, and so can a `(meter, minute)` rollup row, which is the one duplicate a reader would notice.
It has never been observed, and the plan carries it as a known property rather than a fixed one.

## The limit that moved the write path

**Load jobs are capped per table per day, and the ingester's writes are a daily rate.** That is the
whole of step 8c. The figures, from the BigQuery quotas page on 2026-09-23:

| Quota | Default | Applies to |
| --- | --- | --- |
| Load jobs per table per day | **1 500 jobs** | Counts toward the destination table's operations limit; failed jobs included. |
| Table modifications per day | **1 500 modifications** | A **standard** table. Load, copy and query jobs that append or overwrite. **Cannot be raised.** |
| Partition modifications per column-partitioned table per day | **30 000 modifications** | A table partitioned on a column — which `readings` and `readings_1m` are. |
| Partition modifications during ingestion-time per partitioned table per day | **11 000 modifications** | Ingestion-time partitioning, which nothing here uses. |

DML statements and **streaming are excluded from all of them**, which is the sentence the whole fix
rests on.

Against the ingester's rates — a 45 s flush writing both tables, a 30 s mirror of `latest`:

| Table | Written every | Jobs / day | Limit that applied | Verdict |
| --- | --- | --- | --- | --- |
| `latest` | 30 s | 2 880 | 1 500 (standard table) | **Over, by 92%.** Would have stopped at ~12:30 every day. |
| `readings` | 45 s | 1 920 | 30 000 (column-partitioned) | Under — *if* the partitioned limit is the one that governs. |
| `readings_1m` | 45 s | 1 920 | 30 000 (column-partitioned) | Same. |

**The plan's original table was wrong about the two partitioned tables, and right about `latest`.**
It had all three failing against 1 500. What the quotas page actually says is that a partitioned
table has its own, higher limit which replaces the standard-table one — and the troubleshooting
page confirms it from the other side, with two separate errors: *"Your table exceeded quota for
imports or query appends per table"* for standard tables, and a *number of partition modifications
for column-partitioned tables* error for partitioned ones.

What it does **not** say is which of the two governs a partitioned destination when the write is a
load job, because the load section states its own "Load jobs per table per day: 1 500" and then
refers the reader to *both* table sections. So `readings` at 1 920 jobs a day sat on a reading of
the documentation rather than on a documented number. That ambiguity is the real defect: a service
whose steady state is 28% over one candidate limit and 94% under the other is a service nobody can
say is correct. Streaming removes the question rather than answering it.

The Storage Write API's own limits, for the record: **no per-day cap at all**, 20 MB per
`AppendRows` request (a flush is a few tens of KB), 300 MB/s per project in a region, and 5 000
concurrent connections — the ingester holds two, one per table, for the life of the process,
which is what the documentation asks for. Cost: **$0.025/GiB with the first 2 TiB a month free**,
against ~1 GB a fortnight here, so it stays $0 as the load jobs were.

`warehouse soak` is how that claim gets checked against a real project rather than asserted here:
it drives the same writer with the same batch shape at whatever rate `--interval` says, and 2 000
appends per table in an hour is a stronger disproof of a per-*day* cap than 2 000 spread over
thirteen. It refuses `power_meter` by name.

## Loading fixtures, and the one thing still on load jobs

`warehouse load` still writes through a **load job**, and that is the right tool for what is left of
it: one bulk write of a whole window, run by hand, a handful of jobs a day at the very most. What
could not stay on load jobs was the ingester's *repeating* write, and only that.

The BigQuery SDK is reached through a three-method `WarehouseClient` interface and imported
**dynamically**. Everything above that interface is tested against a fake; and because the import is
dynamic, `@google-cloud/bigquery` stayed out of the web app's build until something in `apps/web`
constructed a client. Step 8's live mode is that something. Turbopack bundles the SDK into the
server chunks rather than tracing its packages in, and the standalone output went from 58 MB to
59 MB; a client constructed inside the production build reaches the credentials check.

The two SDKs step 8c added — `@google-cloud/bigquery-storage` and `@google-cloud/firestore` — are
reached the same way, and **neither reaches the web app**: the standalone build was grepped for
both after the change and contains neither, while the same grep finds `@google-cloud/bigquery`
exactly where the paragraph above says it is. Only the ingester image carries them.

## Emptying it, and why that command exists

`reset` drops both tables, `latest` if a dataset still has it, and the ledger with them. It is not a convenience: the fixture
loader writes synthetic readings into the same tables the ingester writes real ones into, and
**nothing in a row says which it is**. A `load` run to exercise the adapter leaves data that reads
exactly like measurement for the fourteen days its partitions live.

So the rule is that the dataset is emptied before the first real reading is written:

```bash
npm run warehouse -w @power-meter/infrastructure -- reset --yes
npm run warehouse -w @power-meter/infrastructure -- migrate
```

It refuses without `--yes`. The ledger goes with the tables deliberately — dropping the tables
while keeping the record that says they were created is precisely the drift the runner refuses to
run through, so a reset leaves a dataset that looks untouched rather than half-applied. Nothing in
the pipeline calls it, and nothing should: after go-live it destroys history that exists nowhere
else.

The alternative considered and rejected was a `source` column distinguishing fixture rows from
real ones. It is a migration, it costs a column on ~9.7 M rows, and it makes "is this real" a
filter every query has to remember rather than a property of the dataset.

## What has been run, and against what

**All of it, once, against `saijo-power-meter` on 2026-09-22.** The dataset came
from the step 6 apply — which is also what proved the deployer's
`roles/bigquery.admin`, since a `pulumi preview` plans rather than creates and
passes over a missing role. The tables came from `migrate`, run by hand: nothing
in the delivery pipeline runs it, and that stays true until step 7 needs it.

What that run established, in order:

- **The DDL parses.** It did not at first. `at` is a reserved keyword in
  GoogleSQL, and BigQuery rejected migration `0001` on its first statement —
  after the column had passed review, a full suite against the fake client, and
  a green preview. It is `reading_at` now, and a test asserts no column in any
  migration is named for a reserved word. Nothing that runs without credentials
  knows what BigQuery's parser will refuse; that test is the closest substitute.
- **The migrations are idempotent.** A second `migrate` applied nothing.
- **Retention is real.** `settings` read `partition_expiration_days = 14` and
  `require_partition_filter` back off `readings` and `readings_1m`, and neither
  off `latest` (which step 8c has since dropped).
- **The load path works.** A two-hour window loaded 41 730 readings, 6 314
  rollup rows and — at the time — 55 `latest` rows. Those reconcile: 6.61 readings per rollup
  bucket against 60/9 = 6.67 at the real publish rate, the shortfall being the
  offline-profile meters that stop partway through the window.
- **The adapter is faithful.** `verify` ran `historyTable` over the same window
  twice, once against the fixtures in memory and once against what BigQuery
  returned, and all 55 rows agreed on total energy, running time and reading
  count.

Two things follow from that run and are worth knowing:

- **The fixtures are still in the tables.** They sit in `readings` and
  `readings_1m` — their partitions expired long ago, but `latest` never did, and
  the rule is the same either way. Step 7 gave that its command — `reset --yes`
  then `migrate`, see *Emptying it* above — and it has to be run before the
  first real reading is written, or the warehouse holds synthetic and real data
  with nothing telling them apart. After step 8c that reset also removes the
  retired `latest` table, and the `migrate` after it applies `0002`.
- **`load` and `verify` must be given the same window.** Fixture load is a
  function of absolute time, so the same window is the same readings — but a
  window ending "now" ends at a different instant in each command. `load` prints
  the exact window it used as the `verify` line to paste.

- **The `migrate` step in the pipeline has never executed.** Step 7 declared it
  in `infra/index.ts` and implemented it in `ci/migrate.sh`; the first pull
  request touching `infra/` runs its dry run, and the merge that follows runs
  the real one.

The commands:

```bash
npm run warehouse -w @power-meter/infrastructure -- sql
npm run warehouse -w @power-meter/infrastructure -- migrate --dry-run
npm run warehouse -w @power-meter/infrastructure -- migrate
npm run warehouse -w @power-meter/infrastructure -- settings
npm run warehouse -w @power-meter/infrastructure -- load --hours 2
npm run warehouse -w @power-meter/infrastructure -- verify --from <T> --to <T>
npm run warehouse -w @power-meter/infrastructure -- reset --yes
npm run warehouse -w @power-meter/infrastructure -- soak --dataset <scratch> --cycles 2000
```

`settings` joins `INFORMATION_SCHEMA.TABLES` to `TABLE_OPTIONS` and prints every table's expiry and
partition filter, because "partition expiry is set, not assumed" can only be answered by asking the
database: a table created without the option looks identical to the DDL that was meant to carry it.
It reads from `TABLES` rather than from the options alone so that a table with neither option —
the ledger, and `latest` while it lasted — is reported as having neither, rather than being absent
and indistinguishable from a table that was never created.

`verify` needs the window `load` printed, not `--hours`; see above.

**Step 8c's write path has been run against the project**, on 2026-09-23, using a throwaway
`scratch_8c` dataset that was deleted the same afternoon. What that settled:

- **`0002` is legal DDL.** BigQuery's parser accepted `DROP TABLE IF EXISTS`, and `settings`
  afterwards listed `readings`, `readings_1m` and the ledger, with `latest` gone.
- **`0001`'s checksum survived step 8c's edits**, which is the one that mattered. The scratch
  dataset had been migrated by the *pre-8c* code first, so its ledger held `0001`'s recorded
  checksum; the new code read that ledger, agreed with it, and applied only `0002`. That is exactly
  what `power_meter` will do — its ledger carries the same row from 2026-09-22 — so the pipeline's
  `migrate` step has nothing to stumble over. A test now pins that checksum so a future edit fails
  in the suite rather than against the one dataset that has it.
- **The daily cap is gone.** `warehouse soak --cycles 1600 --interval 200` made **1 600 appends to
  each table in about eight minutes — 176 000 rows, zero failures**. A load job would have been
  refused at 1 500; nothing here noticed the number. That is the whole claim of this step, measured
  rather than argued.
- **The rows are readable, and the timestamps decoded.** 88 000 rows and all 55 meters in each
  table, `reading_at` spanning the eight minutes the soak ran and the rollup's minutes walking back
  about 27 hours. This is the check that "BigQuery accepted the append" and "the row means what it
  said" are different claims: a TIMESTAMP handed over as a string rather than a `Date` would have
  landed at the epoch or been rejected deep in the protobuf encoder.
- **The restart-state document round-trips.** 55 meters, **10 755 bytes** — 1% of Firestore's 1 MiB
  document limit — written and read back with every reading identical.

The one thing that read back wrong was the soak's own arithmetic: 1 592 distinct rollup minutes
instead of 1 600. It anchored each cycle's bucket to that cycle's clock, so the bucket repeated
whenever the wall clock crossed a minute at the same moment the cycle counter advanced. Fixed by
anchoring once at the start, and the test now moves its clock, which is what it should have done to
begin with. Nothing in the ingester shares that code — its closed-minute rule is in
`apps/ingester/src/ingester.ts` and was not involved — but a tool that claims a property and does
not have it is worse than one that claims nothing.

**The merge half-applied, and what landed is worth stating exactly.** The step 8c merge ran on
2026-09-23 and its `migrate` step passed: **`0002` is applied to `power_meter`, so `latest` is
dropped in production.** The `pulumi` step then failed creating the Firestore database — the
deployer did not hold `roles/datastore.owner`, and a preview plans rather than creates, so it had
gone green. See `docs/architecture/delivery-pipeline.md`. What that leaves:

| | |
| --- | --- |
| `0002` applied, `latest` dropped | ✅ |
| `firestore.googleapis.com` enabled | ✅ |
| Web service on the new image | ✅ (still `DATA_MODE=demo`) |
| The Firestore `(default)` database | ✗ — the 403 |
| `roles/datastore.user` for the ingester | ✗ — never reached |
| `roles/bigquery.jobUser` **removed** | ✗ — never reached, the binding is still there |

Nothing is broken by that split, because nothing reads either store yet: the ingester is not
deployed and the web app never read `latest`. It re-applies whole once the deployer has the role.

What is still unproven, and what settles it:

| Unproven | The command |
| --- | --- |
| Pulumi creates the Firestore database | the apply after the deployer is granted `roles/datastore.owner` |
| The ingester process itself writing to either store | blocked by the scaling gate, as everything else about it is |

`gcloud firestore databases list` on 2026-09-23 returned nothing, so the project has no `(default)`
database and Pulumi will create rather than collide with one. One oddity worth knowing before
trusting the pricing page's "no free quota for named databases": the scratch database, created when
the project had no default, came back from the API with `freeTier: true`. Firestore appears to
designate the *first* database in a project as the free-tier one rather than `(default)` strictly.
It does not change the choice here — `(default)` is free either way and is what the documentation
guarantees — but do not read `freeTier` on a named database as proof the docs are wrong.

The scratch dataset is a deliberate exception to "every Google Cloud resource is declared in
`infra/`": it is made by hand, written to by one command, and deleted in the same sitting. A
throwaway that Pulumi owned would be a throwaway that outlived the test.

**The delivery pipeline runs `migrate` now.** It is the `migrate` step, between `image` and
`pulumi`, so migrations are applied before the revision that depends on them — CLAUDE.md's rule.
On a pull request it runs `migrate --dry-run`, which connects, reads the ledger and prints what it
would apply; that catches a dataset that has drifted from the code and does not ask BigQuery's
opinion of any new DDL, because it submits none. `--skip-if-no-dataset` covers the first apply on a
project whose dataset Pulumi has not created yet: the step exits clean with a message and the next
build migrates.
