/**
 * The schema, as an ordered list of migrations.
 *
 * Versioned, ordered and idempotent, which CLAUDE.md asks for and which each
 * mean something specific here:
 *
 * - **Versioned.** Every migration carries a four-digit version and a checksum
 *   of its own text. A migration already applied to a database may never be
 *   edited: the runner compares checksums and refuses to go on when one has
 *   changed, because the alternative is a database whose shape does not match
 *   the code that believes it made it.
 * - **Ordered.** Versions are contiguous from 0001 and applied ascending.
 * - **Idempotent.** Every statement is `CREATE ... IF NOT EXISTS` or an `ALTER`
 *   that states a end state rather than a change. BigQuery has no transaction
 *   spanning DDL, so a run that dies between its last statement and the row
 *   recording it will re-run that migration, and that has to be harmless rather
 *   than merely unlikely.
 *
 * The dataset is not created here. It is a Google Cloud resource, so it is
 * declared in `infra/` with everything else and the runner expects to find it.
 * Tables are schema, not infrastructure, and they live here — that is the line,
 * and it is the same one that puts the state bucket in bootstrap.sh and
 * everything else in the Pulumi program.
 *
 * `{{dataset}}` is substituted at apply time. The checksum covers the template,
 * not the rendered SQL, so the same migration against a second project is the
 * same migration.
 */
import { createHash } from "node:crypto";
import { RETENTION_DAYS, TABLES, tableRef, type WarehouseTarget } from "./schema.ts";

export interface Migration {
  /** Four digits, contiguous from 0001. */
  readonly version: string;
  readonly name: string;
  /** Statements in order. `{{dataset}}` is replaced with a qualified reference. */
  readonly statements: readonly string[];
}

/** The reading columns, shared by `readings` and `latest`. */
const READING_COLUMNS = `
  meter_id STRING NOT NULL OPTIONS (description = "Stable id from the meter registry, s<station>m<slot>."),
  at TIMESTAMP NOT NULL OPTIONS (description = "When the reading was received. UTC; rendered in Asia/Bangkok."),
  voltage_l1 FLOAT64 NOT NULL,
  voltage_l2 FLOAT64 NOT NULL,
  voltage_l3 FLOAT64 NOT NULL,
  current_l1 FLOAT64 NOT NULL,
  current_l2 FLOAT64 NOT NULL,
  current_l3 FLOAT64 NOT NULL,
  active_power_kw FLOAT64 NOT NULL,
  power_factor FLOAT64 NOT NULL,
  energy_kwh FLOAT64 NOT NULL OPTIONS (description = "Cumulative counter, kWh. Falls on a meter replacement or register rollover."),
  ingested_at TIMESTAMP NOT NULL OPTIONS (description = "When the ingester wrote the row, as against when the reading was received.")`;

export const MIGRATIONS: readonly Migration[] = [
  {
    version: "0001",
    name: "readings, 1-minute rollup and latest",
    statements: [
      `CREATE TABLE IF NOT EXISTS {{dataset}}.${TABLES.readings} (${READING_COLUMNS}
)
PARTITION BY DATE(at)
CLUSTER BY meter_id
OPTIONS (
  partition_expiration_days = ${RETENTION_DAYS},
  require_partition_filter = TRUE,
  description = "Every meter reading, in engineering units. ~691k rows/day; partitions expire at ${RETENTION_DAYS} days, which is the whole retention policy."
)`,

      `CREATE TABLE IF NOT EXISTS {{dataset}}.${TABLES.rollup} (
  meter_id STRING NOT NULL,
  minute TIMESTAMP NOT NULL OPTIONS (description = "Bucket start, floored to the absolute minute — not to any window's start."),
  reading_count INT64 NOT NULL OPTIONS (description = "Raw readings behind the bucket. A minute with none is absent, not zero."),
  active_power_kw FLOAT64 NOT NULL OPTIONS (description = "Mean across the bucket: active power is a rate."),
  energy_kwh FLOAT64 NOT NULL OPTIONS (description = "The bucket's last counter reading: energy is a counter, and averaging one invents a reading.")
)
PARTITION BY DATE(minute)
CLUSTER BY meter_id
OPTIONS (
  partition_expiration_days = ${RETENTION_DAYS},
  require_partition_filter = TRUE,
  description = "1-minute rollup, written in the same batch as raw. Produced by rollupReadings() in packages/application, which is also what the charts bucket by."
)`,

      `CREATE TABLE IF NOT EXISTS {{dataset}}.${TABLES.latest} (${READING_COLUMNS},
  updated_at TIMESTAMP NOT NULL
)
CLUSTER BY meter_id
OPTIONS (
  description = "One row per commissioned meter. Not the real-time screen's source — the ingester serves that from memory. This exists so a restart does not begin blind."
)`,
    ],
  },
];

/** The statements of a migration, with the dataset filled in. */
export function render(
  migration: Migration,
  target: WarehouseTarget,
): readonly string[] {
  return migration.statements.map((statement) =>
    statement.replaceAll(/\{\{dataset\}\}\.([A-Za-z0-9_]+)/g, (_, table: string) =>
      tableRef(target, table),
    ),
  );
}

/**
 * A migration's identity, independent of which project it is applied to.
 *
 * Over the template text, so rendering against a different dataset does not
 * read as a different migration — the point of the checksum is to catch an
 * edit, not a deployment.
 */
export function checksum(migration: Migration): string {
  const hash = createHash("sha256");
  hash.update(migration.version);
  hash.update("\u0000");
  for (const statement of migration.statements) {
    hash.update(statement);
    hash.update("\u0000");
  }
  return hash.digest("hex");
}

/**
 * Fails on a list that could not be applied deterministically.
 *
 * Duplicates and gaps are both the same mistake — two branches each adding
 * "the next" migration — and both produce a database whose state depends on
 * which order the merges happened in. Cheaper to fail here, in a unit test,
 * than against a project.
 */
export function validate(migrations: readonly Migration[] = MIGRATIONS): void {
  const seen = new Set<string>();
  migrations.forEach((migration, index) => {
    if (!/^\d{4}$/.test(migration.version)) {
      throw new Error(`migration version must be four digits: ${migration.version}`);
    }
    if (seen.has(migration.version)) {
      throw new Error(`duplicate migration version ${migration.version}`);
    }
    seen.add(migration.version);

    const expected = String(index + 1).padStart(4, "0");
    if (migration.version !== expected) {
      throw new Error(
        `migrations must be contiguous from 0001: expected ${expected}, found ${migration.version}`,
      );
    }
    if (migration.statements.length === 0) {
      throw new Error(`migration ${migration.version} has no statements`);
    }
  });
}
