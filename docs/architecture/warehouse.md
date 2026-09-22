# The warehouse

Three tables in one BigQuery dataset, and a migration runner that puts them there.
Written at step 6 of `docs/power-meter-rebuild-plan.md`. Step 7 added the write side — the
`ReadingWriter` port and the ingester behind it — and wired `migrate` into the delivery pipeline.
Step 8 added the read side the screens use: the web app's live mode reads `readings_1m` for the
charts and the fleet strip and `readings` for History — see `docs/architecture/data-modes.md`.

## What is where

| | |
| --- | --- |
| `infra/index.ts` | The **dataset** — a Google Cloud resource, declared with the rest. |
| `packages/infrastructure/src/warehouse/migrations.ts` | The **tables** — schema, not infrastructure. |
| `packages/infrastructure/src/warehouse/runner.ts` | Applying them, and reading back what was applied. |
| `packages/infrastructure/src/warehouse/repository.ts` | The three read ports, backed by the tables. |
| `packages/infrastructure/src/warehouse/cache.ts` | A rollup read remembered until the minute turns. |
| `packages/infrastructure/src/warehouse/cost.ts` | `warehouse cost`: what the screens' reads process, bill and take. |
| `packages/infrastructure/src/warehouse/writer.ts` | The write port: raw and rollup in one batch, `latest` replaced. |
| `packages/infrastructure/src/warehouse/loader.ts` | Replaying the step-2 fixtures, and the equivalence check. |
| `packages/infrastructure/src/warehouse/cli.ts` | `migrate`, `load`, `verify`, `settings`, `reset`, `cost`. |

The dataset/table line is the same one `bootstrap.sh` draws for the Pulumi state bucket: a
container that has to exist before anything else can run is infrastructure; what goes inside it is
the application's own shape, versioned with the code that reads it.

## The three tables

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

**`latest`** — 55 rows, unpartitioned, never expired.

**This is not the real-time screen's data source.** The ingester holds the latest reading per meter
in memory and serves it; paying per write for a value that is obsolete a second later would cost
more per month than storing all the history (~$19 against ~$0.07, see the plan's storage section).
This table is what a restarted ingester rehydrates from, so a deploy does not begin blind. It is
replaced wholesale rather than upserted — 55 rows is cheaper to rewrite than to merge.

## Migrations

Versioned, ordered, idempotent, which each mean something specific:

- **Versioned.** Four digits, and a SHA-256 of the migration's own statements recorded beside it.
  An applied migration may never be edited: the runner compares checksums and stops. It also stops
  when the dataset carries a version the code does not know, which is the same mistake seen from the
  other side — the database is ahead of the checkout, and migrating *back* is not the cure.
- **Ordered.** Contiguous from `0001`, applied ascending. `validate()` fails on a gap or a
  duplicate, which is what two branches each adding "the next" migration produces.
- **Idempotent.** Every statement is `CREATE ... IF NOT EXISTS`. BigQuery has no transaction
  spanning DDL, so there is no way to make the statements and the row recording them atomic. A run
  that dies between the two re-applies that migration on the next run, every statement no-ops, and
  the record is written. Idempotence is what makes that a non-event rather than a recovery.

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
what that bills, and times each through the adapters and use cases the web app runs. It needs
credentials and has not been run; it is also the first time BigQuery will parse the step-8 SQL.

## Writing, from the ingester

`WarehouseReadingWriter` implements the `ReadingWriter` port. Two things about it are rules rather
than choices:

- **Raw and rollup go in one call.** They are one flush of one buffer, and writing them separately
  would let a crash between the two leave a minute present in `readings` and absent from
  `readings_1m` — which no reader is built to notice, because the chart would fall back to raw and
  agree while the rollup under-reported that minute forever.
- **An empty `replaceLatest` writes nothing.** `WRITE_TRUNCATE` with no rows would empty the one
  table a restarting ingester reads, so a broker outage at the moment the timer fires would cost
  the next restart its rehydration as well.

Which minutes are eligible to be rolled up at all is the ingester's rule, not this layer's — only
closed ones, see `docs/architecture/ingester.md`.

## Loading and writing

Rows go in through **load jobs**, not the streaming insert API: load jobs are free where streaming
is billed per megabyte, and rows land in the table immediately instead of sitting in a streaming
buffer that DML cannot see.

The BigQuery SDK is reached through a four-method `WarehouseClient` interface and imported
**dynamically**. Everything above that interface is tested against a fake; and because the import is
dynamic, `@google-cloud/bigquery` stayed out of the web app's build until something in `apps/web`
constructed a client. Step 8's live mode is that something. Turbopack bundles the SDK into the
server chunks rather than tracing its packages in, and the standalone output went from 58 MB to
60 MB; a client constructed inside the production build reaches the credentials check.

## Emptying it, and why that command exists

`reset` drops all three tables and the ledger with them. It is not a convenience: the fixture
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
  off `latest`.
- **The load path works.** A two-hour window loaded 41 730 readings, 6 314
  rollup rows and 55 `latest` rows. Those reconcile: 6.61 readings per rollup
  bucket against 60/9 = 6.67 at the real publish rate, the shortfall being the
  offline-profile meters that stop partway through the window.
- **The adapter is faithful.** `verify` ran `historyTable` over the same window
  twice, once against the fixtures in memory and once against what BigQuery
  returned, and all 55 rows agreed on total energy, running time and reading
  count.

Two things follow from that run and are worth knowing:

- **The fixtures are still in the tables.** They sit in `readings` and
  `readings_1m` until their partitions expire 14 days on. Step 7 gave that its
  command — `reset --yes` then `migrate`, see *Emptying it* above — and it has
  to be run before the first real reading is written, or the warehouse holds
  synthetic and real data with nothing telling them apart.
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
```

`settings` joins `INFORMATION_SCHEMA.TABLES` to `TABLE_OPTIONS` and prints every table's expiry and
partition filter, because "partition expiry is set, not assumed" can only be answered by asking the
database: a table created without the option looks identical to the DDL that was meant to carry it.
It reads from `TABLES` rather than from the options alone so that a table with neither option — 
`latest` — is reported as having neither, rather than being absent and indistinguishable from a
table that was never created.

`verify` needs the window `load` printed, not `--hours`; see above.

**The delivery pipeline runs `migrate` now.** It is the `migrate` step, between `image` and
`pulumi`, so migrations are applied before the revision that depends on them — CLAUDE.md's rule.
On a pull request it runs `migrate --dry-run`, which connects, reads the ledger and prints what it
would apply; that catches a dataset that has drifted from the code and does not ask BigQuery's
opinion of any new DDL, because it submits none. `--skip-if-no-dataset` covers the first apply on a
project whose dataset Pulumi has not created yet: the step exits clean with a message and the next
build migrates.
