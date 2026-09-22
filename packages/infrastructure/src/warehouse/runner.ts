/**
 * Applying the migrations.
 *
 * The runner is the thing that makes "versioned, ordered, idempotent" true
 * rather than aspirational. It records what it applied, refuses to run against
 * a database that disagrees with the code, and — because every statement is
 * idempotent — is safe to run twice, which is exactly the check the plan asks
 * for: a second run applies nothing and changes nothing.
 *
 * BigQuery has no transaction spanning DDL, so there is no way to make the
 * statements and the row recording them atomic. The failure that leaves is a
 * run that dies after the last statement and before the record: the next run
 * re-applies that migration, every statement no-ops, and the record is written.
 * That is why idempotence is a rule here and not a preference.
 */
import type { QueryParams, WarehouseClient } from "./client.ts";
import {
  checksum,
  MIGRATIONS,
  render,
  validate,
  type Migration,
} from "./migrations.ts";
import {
  informationSchemaRef,
  TABLES,
  tableRef,
  type WarehouseTarget,
} from "./schema.ts";

export interface AppliedMigration {
  readonly version: string;
  readonly name: string;
  readonly checksum: string;
}

export interface MigrationOutcome {
  /** Migrations this run applied, in order. Empty on a second run. */
  readonly applied: readonly AppliedMigration[];
  /** Migrations already recorded when the run began. */
  readonly alreadyApplied: readonly AppliedMigration[];
}

/**
 * The ledger table, created outside the migration list because something has to
 * exist before the list can be consulted. Its own DDL is idempotent for the
 * same reason everything else's is.
 */
function ledgerDdl(target: WarehouseTarget): string {
  return `CREATE TABLE IF NOT EXISTS ${tableRef(target, TABLES.migrations)} (
  version STRING NOT NULL,
  name STRING NOT NULL,
  checksum STRING NOT NULL OPTIONS (description = "SHA-256 of the migration's statements. A mismatch means an applied migration was edited."),
  applied_at TIMESTAMP NOT NULL,
  duration_ms INT64 NOT NULL
)
OPTIONS (description = "Which migrations this dataset has had applied. Written by packages/infrastructure/src/warehouse/runner.ts.")`;
}

export interface RunMigrationsOptions {
  readonly migrations?: readonly Migration[];
  /** Logs each statement instead of running it. Nothing is written. */
  readonly dryRun?: boolean;
  readonly onProgress?: (message: string) => void;
}

export async function runMigrations(
  client: WarehouseClient,
  target: WarehouseTarget,
  options: RunMigrationsOptions = {},
): Promise<MigrationOutcome> {
  const migrations = options.migrations ?? MIGRATIONS;
  const report = options.onProgress ?? (() => {});
  validate(migrations);

  await client.query(ledgerDdl(target));

  const recorded = await client.query<AppliedMigration>(
    `SELECT version, name, checksum FROM ${tableRef(target, TABLES.migrations)} ORDER BY version`,
  );
  const byVersion = new Map(recorded.map((row) => [row.version, row]));

  // Drift, both ways round. An edited migration and a database ahead of the
  // code are different mistakes with the same cure — stop before writing.
  for (const migration of migrations) {
    const applied = byVersion.get(migration.version);
    if (applied === undefined) continue;
    const expected = checksum(migration);
    if (applied.checksum !== expected) {
      throw new Error(
        `migration ${migration.version} (${migration.name}) has changed since it was applied ` +
          `(recorded ${applied.checksum.slice(0, 12)}, now ${expected.slice(0, 12)}). ` +
          `An applied migration is history: add a new one instead of editing it.`,
      );
    }
  }
  const known = new Set(migrations.map((migration) => migration.version));
  for (const version of byVersion.keys()) {
    if (!known.has(version)) {
      throw new Error(
        `the dataset has migration ${version} applied and this code does not know it. ` +
          `The database is ahead of the checkout; deploy the newer code rather than migrating back.`,
      );
    }
  }

  const applied: AppliedMigration[] = [];
  for (const migration of migrations) {
    if (byVersion.has(migration.version)) continue;

    report(`applying ${migration.version} ${migration.name}`);
    const startedAt = Date.now();
    for (const statement of render(migration, target)) {
      if (options.dryRun) {
        report(statement);
        continue;
      }
      await client.query(statement);
    }
    if (options.dryRun) continue;

    const record = {
      version: migration.version,
      name: migration.name,
      checksum: checksum(migration),
    };
    await client.query(
      `INSERT INTO ${tableRef(target, TABLES.migrations)} (version, name, checksum, applied_at, duration_ms)
       VALUES (@version, @name, @checksum, CURRENT_TIMESTAMP(), @durationMs)`,
      { ...record, durationMs: Date.now() - startedAt } satisfies QueryParams,
    );
    applied.push(record);
  }

  return { applied, alreadyApplied: recorded };
}

export interface PartitionSetting {
  readonly table: string;
  readonly expirationDays: number | null;
  readonly requirePartitionFilter: boolean;
}

/**
 * What the dataset actually says about retention, read back rather than assumed.
 *
 * "Partition expiry is set, not assumed" is one of the plan's verification
 * items, and the only way to satisfy it is to ask the database. A table created
 * without the option looks identical from the DDL that was *meant* to be run.
 */
export async function partitionSettings(
  client: WarehouseClient,
  target: WarehouseTarget,
): Promise<PartitionSetting[]> {
  // Driven from TABLES rather than TABLE_OPTIONS, so a table that carries
  // neither option is reported as having neither. Selecting only the options
  // makes such a table absent from the result, and "absent" is indistinguishable
  // from "does not exist" — which is exactly the wrong thing to be vague about
  // in the one command whose job is to confirm retention really is set.
  const rows = await client.query<{
    table_name: string;
    option_name: string | null;
    option_value: string | null;
  }>(
    `SELECT t.table_name, o.option_name, o.option_value
     FROM ${informationSchemaRef(target, "TABLES")} AS t
     LEFT JOIN ${informationSchemaRef(target, "TABLE_OPTIONS")} AS o
       ON o.table_name = t.table_name
      AND o.option_name IN ('partition_expiration_days', 'require_partition_filter')
     ORDER BY t.table_name`,
  );

  const byTable = new Map<string, PartitionSetting>();
  for (const row of rows) {
    const current = byTable.get(row.table_name) ?? {
      table: row.table_name,
      expirationDays: null,
      requirePartitionFilter: false,
    };
    byTable.set(row.table_name, {
      ...current,
      expirationDays:
        row.option_name === "partition_expiration_days"
          ? Number(row.option_value)
          : current.expirationDays,
      requirePartitionFilter:
        row.option_name === "require_partition_filter"
          ? (row.option_value ?? "").toUpperCase() === "TRUE"
          : current.requirePartitionFilter,
    });
  }
  return [...byTable.values()].sort((a, b) => a.table.localeCompare(b.table));
}

/**
 * Drop every table this code owns, ledger included.
 *
 * It exists because of one specific hazard and not as a convenience. The
 * fixture loader writes synthetic readings into the same three tables the
 * ingester writes real ones into, and nothing in a row says which it is: a
 * `load` run to exercise the adapter leaves data that reads exactly like
 * measurement for the fourteen days its partitions live. So the rule is that
 * the dataset is emptied before the first real reading is written, and this is
 * the command that does it — followed by `migrate`, which recreates the tables
 * from the same migrations and re-records them.
 *
 * The ledger goes with them. Dropping the tables while keeping the record that
 * says they were created is precisely the drift the runner refuses to run
 * through, so the reset leaves a dataset that looks untouched rather than one
 * that looks half-applied.
 *
 * Nothing calls this from the pipeline, and nothing should: it is a
 * hand-run command, and after go-live it destroys history that cannot be
 * recovered from anywhere.
 */
export async function resetWarehouse(
  client: WarehouseClient,
  target: WarehouseTarget,
  options: { readonly onProgress?: (message: string) => void } = {},
): Promise<readonly string[]> {
  const report = options.onProgress ?? (() => {});
  const dropped: string[] = [];
  for (const table of [
    TABLES.readings,
    TABLES.rollup,
    TABLES.latest,
    TABLES.migrations,
  ]) {
    report(`dropping ${table}`);
    await client.query(`DROP TABLE IF EXISTS ${tableRef(target, table)}`);
    dropped.push(table);
  }
  return dropped;
}
