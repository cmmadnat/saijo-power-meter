/**
 * The warehouse, tested without a warehouse.
 *
 * This session holds no Google Cloud credentials by design, so what can be
 * checked here is everything except BigQuery's own opinion: the migration
 * list's shape, the ledger logic, the SQL the repository builds, and the row
 * mapping in both directions. The fake client below is not a mock of BigQuery
 * — it stores rows the way a load job would, as JSON, and hands timestamps
 * back in the wrapper shape the real client uses, which is what makes the last
 * test in the file worth something: it runs the History aggregation over the
 * fixtures twice, once in memory and once through the adapter, and requires
 * every row to agree.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  historyTable,
  meterSeries,
  rollupReadings,
  type RollupBucket,
  type RollupRepository,
} from "@power-meter/application";
import { MeterRegistry, type MeterId } from "@power-meter/domain";
import { generateFixtures } from "../fixtures/generate.ts";
import type { QueryParams, WarehouseClient } from "./client.ts";
import { loadFixtures, verifyAgainstFixtures } from "./loader.ts";
import {
  checksum,
  MIGRATIONS,
  render,
  validate,
  type Migration,
} from "./migrations.ts";
import {
  WarehouseReadingRepository,
  WarehouseRollupRepository,
  metersPerQuery,
} from "./repository.ts";
import { CachedRollupRepository } from "./cache.ts";
import { billedBytes, measureCost, percentile } from "./cost.ts";
import { FixtureReadingRepository } from "../fixtures/repository.ts";
import { partitionSettings, resetWarehouse, runMigrations } from "./runner.ts";
import { WarehouseReadingWriter } from "./writer.ts";
import { soak } from "./soak.ts";
import type { RowStream } from "./stream.ts";
import {
  FirestoreLatestStore,
  fromLatestDocument,
  toLatestDocument,
  type DocumentStore,
} from "../firestore/latest-store.ts";
import {
  bucketToRow,
  bucketToStreamRow,
  readingToRow,
  readingToStreamRow,
  rowToReading,
  RETENTION_DAYS,
  RETIRED_TABLES,
  TABLES,
  tableRef,
  toDate,
  type StreamRow,
  type WarehouseTarget,
} from "./schema.ts";

const TARGET: WarehouseTarget = { dataset: "power_meter" };

/**
 * A stand-in for BigQuery: rows go in as JSON and come back with timestamps
 * wrapped the way the client wraps them. It understands only the queries this
 * codebase issues, and answers anything else with no rows.
 */
class FakeWarehouse implements WarehouseClient {
  readonly statements: string[] = [];
  readonly tables = new Map<string, Record<string, unknown>[]>();

  async query<Row>(sql: string, params?: QueryParams): Promise<Row[]> {
    this.statements.push(sql);
    const ledger = this.rows(TABLES.migrations);

    if (sql.startsWith("SELECT version")) return [...ledger] as Row[];
    if (sql.startsWith("INSERT INTO")) {
      ledger.push({ ...params });
      return [] as Row[];
    }
    return [] as Row[];
  }

  async *stream<Row>(sql: string, params?: QueryParams): AsyncIterable<Row> {
    this.statements.push(sql);
    if (sql.includes(tableRef(TARGET, TABLES.rollup))) {
      const meters = params?.["meterIds"] as string[];
      const from = (params?.["from"] as Date).getTime();
      const to = (params?.["to"] as Date).getTime();
      const at = (row: Record<string, unknown>) => new Date(row["minute"] as string).getTime();
      const matching = this.rows(TABLES.rollup)
        .filter((row) => meters.includes(row["meter_id"] as string))
        .filter((row) => at(row) >= from && at(row) < to)
        .sort((a, b) =>
          a["meter_id"] === b["meter_id"]
            ? at(a) - at(b)
            : (a["meter_id"] as string) < (b["meter_id"] as string)
              ? -1
              : 1,
        );
      for (const row of matching) yield wrap(row) as Row;
      return;
    }
    if (!sql.includes(tableRef(TARGET, TABLES.readings))) return;

    const meters = params?.["meterIds"] as string[];
    const from = (params?.["from"] as Date).getTime();
    const to = (params?.["to"] as Date).getTime();
    const at = (row: Record<string, unknown>) => new Date(row["reading_at"] as string).getTime();
    const matching = this.rows(TABLES.readings)
      .filter((row) => meters.includes(row["meter_id"] as string))
      .filter((row) => at(row) >= from && at(row) < to)
      .sort((a, b) =>
        a["meter_id"] === b["meter_id"]
          ? at(a) - at(b)
          : (a["meter_id"] as string) < (b["meter_id"] as string)
            ? -1
            : 1,
      );
    for (const row of matching) yield wrap(row) as Row;
  }

  async load(table: string, rows: AsyncIterable<object>): Promise<number> {
    const target = this.rows(table);
    let written = 0;
    for await (const row of rows) {
      // Through JSON, exactly as a newline-delimited load job would go.
      target.push(JSON.parse(JSON.stringify(row)) as Record<string, unknown>);
      written += 1;
    }
    return written;
  }

  rows(table: string): Record<string, unknown>[] {
    const existing = this.tables.get(table);
    if (existing) return existing;
    const created: Record<string, unknown>[] = [];
    this.tables.set(table, created);
    return created;
  }
}

/** Timestamps come back from the BigQuery client wrapped, not as strings. */
function wrap(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] =
      (key.endsWith("_at") || key === "minute") &&
      typeof value === "string"
        ? { value }
        : value;
  }
  return out;
}

/**
 * The two halves of the ingester's write path, faked.
 *
 * `FakeRowStream` stores what the Storage Write API would have been handed —
 * with the timestamps still as `Date`s, because that is exactly the difference
 * from a load job's row and the thing most likely to be got wrong again.
 * `FakeDocuments` is one map standing in for one Firestore document.
 */
class FakeRowStream implements RowStream {
  readonly appends: { table: string; rows: readonly StreamRow[] }[] = [];
  closed = false;
  /** Set to fail the next append to this table, the way a quota error would. */
  failing: string | undefined;

  async append(table: string, rows: readonly StreamRow[]): Promise<void> {
    if (table === this.failing) throw new Error(`${table}: rejected`);
    if (rows.length === 0) return;
    this.appends.push({ table, rows });
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  rows(table: string): StreamRow[] {
    return this.appends.filter((append) => append.table === table).flatMap((a) => [...a.rows]);
  }
}

class FakeDocuments implements DocumentStore {
  readonly documents = new Map<string, Record<string, unknown>>();
  writes = 0;

  async get(path: string): Promise<Record<string, unknown> | undefined> {
    return this.documents.get(path);
  }

  async set(path: string, data: Record<string, unknown>): Promise<void> {
    this.writes += 1;
    this.documents.set(path, data);
  }
}

// --- the migration list ------------------------------------------------------

test("the shipped migrations are contiguous, unique and non-empty", () => {
  validate();
});

test("validate rejects a gap, a duplicate and a bad version", () => {
  const one: Migration = { version: "0001", name: "a", statements: ["SELECT 1"] };
  assert.throws(() => validate([one, { ...one, version: "0003" }]), /contiguous/);
  assert.throws(() => validate([one, one]), /duplicate/);
  assert.throws(() => validate([{ ...one, version: "1" }]), /four digits/);
  assert.throws(() => validate([{ ...one, statements: [] }]), /no statements/);
});

test("every statement is idempotent, so a half-finished run is safe to repeat", () => {
  for (const migration of MIGRATIONS) {
    for (const statement of migration.statements) {
      assert.match(
        statement,
        /^CREATE (TABLE|VIEW|OR REPLACE VIEW) IF NOT EXISTS|^CREATE OR REPLACE |^DROP TABLE IF EXISTS /,
        `${migration.version}: ${statement.slice(0, 60)}`,
      );
    }
  }
});

test("raw and rollup carry the retention policy and the partition filter", () => {
  const ddl = MIGRATIONS.flatMap((migration) => migration.statements);
  for (const table of [TABLES.readings, TABLES.rollup]) {
    const statement = ddl.find((sql) => sql.includes(`{{dataset}}.${table}`));
    assert.ok(statement, `no DDL for ${table}`);
    assert.match(statement, new RegExp(`partition_expiration_days = ${RETENTION_DAYS}`));
    assert.match(statement, /require_partition_filter = TRUE/);
  }
});

test("every retired table is dropped by a migration, not just forgotten", () => {
  // Removing a table from TABLES stops this code writing to it. Only a
  // migration stops it existing — and a dataset that still has `latest` is a
  // dataset holding readings nothing will ever update and nothing can tell
  // from measurement.
  const ddl = MIGRATIONS.flatMap((migration) => migration.statements);
  for (const table of RETIRED_TABLES) {
    assert.ok(
      ddl.some((sql) => sql === `DROP TABLE IF EXISTS {{dataset}}.${table}`),
      `no migration drops ${table}`,
    );
  }
});

/**
 * GoogleSQL's reserved keywords. A column named for one of these is a syntax
 * error unless it is backtick-quoted everywhere it appears — which is a rule
 * nobody remembers on the fourth query. This test is here because `at` got
 * through review, through a full unit-test suite against a fake client, and
 * through a green `pulumi preview`, and was caught only by BigQuery itself on
 * the first real `migrate`.
 */
const RESERVED = new Set(
  `ALL AND ANY ARRAY AS ASC ASSERT_ROWS_MODIFIED AT BETWEEN BY CASE CAST
   COLLATE CONTAINS CREATE CROSS CUBE CURRENT DEFAULT DEFINE DESC DISTINCT
   ELSE END ENUM ESCAPE EXCEPT EXCLUDE EXISTS EXTRACT FALSE FETCH FOLLOWING
   FOR FROM FULL GROUP GROUPING GROUPS HASH HAVING IF IGNORE IN INNER
   INTERSECT INTERVAL INTO IS JOIN LATERAL LEFT LIKE LIMIT LOOKUP MERGE
   NATURAL NEW NO NOT NULL NULLS OF ON OR ORDER OUTER OVER PARTITION
   PRECEDING PROTO RANGE RECURSIVE RESPECT RIGHT ROLLUP ROWS SELECT SET SOME
   STRUCT TABLESAMPLE THEN TO TREAT TRUE UNBOUNDED UNION UNNEST USING WHEN
   WHERE WINDOW WITH WITHIN`
    .split(/\s+/)
    .filter(Boolean),
);

/** `  <name> <TYPE>` at the start of a column definition line. */
const COLUMN = /^\s+([A-Za-z_][A-Za-z0-9_]*)\s+(STRING|TIMESTAMP|DATE|DATETIME|TIME|FLOAT64|INT64|NUMERIC|BIGNUMERIC|BOOL|BYTES|JSON)\b/gm;

test("the migration applied to the real project still checksums the same", () => {
  // 0001 was applied to saijo-power-meter on 2026-09-22, so its checksum is in
  // that dataset's ledger and the runner refuses to go on if the code's copy
  // disagrees. Step 8c edited the file around it — the `latest` table's name
  // became a literal when the constant went — and the checksum is what says the
  // statements themselves did not move. A future edit that changes this number
  // fails here, in a unit test, rather than against the one project that has it.
  const [first] = MIGRATIONS;
  assert.ok(first);
  assert.equal(
    checksum(first),
    "83f76e95de9473d61ab6fc015d52260a9aeca5d78cc4d7548890bb025538eec2",
  );
});

test("no column is named for a reserved keyword", () => {
  const columns = new Set<string>();
  for (const migration of MIGRATIONS) {
    for (const statement of migration.statements) {
      for (const match of statement.matchAll(COLUMN)) {
        if (match[1] !== undefined) columns.add(match[1]);
      }
    }
  }

  assert.ok(columns.size > 0, "found no column definitions to check");
  const offenders = [...columns].filter((name) =>
    RESERVED.has(name.toUpperCase()),
  );
  assert.deepEqual(
    offenders,
    [],
    `reserved in GoogleSQL, so unusable unquoted: ${offenders.join(", ")}`,
  );
});

test("the readings table is partitioned on the column it actually has", () => {
  // The partition expression names a column, and a rename that misses it makes
  // a table that cannot be created — the same failure class as the reserved
  // word, one line further down.
  const ddl = MIGRATIONS.flatMap((m) => m.statements).find((sql) =>
    sql.includes(`{{dataset}}.${TABLES.readings}`),
  );
  assert.ok(ddl);
  assert.match(ddl, /PARTITION BY DATE\(reading_at\)/);
  assert.match(ddl, /^\s+reading_at TIMESTAMP NOT NULL/m);
});

test("a checksum covers the statements, not the dataset it is rendered against", () => {
  const [first] = MIGRATIONS;
  assert.ok(first);
  assert.equal(checksum(first), checksum({ ...first }));
  assert.notEqual(
    checksum(first),
    checksum({ ...first, statements: [...first.statements, "SELECT 1"] }),
  );
});

test("render qualifies every table and honours a project id", () => {
  const [first] = MIGRATIONS;
  assert.ok(first);
  const rendered = render(first, { projectId: "saijo-power-meter", dataset: "power_meter" });
  assert.ok(rendered.every((sql) => !sql.includes("{{dataset}}")));
  assert.ok(
    rendered.some((sql) =>
      sql.includes("`saijo-power-meter.power_meter.readings`"),
    ),
  );
});

test("a table reference rejects a name that is not an identifier", () => {
  assert.throws(() => tableRef({ dataset: "power_meter`; DROP" }, "readings"), /dataset/);
  assert.throws(() => tableRef({ dataset: "power_meter" }, "readings`"), /table/);
  assert.throws(
    () => tableRef({ projectId: "a`b", dataset: "power_meter" }, "readings"),
    /project/,
  );
});

// --- the runner --------------------------------------------------------------

test("a first run applies everything and a second applies nothing", async () => {
  const client = new FakeWarehouse();

  const first = await runMigrations(client, TARGET);
  assert.equal(first.applied.length, MIGRATIONS.length);
  assert.equal(first.alreadyApplied.length, 0);

  const statementsAfterFirst = client.statements.length;
  const second = await runMigrations(client, TARGET);
  assert.deepEqual(second.applied, []);
  assert.equal(second.alreadyApplied.length, MIGRATIONS.length);
  // The ledger DDL and the ledger read, and nothing else.
  assert.equal(client.statements.length - statementsAfterFirst, 2);
});

test("an edited migration stops the run rather than being reapplied", async () => {
  const client = new FakeWarehouse();
  await runMigrations(client, TARGET);

  const edited = MIGRATIONS.map((migration, index) =>
    index === 0
      ? { ...migration, statements: [...migration.statements, "SELECT 1"] }
      : migration,
  );
  await assert.rejects(
    runMigrations(client, TARGET, { migrations: edited }),
    /has changed since it was applied/,
  );
});

test("a database ahead of the code stops the run", async () => {
  const client = new FakeWarehouse();
  await runMigrations(client, TARGET);
  client.rows(TABLES.migrations).push({
    version: "0099",
    name: "from the future",
    checksum: "x",
  });

  await assert.rejects(
    runMigrations(client, TARGET),
    /ahead of the checkout/,
  );
});

test("a dry run records nothing", async () => {
  const client = new FakeWarehouse();
  const outcome = await runMigrations(client, TARGET, { dryRun: true });
  assert.deepEqual(outcome.applied, []);
  assert.equal(client.rows(TABLES.migrations).length, 0);
  // And a real run afterwards still has everything to do.
  assert.equal((await runMigrations(client, TARGET)).applied.length, MIGRATIONS.length);
});

test("settings reports a table that carries neither option", async () => {
  // The join returns a row with both option columns null for the ledger. It
  // has to come back as a table with no expiry, not vanish from the report.
  const client: WarehouseClient = {
    async query<Row>() {
      return [
        { table_name: "readings", option_name: "partition_expiration_days", option_value: "14" },
        { table_name: "readings", option_name: "require_partition_filter", option_value: "true" },
        { table_name: "schema_migrations", option_name: null, option_value: null },
      ] as Row[];
    },
    async *stream<Row>(): AsyncIterable<Row> {},
    async load() { return 0; },
  };

  assert.deepEqual(await partitionSettings(client, TARGET), [
    { table: "readings", expirationDays: 14, requirePartitionFilter: true },
    { table: "schema_migrations", expirationDays: null, requirePartitionFilter: false },
  ]);
});

// --- rows --------------------------------------------------------------------

test("a reading survives the round trip to a row and back", () => {
  const reading = {
    meterId: "s01m1" as MeterId,
    at: new Date("2025-09-21T03:04:05.678Z"),
    voltage: { l1: 232.1, l2: 231.8, l3: 230.4 },
    current: { l1: 152.2, l2: 149.9, l3: 151.1 },
    activePowerKw: 49.95,
    powerFactor: 0.95,
    energyKwh: 123456.7,
  } as const;

  const row = JSON.parse(
    JSON.stringify(readingToRow(reading, new Date("2025-09-21T03:04:10.000Z"))),
  ) as Record<string, unknown>;
  assert.deepEqual(rowToReading(wrap(row)), reading);
});

test("a timestamp is read back from every shape BigQuery hands one over in", () => {
  const expected = new Date("2025-09-21T03:04:05.000Z");
  assert.deepEqual(toDate(expected), expected);
  assert.deepEqual(toDate("2025-09-21T03:04:05.000Z"), expected);
  assert.deepEqual(toDate({ value: "2025-09-21T03:04:05.000Z" }), expected);
  assert.deepEqual(toDate(expected.getTime() / 1000), expected);
  assert.throws(() => toDate(null), TypeError);
});

// --- the repository ----------------------------------------------------------

test("every readings query carries the partition filter the table demands", async () => {
  const client = new FakeWarehouse();
  const repository = new WarehouseReadingRepository(client, TARGET);
  const range = {
    from: new Date("2025-09-21T00:00:00Z"),
    to: new Date("2025-09-21T06:00:00Z"),
  };

  for await (const _ of repository.readingsInRange(
    ["s01m1", "s01m2"] as MeterId[],
    range,
  )) {
    // no rows loaded; the queries are the subject
  }

  assert.equal(client.statements.length, 1, "six hours of two meters is one query");
  for (const sql of client.statements) {
    assert.match(sql, /DATE\(reading_at\) BETWEEN DATE\(@from\) AND DATE\(@to\)/);
    assert.match(sql, /ORDER BY meter_id, reading_at/);
  }
});

test("meters share a query up to the row budget, and no further", () => {
  const day = { from: new Date(0), to: new Date(24 * 3_600_000) };
  const fortnight = { from: new Date(0), to: new Date(14 * 24 * 3_600_000) };
  // Today's History — 9 600 rows a meter — is one query for all 55.
  assert.equal(metersPerQuery(day, 55, 750_000), 55);
  // A fortnight is 134 400 rows a meter: five meters a query, eleven queries.
  assert.equal(metersPerQuery(fortnight, 55, 750_000), 5);
  // A budget smaller than one meter's window still makes progress.
  assert.equal(metersPerQuery(fortnight, 55, 10), 1);
});

test("no meters means no query at all", async () => {
  const client = new FakeWarehouse();
  const repository = new WarehouseReadingRepository(client, TARGET);
  for await (const _ of repository.readingsInRange([], {
    from: new Date(0),
    to: new Date(1),
  })) {
    assert.fail("yielded a reading");
  }
  assert.equal(client.statements.length, 0);
});

// --- the loader, and the equivalence it exists for ---------------------------

const registry = MeterRegistry.fromWorkbook();
const WINDOW = {
  from: new Date("2025-09-21T01:00:00.000Z"),
  to: new Date("2025-09-21T03:00:00.000Z"),
};

test("the loader writes raw and rollup, and no longer a latest row", async () => {
  const client = new FakeWarehouse();
  const report = await loadFixtures(client, TARGET, {
    ...WINDOW,
    intervalMs: 60_000,
    ingestedAt: new Date("2025-09-21T03:00:01.000Z"),
  });

  assert.ok(report.readings > 0);
  // One reading a minute for two hours, so raw and rollup are the same size —
  // which is the cheapest way to see that the rollup covers the whole window.
  assert.equal(report.rollupRows, report.readings);

  // The restart state is a Firestore document since step 8c, so a fixture load
  // writes two tables and nothing else.
  assert.deepEqual([...client.tables.keys()].sort(), [TABLES.readings, TABLES.rollup].sort());
});

test("History over the warehouse matches History over the fixtures, row for row", async () => {
  const client = new FakeWarehouse();
  const options = { ...WINDOW, intervalMs: 60_000 };
  await loadFixtures(client, TARGET, options);

  const verification = await verifyAgainstFixtures(client, TARGET, options);
  assert.equal(verification.rows, registry.commissioned().length);
  assert.deepEqual(verification.mismatches, []);
});

test("the ingester's writer puts raw and rollup in one batch", async () => {
  const stream = new FakeRowStream();
  const documents = new FakeDocuments();
  const writer = new WarehouseReadingWriter(stream, new FirestoreLatestStore(documents));
  const fixtures = generateFixtures({ ...WINDOW, intervalMs: 60_000 });
  const readings = fixtures.readings.slice(0, 120);
  const ingestedAt = new Date("2026-09-22T02:00:00Z");

  await writer.append({ readings, rollup: rollupReadings(readings), ingestedAt });

  assert.equal(stream.rows(TABLES.readings).length, readings.length);
  assert.equal(stream.rows(TABLES.rollup).length, rollupReadings(readings).length);
  assert.equal(stream.appends.length, 2, "one append per table, one flush");

  // `ingested_at` is the flush, `reading_at` is the reading: the gap between
  // them is how a replayed or late batch is told from a live one after the
  // fact. (`reading_at`, not `at` — AT is reserved in GoogleSQL.)
  const [row] = stream.rows(TABLES.readings);
  assert.deepEqual(row?.["ingested_at"], ingestedAt);
  assert.deepEqual(row?.["reading_at"], readings[0]?.at);
  assert.notDeepEqual(row?.["reading_at"], row?.["ingested_at"]);
});

test("a rejected table fails the whole flush, so the batch is retried whole", async () => {
  const stream = new FakeRowStream();
  const writer = new WarehouseReadingWriter(stream, new FirestoreLatestStore(new FakeDocuments()));
  const readings = generateFixtures({ ...WINDOW, intervalMs: 60_000 }).readings.slice(0, 10);
  stream.failing = TABLES.rollup;

  await assert.rejects(
    () => writer.append({ readings, rollup: rollupReadings(readings), ingestedAt: new Date() }),
    /readings_1m: rejected/,
  );
  // And the other half was still attempted rather than abandoned: the ingester
  // holds the batch and writes it again, which is at-least-once by design.
  assert.equal(stream.rows(TABLES.readings).length, readings.length);
});

test("the restart state is one document holding every meter", async () => {
  const documents = new FakeDocuments();
  const store = new FirestoreLatestStore(documents);
  const readings = generateFixtures({ ...WINDOW, intervalMs: 60_000 }).readings;
  const newest = [...new Map(readings.map((r) => [r.meterId, r])).values()];

  await store.replaceLatest(newest);
  assert.equal(documents.documents.size, 1, "one document, not one per meter");

  const read = await store.latest();
  assert.equal(read.size, newest.length);
  const first = newest[0];
  assert.ok(first);
  assert.deepEqual(read.get(first.meterId), first);
});

test("an empty flush never blanks the document a restart rehydrates from", async () => {
  const documents = new FakeDocuments();
  const writer = new WarehouseReadingWriter(
    new FakeRowStream(),
    new FirestoreLatestStore(documents),
  );
  const all = generateFixtures({ ...WINDOW, intervalMs: 60_000 }).readings;
  const readings = [...new Map(all.map((r) => [r.meterId, r])).values()].slice(0, 5);

  await writer.replaceLatest(readings);
  await writer.replaceLatest([]);

  assert.equal(
    documents.writes,
    1,
    "a broker outage at flush time must not cost the next restart its rehydration",
  );
  assert.equal((await new FirestoreLatestStore(documents).latest()).size, 5);
});

test("a missing or empty document reads as no meters, not as an error", async () => {
  assert.equal((await new FirestoreLatestStore(new FakeDocuments()).latest()).size, 0);
  assert.equal(fromLatestDocument(undefined).size, 0);
  assert.equal(fromLatestDocument({ updated_at: "2026-09-22T00:00:00.000Z" }).size, 0);
});

test("the document survives its own round trip, and is nowhere near 1 MiB", () => {
  const readings = generateFixtures({ ...WINDOW, intervalMs: 60_000 }).readings;
  const newest = [...new Map(readings.map((r) => [r.meterId, r])).values()];
  const document = toLatestDocument(newest, new Date("2026-09-22T02:00:00.000Z"));

  // Through JSON, the way Firestore's own encoding would take it.
  const restored = fromLatestDocument(
    JSON.parse(JSON.stringify(document)) as Record<string, unknown>,
  );
  assert.equal(restored.size, registry.commissioned().length);
  for (const reading of newest) {
    assert.deepEqual(restored.get(reading.meterId), reading);
  }

  const bytes = Buffer.byteLength(JSON.stringify(document));
  assert.ok(bytes < 1_048_576 / 4, `${bytes} bytes leaves no margin under the 1 MiB limit`);
});

test("a stream row is a load-job row with Dates where the timestamps are", () => {
  // The Storage Write API encodes into protobuf against the table's schema,
  // where a TIMESTAMP is an int64 of microseconds — which its JSON writer
  // produces from a `Date` and not from a string. This is the whole difference
  // between the two mappings, and asserting it here is cheaper than finding it
  // in a protobuf encoder's stack trace.
  const reading = generateFixtures({ ...WINDOW, intervalMs: 60_000 }).readings[0];
  assert.ok(reading);
  const ingestedAt = new Date("2026-09-22T02:00:00.000Z");
  const loadRow = readingToRow(reading, ingestedAt);
  const streamRow = readingToStreamRow(reading, ingestedAt);

  assert.deepEqual(Object.keys(streamRow), Object.keys(loadRow));
  for (const [column, value] of Object.entries(streamRow)) {
    const expected = (loadRow as unknown as Record<string, unknown>)[column];
    if (value instanceof Date) {
      assert.equal(value.toISOString(), expected);
    } else {
      assert.equal(value, expected);
    }
  }
  assert.ok(streamRow["reading_at"] instanceof Date);
  assert.ok(streamRow["ingested_at"] instanceof Date);

  const bucket = rollupReadings([reading])[0];
  assert.ok(bucket);
  const streamBucket = bucketToStreamRow(bucket);
  assert.deepEqual(Object.keys(streamBucket), Object.keys(bucketToRow(bucket)));
  assert.ok(streamBucket["minute"] instanceof Date);
});

test("the soak writes one flush-shaped batch per cycle and never repeats a minute", async () => {
  const stream = new FakeRowStream();
  const at = new Date("2026-09-22T02:00:30.000Z");
  const outcome = await soak({
    stream,
    cycles: 5,
    intervalMs: 45_000,
    wait: async () => {},
    now: () => at,
  });

  assert.equal(outcome.appends, 5);
  assert.deepEqual([...outcome.failures], []);
  assert.equal(stream.appends.length, 10, "two tables per cycle");
  assert.ok(stream.closed, "the connections are released when it finishes");

  const minutes = stream
    .rows(TABLES.rollup)
    .map((row) => `${String(row["meter_id"])} ${(row["minute"] as Date).toISOString()}`);
  assert.equal(new Set(minutes).size, minutes.length, "no (meter, minute) written twice");
  // Every rollup minute is a closed one: strictly before the minute the clock
  // is in, which is the rule the ingester's flush obeys.
  for (const row of stream.rows(TABLES.rollup)) {
    assert.ok((row["minute"] as Date).getTime() < at.getTime() - 30_000);
  }
});

test("the soak reports a rejection rather than throwing it", async () => {
  const stream = new FakeRowStream();
  stream.failing = TABLES.readings;
  const outcome = await soak({ stream, cycles: 3, intervalMs: 0, wait: async () => {} });

  assert.equal(outcome.appends, 0);
  assert.equal(outcome.failures.length, 3);
  assert.match(outcome.failures[0] ?? "", /readings: rejected/);
});

test("reset drops every table this code owns, ledger included", async () => {
  const client = new FakeWarehouse();
  await runMigrations(client, TARGET);
  assert.equal((await runMigrations(client, TARGET)).applied.length, 0);

  const dropped = await resetWarehouse(client, TARGET);
  assert.deepEqual([...dropped], [
    TABLES.readings,
    TABLES.rollup,
    ...RETIRED_TABLES,
    TABLES.migrations,
  ]);
  for (const table of dropped) {
    assert.ok(
      client.statements.some(
        (sql) => sql === `DROP TABLE IF EXISTS ${tableRef(TARGET, table)}`,
      ),
      `${table} was dropped`,
    );
  }

  // The ledger goes with the tables, so a migrate afterwards rebuilds the
  // dataset rather than refusing to run against a half-applied one.
  client.tables.delete(TABLES.migrations);
  assert.equal((await runMigrations(client, TARGET)).applied.length, MIGRATIONS.length);
});

// --- step 8: the read side the screens use -----------------------------------

test("the rollup is read in one query, partition-filtered, for every meter asked for", async () => {
  const client = new FakeWarehouse();
  const fixtures = generateFixtures({ registry, ...WINDOW, intervalMs: 9_000 });
  await client.load(TABLES.rollup, (async function* () {
    for (const bucket of rollupReadings(fixtures.readings)) yield bucketToRow(bucket);
  })());

  const repository = new WarehouseRollupRepository(client, TARGET);
  const meterIds = ["s03m4", "s01m1", "s05m1"] as MeterId[];
  const rows: RollupBucket[] = [];
  for await (const row of repository.bucketsInRange(meterIds, WINDOW)) rows.push(row);

  assert.equal(client.statements.length, 1, "one query, not one per meter");
  const sql = client.statements[0] ?? "";
  assert.match(sql, /DATE\(minute\) BETWEEN DATE\(@from\) AND DATE\(@to\)/);
  assert.match(sql, /meter_id IN UNNEST\(@meterIds\)/);
  assert.match(sql, /ORDER BY meter_id, minute/);
  // Meter-major and ascending, which is the port's contract.
  const keys = rows.map((r) => `${r.meterId}|${r.at.toISOString()}`);
  assert.deepEqual(keys, [...keys].sort());
  assert.deepEqual([...new Set(rows.map((r) => r.meterId))], ["s01m1", "s03m4", "s05m1"]);
  assert.ok(rows.every((r) => r.at instanceof Date && r.readingCount > 0));
});

test("the chart over the stored rollup is the chart over the raw fixtures", async () => {
  // The claim that moving the charts to readings_1m is a change of table and
  // not of arithmetic, checked through the adapter and the JSON round trip.
  const client = new FakeWarehouse();
  const fixtures = generateFixtures({ registry, ...WINDOW, intervalMs: 9_000 });
  await client.load(TABLES.rollup, (async function* () {
    for (const bucket of rollupReadings(fixtures.readings)) yield bucketToRow(bucket);
  })());
  const meterIds = ["s01m1", "s03m4", "s05m1", "s07m5"] as MeterId[];

  const raw = await meterSeries({
    registry,
    repository: new FixtureReadingRepository(fixtures.readings),
    meterIds,
    range: WINDOW,
  });
  const stored = await meterSeries({
    registry,
    repository: new WarehouseRollupRepository(client, TARGET),
    meterIds,
    range: WINDOW,
  });
  stored.series.forEach((series, i) =>
    series.points.forEach((point, j) => {
      const expected = raw.series[i]?.points[j];
      const close = (a: number | null | undefined, b: number | null | undefined) =>
        a === null || b === null || a === undefined || b === undefined
          ? a === b
          : Math.abs(a - b) < 1e-9;
      assert.ok(close(point.activePowerKw, expected?.activePowerKw), `${series.meterId} power at ${j}`);
      assert.ok(close(point.energyConsumedKwh, expected?.energyConsumedKwh), `${series.meterId} energy at ${j}`);
    }),
  );
});

test("History read in batches is History read in one query, row for row", async () => {
  const client = new FakeWarehouse();
  await loadFixtures(client, TARGET, { ...WINDOW, intervalMs: 60_000 });

  const whole = await historyTable({
    registry,
    repository: new WarehouseReadingRepository(client, TARGET),
    range: WINDOW,
  });
  const before = client.statements.length;
  const batched = await historyTable({
    registry,
    // Two hours is 800 rows a meter; a 2 000-row budget puts two meters in a query.
    repository: new WarehouseReadingRepository(client, TARGET, { rowBudget: 2_000 }),
    range: WINDOW,
  });
  assert.equal(client.statements.length - before, Math.ceil(registry.commissioned().length / 2));
  assert.deepEqual(batched.rows, whole.rows);
});

test("a failing batch fails the read", async () => {
  class Failing extends FakeWarehouse {
    override async *stream<Row>(sql: string, params?: QueryParams): AsyncIterable<Row> {
      if ((params?.["meterIds"] as string[]).includes("s01m3")) throw new Error("quota exceeded");
      yield* super.stream<Row>(sql, params);
    }
  }
  const repository = new WarehouseReadingRepository(new Failing(), TARGET, { rowBudget: 800 });
  await assert.rejects(async () => {
    for await (const _ of repository.readingsInRange(
      ["s01m1", "s01m2", "s01m3"] as MeterId[],
      WINDOW,
    )) {
      // drain
    }
  }, /quota exceeded/);
});

test("a rollup read is asked once per minute, however often the screen refreshes", async () => {
  let reads = 0;
  let clock = 0;
  const inner: RollupRepository = {
    async *bucketsInRange() {
      reads += 1;
      yield { meterId: "s01m1" as MeterId, at: new Date(0), readingCount: 1, activePowerKw: 1, energyKwh: 1 };
    },
  };
  const cached = new CachedRollupRepository(inner, { ttlMs: 60_000, now: () => clock });
  const drain = async (range: { from: Date; to: Date }) => {
    const out: RollupBucket[] = [];
    for await (const row of cached.bucketsInRange(["s01m1"] as MeterId[], range)) out.push(row);
    return out;
  };
  const minute = { from: new Date(0), to: new Date(60_000) };

  // Six refreshes ten seconds apart within one minute: one read.
  for (let i = 0; i < 6; i += 1) {
    clock = i * 10_000;
    assert.equal((await drain(minute)).length, 1);
  }
  assert.equal(reads, 1);
  assert.deepEqual(cached.stats(), { hits: 5, misses: 1 });

  // The next minute's window is a new key, and the TTL is the backstop.
  await drain({ from: new Date(60_000), to: new Date(120_000) });
  assert.equal(reads, 2);
  clock = 61_000;
  await drain(minute);
  assert.equal(reads, 3);
});

test("a failed rollup read is not remembered", async () => {
  let reads = 0;
  const inner: RollupRepository = {
    async *bucketsInRange() {
      reads += 1;
      if (reads === 1) throw new Error("transient");
    },
  };
  const cached = new CachedRollupRepository(inner);
  const range = { from: new Date(0), to: new Date(60_000) };
  const drain = async () => {
    for await (const _ of cached.bucketsInRange(["s01m1"] as MeterId[], range)) {
      // drain
    }
  };
  await assert.rejects(drain, /transient/);
  await drain();
  assert.equal(reads, 2);
});

test("cost bills the 10 MB floor, rounds up to the MB, and runs the screens' own reads", async () => {
  assert.equal(billedBytes(0), 10 * 1024 * 1024);
  assert.equal(billedBytes(3.1 * 1024 * 1024), 10 * 1024 * 1024);
  assert.equal(billedBytes(12.2 * 1024 * 1024), 13 * 1024 * 1024);
  assert.equal(percentile([5, 1, 4, 2, 3], 50), 3);
  assert.equal(percentile([...Array(100).keys()].map((i) => i + 1), 95), 95);

  const client = new FakeWarehouse();
  const lines: string[] = [];
  const dryRuns: string[] = [];
  await measureCost({
    client,
    target: TARGET,
    dryRun: async (sql) => {
      dryRuns.push(sql);
      return 3 * 1024 * 1024;
    },
    runs: 2,
    log: (line) => lines.push(line),
  });
  assert.equal(dryRuns.length, 3);
  assert.ok(dryRuns.every((sql) => /DATE\((minute|reading_at)\) BETWEEN/.test(sql)));
  assert.match(lines[0] ?? "", /strip .* bills 10 MB per view/);
  assert.match(lines[2] ?? "", /History .* bills 10 MB per view \(1 query\)/);
  assert.match(lines[3] ?? "", /20 MB a minute per instance -> 0\.82 TiB a month/);
});
