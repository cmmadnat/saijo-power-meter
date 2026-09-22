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
 * Three tables, three different cost shapes:
 *
 * - `readings` — every reading, day-partitioned, 14-day partition expiry.
 *   ~9.7 M rows in steady state and about a gigabyte that never grows.
 * - `readings_1m` — the 1-minute rollup, written in the same batch as raw.
 *   A 14-day chart is ~20 k points per meter here against ~134 k raw.
 * - `latest` — 55 rows, one per commissioned meter, unpartitioned and never
 *   expired. This is *not* the real-time screen's data source: the ingester
 *   holds that in memory and serves it, because paying per write for a value
 *   obsolete a second later costs more per month than all the history. This
 *   table exists so that a restart does not begin blind.
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
  latest: "latest",
  migrations: "schema_migrations",
} as const;

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

/** A row of `latest`: a reading, plus when this table last heard about it. */
export interface LatestRow extends ReadingRow {
  readonly updated_at: string;
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

export function bucketToRow(bucket: RollupBucket): RollupRow {
  return {
    meter_id: bucket.meterId,
    minute: toTimestamp(bucket.at),
    reading_count: bucket.readingCount,
    active_power_kw: bucket.activePowerKw,
    energy_kwh: bucket.energyKwh,
  };
}

export function latestToRow(reading: Reading, updatedAt: Date): LatestRow {
  return { ...readingToRow(reading, updatedAt), updated_at: toTimestamp(updatedAt) };
}
