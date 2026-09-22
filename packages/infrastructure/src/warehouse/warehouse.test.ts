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
import { MeterRegistry, type MeterId } from "@power-meter/domain";
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
  WarehouseLatestReadingStore,
  WarehouseReadingRepository,
} from "./repository.ts";
import { runMigrations } from "./runner.ts";
import {
  readingToRow,
  rowToReading,
  RETENTION_DAYS,
  TABLES,
  tableRef,
  toDate,
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
    if (sql.includes(tableRef(TARGET, TABLES.latest))) {
      return this.rows(TABLES.latest).map((row) => wrap(row)) as Row[];
    }
    return [] as Row[];
  }

  async *stream<Row>(sql: string, params?: QueryParams): AsyncIterable<Row> {
    this.statements.push(sql);
    if (!sql.includes(tableRef(TARGET, TABLES.readings))) return;

    const from = (params?.["from"] as Date).getTime();
    const to = (params?.["to"] as Date).getTime();
    const matching = this.rows(TABLES.readings)
      .filter((row) => row["meter_id"] === params?.["meterId"])
      .filter((row) => {
        const at = new Date(row["at"] as string).getTime();
        return at >= from && at < to;
      })
      .sort(
        (a, b) =>
          new Date(a["at"] as string).getTime() -
          new Date(b["at"] as string).getTime(),
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

  async replace(table: string, rows: AsyncIterable<object>): Promise<number> {
    this.tables.set(table, []);
    return this.load(table, rows);
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
      (key === "at" || key.endsWith("_at") || key === "minute") &&
      typeof value === "string"
        ? { value }
        : value;
  }
  return out;
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
        /^CREATE (TABLE|VIEW|OR REPLACE VIEW) IF NOT EXISTS|^CREATE OR REPLACE /,
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
  // `latest` is 55 rows that must never expire, and is not partitioned at all.
  const latest = ddl.find((sql) => sql.includes(`{{dataset}}.${TABLES.latest}`));
  assert.ok(latest);
  assert.doesNotMatch(latest, /partition_expiration_days|PARTITION BY/);
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

  assert.equal(client.statements.length, 2, "one query per meter");
  for (const sql of client.statements) {
    assert.match(sql, /DATE\(at\) BETWEEN DATE\(@from\) AND DATE\(@to\)/);
    assert.match(sql, /ORDER BY at/);
  }
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

test("the loader writes raw, rollup and one latest row per meter", async () => {
  const client = new FakeWarehouse();
  const report = await loadFixtures(client, TARGET, {
    ...WINDOW,
    intervalMs: 60_000,
    ingestedAt: new Date("2025-09-21T03:00:01.000Z"),
  });

  assert.equal(report.latestRows, registry.commissioned().length);
  assert.ok(report.readings > 0);
  // One reading a minute for two hours, so raw and rollup are the same size —
  // which is the cheapest way to see that the rollup covers the whole window.
  assert.equal(report.rollupRows, report.readings);

  const latest = await new WarehouseLatestReadingStore(client, TARGET).latest();
  assert.equal(latest.size, registry.commissioned().length);

  // A second load replaces `latest` rather than doubling it.
  await loadFixtures(client, TARGET, { ...WINDOW, intervalMs: 60_000 });
  assert.equal(client.rows(TABLES.latest).length, registry.commissioned().length);
});

test("History over the warehouse matches History over the fixtures, row for row", async () => {
  const client = new FakeWarehouse();
  const options = { ...WINDOW, intervalMs: 60_000 };
  await loadFixtures(client, TARGET, options);

  const verification = await verifyAgainstFixtures(client, TARGET, options);
  assert.equal(verification.rows, registry.commissioned().length);
  assert.deepEqual(verification.mismatches, []);
});
