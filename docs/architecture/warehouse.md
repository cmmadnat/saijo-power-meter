# The warehouse

Three tables in one BigQuery dataset, and a migration runner that puts them there.
Written at step 6 of `docs/power-meter-rebuild-plan.md`. Step 7 added the write side — the
`ReadingWriter` port and the ingester behind it — and wired `migrate` into the delivery pipeline.
Nothing *reads* the tables yet; that is step 8.

## What is where

| | |
| --- | --- |
| `infra/index.ts` | The **dataset** — a Google Cloud resource, declared with the rest. |
| `packages/infrastructure/src/warehouse/migrations.ts` | The **tables** — schema, not infrastructure. |
| `packages/infrastructure/src/warehouse/runner.ts` | Applying them, and reading back what was applied. |
| `packages/infrastructure/src/warehouse/repository.ts` | The two read ports, backed by the tables. |
| `packages/infrastructure/src/warehouse/writer.ts` | The write port: raw and rollup in one batch, `latest` replaced. |
| `packages/infrastructure/src/warehouse/loader.ts` | Replaying the step-2 fixtures, and the equivalence check. |
| `packages/infrastructure/src/warehouse/cli.ts` | `migrate`, `load`, `verify`, `settings`, `reset`. |

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

**One query per meter, not one per window.** The port's contract is "ordered by meter, then
ascending in time", and a single `ORDER BY meter_id, at` over a fortnight of 55 meters is ~9.7 M
rows through one sort, which BigQuery refuses rather than merely takes its time over. Per meter it
is ~176 k rows and sorts in one slot. The cost is 55 round trips on the widest window, and that is
a step-8 tuning question: the rollup exists to make wide windows cheap, and pointing the *chart*
path at it is a change of table, not of arithmetic. History stays on raw, because running hours are
read off the gaps between actual readings and a minute-resolution source would quietly round them.

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
dynamic, `@google-cloud/bigquery` and its fifty-odd transitive packages stay out of the web app's
traced standalone output until something in `apps/web` actually constructs a client.

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

## What has been run, and what has not

This session holds no Google Cloud credentials, by design (CLAUDE.md), so nothing below was done
from here. What has been done against `saijo-power-meter`, by hand: the dataset and all three
tables exist and are migrated, two hours of fixtures were loaded, and `verify` matched all 55
History rows. That answers what step 6 left open about BigQuery's opinion of the DDL and about
`load` and `verify`.

Still unrun:

- **`settings`** — the partition expiry and the required partition filter have not been read back
  from `INFORMATION_SCHEMA`, so they are what the DDL asked for rather than what the database says.
- **The `migrate` step in the pipeline** has never executed. It is declared in `infra/index.ts` and
  implemented in `ci/migrate.sh`; the first pull request touching `infra/` runs its dry run.
- **The fixture rows are still there.** Two hours of synthetic readings, expiring fourteen days
  from the load. `reset` before the first real ingest — see above.

The commands:

```bash
npm run warehouse -w @power-meter/infrastructure -- sql
npm run warehouse -w @power-meter/infrastructure -- migrate --dry-run
npm run warehouse -w @power-meter/infrastructure -- migrate
npm run warehouse -w @power-meter/infrastructure -- load --hours 24
npm run warehouse -w @power-meter/infrastructure -- verify --hours 24
npm run warehouse -w @power-meter/infrastructure -- settings
npm run warehouse -w @power-meter/infrastructure -- reset --yes
```

`settings` reads `INFORMATION_SCHEMA.TABLE_OPTIONS` and prints each table's expiry and partition
filter, because "partition expiry is set, not assumed" can only be answered by asking the database:
a table created without the option looks identical to the DDL that was meant to carry it.

**The delivery pipeline runs `migrate` now.** It is the `migrate` step, between `image` and
`pulumi`, so migrations are applied before the revision that depends on them — CLAUDE.md's rule.
On a pull request it runs `migrate --dry-run`, which connects, reads the ledger and prints what it
would apply; that catches a dataset that has drifted from the code and does not ask BigQuery's
opinion of any new DDL, because it submits none. `--skip-if-no-dataset` covers the first apply on a
project whose dataset Pulumi has not created yet: the step exits clean with a message and the next
build migrates.
