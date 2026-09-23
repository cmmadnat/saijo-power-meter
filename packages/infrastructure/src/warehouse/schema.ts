/**
 * The warehouse's shape: which tables exist, what a row of each one looks like,
 * and how a `Reading` crosses between the two.
 *
 * Nothing here talks to BigQuery. The tables are described as data and the row
 * mapping is pure, which is what lets both be tested on a machine with no
 * credentials — and this session has none by design (see CLAUDE.md). What does
 * talk to BigQuery is `client.ts`, and it is deliberately thin enough that a
 * fake standing in for it in a test is not a lie.
 *
 * Two tables, two different cost shapes:
 *
 * - `readings` — every reading, day-partitioned, 14-day partition expiry.
 *   ~9.7 M rows in steady state and about a gigabyte that never grows.
 * - `readings_1m` — the 1-minute rollup, written in the same batch as raw.
 *   A 14-day chart is ~20 k points per meter here against ~134 k raw.
 *
 * There was a third, `latest`, holding one row per commissioned meter so that
 * a restarting ingester did not begin blind. It is gone as of step 8c: 55 rows
 * rewritten every 30 s is 2 880 table modifications a day against a standard
 * table's hard cap of 1 500, so the restart state moved to a single Firestore
 * document (`src/firestore/latest-store.ts`). `RETIRED_TABLES` below is what is
 * left of it — the name, so a dataset that still carries the table can be
 * cleaned up. Migration 0002 drops it.
 */

import type { RollupBucket } from "@power-meter/application";
import type { MeterId, Reading } from "@power-meter/domain";

/** The dataset the tables live in. Created by Pulumi; see infra/index.ts. */
export const DEFAULT_DATASET = "power_meter";

/** Raw and rollup partitions are dropped at this age. Retention is a setting, not a job. */
export const RETENTION_DAYS = 14;

export const TABLES = {
  readings: "readings",
  rollup: "readings_1m",
  migrations: "schema_migrations",
} as const;

/**
 * Tables this code used to own and no longer creates.
 *
 * Migration 0002 drops `latest` on every dataset that has it, which covers the
 * deployed project. This list is for `reset`, which drops what it knows about
 * before `migrate` recreates it: without the name here, a reset of a dataset
 * migrated before 0002 would leave the retired table standing.
 */
export const RETIRED_TABLES = ["latest"] as const;

export type TableName = (typeof TABLES)[keyof typeof TABLES];

/** Where the tables are. `projectId` is optional: the client has a default. */
export interface WarehouseTarget {
  readonly projectId?: string;
  readonly dataset: string;
}

const IDENTIFIER = /^[A-Za-z0-9_]{1,1024}$/;
const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,61}[A-Za-z0-9]$/;

/**
 * A backtick-quoted table reference.
 *
 * Table names cannot be query parameters, so they reach the SQL by
 * interpolation and this is the only thing standing between a configuration
 * value and an injected statement. It rejects rather than escapes: every name
 * that belongs here is already `[A-Za-z0-9_]`, so anything else is a mistake
 * worth failing on rather than quoting around.
 */
export function tableRef(target: WarehouseTarget, table: string): string {
  if (!IDENTIFIER.test(target.dataset)) {
    throw new Error(`invalid dataset name: ${JSON.stringify(target.dataset)}`);
  }
  if (!IDENTIFIER.test(table)) {
    throw new Error(`invalid table name: ${JSON.stringify(table)}`);
  }
  if (target.projectId === undefined) return `\`${target.dataset}.${table}\``;
  return `\`${validProjectId(target.projectId)}.${target.dataset}.${table}\``;
}

function validProjectId(projectId: string): string {
  if (!PROJECT_ID.test(projectId)) {
    throw new Error(`invalid project id: ${JSON.stringify(projectId)}`);
  }
  return projectId;
}

/**
 * A reference to one of the dataset's INFORMATION_SCHEMA views.
 *
 * Quoted as a single path rather than as a table inside the dataset, because
 * that is the form BigQuery accepts: the view is a member of the dataset's
 * schema namespace, not a table in it.
 */
export function informationSchemaRef(
  target: WarehouseTarget,
  view: string,
): string {
  if (!IDENTIFIER.test(target.dataset)) {
    throw new Error(`invalid dataset name: ${JSON.stringify(target.dataset)}`);
  }
  if (!IDENTIFIER.test(view)) {
    throw new Error(`invalid view name: ${JSON.stringify(view)}`);
  }
  const prefix =
    target.projectId === undefined ? "" : `${validProjectId(target.projectId)}.`;
  return `\`${prefix}${target.dataset}.INFORMATION_SCHEMA.${view}\``;
}

// --- rows --------------------------------------------------------------------

/** A row of `readings`, as BigQuery stores it. Column names are snake_case. */
export interface ReadingRow {
  readonly meter_id: string;
  /**
   * When the reading was received.
   *
   * Not `at`: `AT` is a reserved keyword in GoogleSQL, so a column of that name
   * has to be backtick-quoted in every statement that touches it — the DDL, the
   * partition expression, every select list and every predicate. One of those
   * gets forgotten eventually. The name carries the awkwardness instead.
   */
  readonly reading_at: string;
  readonly voltage_l1: number;
  readonly voltage_l2: number;
  readonly voltage_l3: number;
  readonly current_l1: number;
  readonly current_l2: number;
  readonly current_l3: number;
  readonly active_power_kw: number;
  readonly power_factor: number;
  readonly energy_kwh: number;
  /**
   * When the ingester wrote it, as against `at`, when the reading was received.
   * The two differ by the ingester's buffer, and the gap between them is how a
   * late or replayed batch is told from a live one after the fact.
   */
  readonly ingested_at: string;
}

/** A row of `readings_1m`. `minute` is the bucket start, aligned to absolute time. */
export interface RollupRow {
  readonly meter_id: string;
  readonly minute: string;
  readonly reading_count: number;
  readonly active_power_kw: number;
  readonly energy_kwh: number;
}

/**
 * BigQuery's JSON load format wants a timestamp as a string, and hands one back
 * from a query wrapped in a `{ value }` object. Both directions live here so no
 * caller has to know which of the three shapes it is holding.
 */
export function toTimestamp(at: Date): string {
  return at.toISOString();
}

export function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value * 1000);
  if (typeof value === "string") return new Date(value);
  if (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    typeof (value as { value: unknown }).value === "string"
  ) {
    // What the BigQuery client returns for a TIMESTAMP column.
    return new Date((value as { value: string }).value);
  }
  throw new TypeError(`not a timestamp: ${JSON.stringify(value)}`);
}

function number(value: unknown, column: string): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
    throw new TypeError(`column ${column} is not a number: ${JSON.stringify(value)}`);
  }
  return parsed;
}

/** The `readings` columns a query must select to rebuild a `Reading`, in order. */
export const READING_COLUMNS = [
  "meter_id",
  "reading_at",
  "voltage_l1",
  "voltage_l2",
  "voltage_l3",
  "current_l1",
  "current_l2",
  "current_l3",
  "active_power_kw",
  "power_factor",
  "energy_kwh",
] as const;

export function readingToRow(reading: Reading, ingestedAt: Date): ReadingRow {
  return {
    meter_id: reading.meterId,
    reading_at: toTimestamp(reading.at),
    voltage_l1: reading.voltage.l1,
    voltage_l2: reading.voltage.l2,
    voltage_l3: reading.voltage.l3,
    current_l1: reading.current.l1,
    current_l2: reading.current.l2,
    current_l3: reading.current.l3,
    active_power_kw: reading.activePowerKw,
    power_factor: reading.powerFactor,
    energy_kwh: reading.energyKwh,
    ingested_at: toTimestamp(ingestedAt),
  };
}

export function rowToReading(row: Record<string, unknown>): Reading {
  if (typeof row["meter_id"] !== "string") {
    throw new TypeError(`row has no meter_id: ${JSON.stringify(row)}`);
  }
  return {
    meterId: row["meter_id"] as MeterId,
    at: toDate(row["reading_at"]),
    voltage: {
      l1: number(row["voltage_l1"], "voltage_l1"),
      l2: number(row["voltage_l2"], "voltage_l2"),
      l3: number(row["voltage_l3"], "voltage_l3"),
    },
    current: {
      l1: number(row["current_l1"], "current_l1"),
      l2: number(row["current_l2"], "current_l2"),
      l3: number(row["current_l3"], "current_l3"),
    },
    activePowerKw: number(row["active_power_kw"], "active_power_kw"),
    powerFactor: number(row["power_factor"], "power_factor"),
    energyKwh: number(row["energy_kwh"], "energy_kwh"),
  };
}

/** The `readings_1m` columns a query selects to rebuild a `RollupBucket`. */
export const ROLLUP_COLUMNS = [
  "meter_id",
  "minute",
  "reading_count",
  "active_power_kw",
  "energy_kwh",
] as const;

export function rowToBucket(row: Record<string, unknown>): RollupBucket {
  if (typeof row["meter_id"] !== "string") {
    throw new TypeError(`row has no meter_id: ${JSON.stringify(row)}`);
  }
  return {
    meterId: row["meter_id"] as MeterId,
    at: toDate(row["minute"]),
    readingCount: number(row["reading_count"], "reading_count"),
    activePowerKw: number(row["active_power_kw"], "active_power_kw"),
    energyKwh: number(row["energy_kwh"], "energy_kwh"),
  };
}

export function bucketToRow(bucket: RollupBucket): RollupRow {
  return {
    meter_id: bucket.meterId,
    minute: toTimestamp(bucket.at),
    reading_count: bucket.readingCount,
    active_power_kw: bucket.activePowerKw,
    energy_kwh: bucket.energyKwh,
  };
}

/**
 * A row as the Storage Write API wants it, rather than as a load job wants it.
 *
 * The one difference is timestamps. A load job is fed newline-delimited JSON,
 * where a TIMESTAMP is an ISO string; the Storage Write API encodes each row
 * into protobuf against the table's schema, where a TIMESTAMP is an int64 of
 * microseconds — and the JSON writer's encoder produces that from a `Date`.
 * Hand it the string instead and protobuf tries to read "2026-09-23T..." as a
 * number, which fails deep inside the encoder with nothing naming the column.
 *
 * So the two mappings are one mapping with the timestamps swapped, and the
 * tests assert exactly that rather than restating every field.
 */
export type StreamRow = Record<string, string | number | Date>;

function withDateTimestamps(row: ReadingRow | RollupRow): StreamRow {
  const out: StreamRow = {};
  for (const [column, value] of Object.entries(row) as [string, string | number][]) {
    out[column] =
      typeof value === "string" && TIMESTAMP_COLUMNS.has(column)
        ? new Date(value)
        : value;
  }
  return out;
}

/** The TIMESTAMP columns of the two written tables. */
const TIMESTAMP_COLUMNS = new Set(["reading_at", "ingested_at", "minute"]);

export function readingToStreamRow(reading: Reading, ingestedAt: Date): StreamRow {
  return withDateTimestamps(readingToRow(reading, ingestedAt));
}

export function bucketToStreamRow(bucket: RollupBucket): StreamRow {
  return withDateTimestamps(bucketToRow(bucket));
}
