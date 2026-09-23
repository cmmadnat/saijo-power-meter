/**
 * The warehouse commands, as one small CLI.
 *
 *     npm run warehouse --workspace @power-meter/infrastructure -- sql
 *     npm run warehouse --workspace @power-meter/infrastructure -- migrate
 *     npm run warehouse --workspace @power-meter/infrastructure -- migrate --dry-run
 *     npm run warehouse --workspace @power-meter/infrastructure -- load --hours 24
 *     npm run warehouse --workspace @power-meter/infrastructure -- verify --hours 24
 *     npm run warehouse --workspace @power-meter/infrastructure -- settings
 *     npm run warehouse --workspace @power-meter/infrastructure -- reset --yes
 *     npm run warehouse --workspace @power-meter/infrastructure -- cost --runs 20
 *     npm run warehouse --workspace @power-meter/infrastructure -- soak --dataset scratch
 *
 * `sql` renders the migrations and prints them, touching nothing — it is the
 * one command that runs without credentials, and this session has none by
 * design. Everything the others are made of is unit-tested against a fake
 * client; what stays untested until a project exists is the SDK wrapper and
 * BigQuery's opinion of the SQL. `migrate --dry-run` is not that check: it
 * connects, reads the ledger and prints what it *would* apply.
 */
import process from "node:process";
import { bigQueryClient, dryRunBytes } from "./client.ts";
import { measureCost } from "./cost.ts";
import { loadFixtures, verifyAgainstFixtures } from "./loader.ts";
import { MIGRATIONS, render } from "./migrations.ts";
import { partitionSettings, resetWarehouse, runMigrations } from "./runner.ts";
import { soak } from "./soak.ts";
import { storageWriteStream } from "./stream.ts";
import { DEFAULT_DATASET, RETENTION_DAYS, type WarehouseTarget } from "./schema.ts";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1] ?? "";
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/**
 * BigQuery says "Not found: Dataset <project>:<dataset>" and there is no code
 * on the error worth matching, so the message is what there is. Narrow on both
 * halves so an unrelated 404 — a missing table, say — is not swallowed as a
 * missing dataset.
 */
function isMissingDataset(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /not found/i.test(message) && /dataset/i.test(message);
}

const command = process.argv[2];
const projectId = flag("project") ?? process.env["GOOGLE_PROJECT"];
const target: WarehouseTarget = {
  ...(projectId === undefined ? {} : { projectId }),
  dataset: flag("dataset") ?? process.env["WAREHOUSE_DATASET"] ?? DEFAULT_DATASET,
};
const location = flag("location") ?? process.env["WAREHOUSE_LOCATION"] ?? "asia-southeast1";
const hours = Number(flag("hours") ?? "24");

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

/**
 * The window to generate fixtures for.
 *
 * `--from` and `--to` exist because `load` and `verify` have to agree on it
 * exactly. Fixture load is a function of absolute time, so the same window
 * yields the same readings on either side — but a window that ends at "now"
 * ends at a different instant in each command, and `verify` would compare a
 * table written minutes ago against fixtures generated up to this second, then
 * report every meter as short. That reads like a broken adapter and is not one.
 *
 * So `--hours` stays the convenient default for `load`, which prints the exact
 * window it used, and `verify` is handed that window back.
 */
function window(): { from: Date; to: Date } {
  const fromFlag = flag("from");
  const toFlag = flag("to");
  if (fromFlag !== undefined && toFlag !== undefined) {
    const from = new Date(fromFlag);
    const to = new Date(toFlag);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new RangeError(
        `--from and --to must be timestamps: ${fromFlag} ${toFlag}`,
      );
    }
    return { from, to };
  }
  if (fromFlag !== undefined || toFlag !== undefined) {
    throw new RangeError("--from and --to go together, or neither");
  }
  const to = new Date();
  return { from: new Date(to.getTime() - hours * 3_600_000), to };
}

async function connect() {
  return bigQueryClient({ ...target, location });
}

switch (command) {
  case "sql": {
    // The only command that needs nothing. Renders every migration against the
    // target so the DDL can be read, diffed and pasted into a console by hand.
    for (const migration of MIGRATIONS) {
      log(`-- ${migration.version} ${migration.name}`);
      for (const statement of render(migration, target)) log(`${statement};\n`);
    }
    break;
  }

  case "migrate": {
    // `--skip-if-no-dataset` is for the pipeline and nowhere else. The dataset
    // is a Pulumi resource and the tables are migrations, so on a project whose
    // stack has never been applied the migrate step runs before the thing it
    // migrates exists. Failing there would mean a first apply could never
    // succeed; skipping means the run that creates the dataset does not
    // migrate, and the next build does. See ci/migrate.sh.
    let outcome;
    try {
      outcome = await runMigrations(await connect(), target, {
        dryRun: has("dry-run"),
        onProgress: log,
      });
    } catch (error) {
      if (has("skip-if-no-dataset") && isMissingDataset(error)) {
        log(
          `dataset ${target.dataset} does not exist yet — nothing to migrate. ` +
            "Pulumi creates it; the next run applies the migrations.",
        );
        break;
      }
      throw error;
    }
    log(
      outcome.applied.length === 0
        ? `nothing to apply; ${outcome.alreadyApplied.length} migration(s) already recorded`
        : `applied ${outcome.applied.length} migration(s)`,
    );
    break;
  }

  case "load": {
    const report = await loadFixtures(await connect(), target, {
      ...window(),
      onProgress: log,
    });
    log(`loaded ${report.readings} readings and ${report.rollupRows} rollup rows`);
    // The window, in the form verify needs it back. Anything else compares this
    // table against fixtures generated for a different window.
    log(
      `verify it with:\n  npm run warehouse -w @power-meter/infrastructure -- ` +
        `verify --from ${report.from.toISOString()} --to ${report.to.toISOString()}`,
    );
    break;
  }

  case "verify": {
    const verification = await verifyAgainstFixtures(await connect(), target, window());
    if (verification.mismatches.length === 0) {
      log(`${verification.rows} history rows match the fixtures exactly`);
      break;
    }
    for (const mismatch of verification.mismatches.slice(0, 20)) {
      log(
        `${mismatch.meterId} ${mismatch.field}: expected ${mismatch.expected}, got ${mismatch.actual}`,
      );
    }
    log(`${verification.mismatches.length} mismatch(es)`);
    process.exitCode = 1;
    break;
  }

  case "reset": {
    // Destructive and deliberately awkward. Its whole reason for existing is
    // the fixture rows: `load` writes synthetic readings into the same tables
    // the ingester writes real ones into, and no column tells them apart, so
    // the dataset is emptied before the first real reading is written. After
    // go-live this drops history that exists nowhere else.
    if (!has("yes")) {
      log(
        `refusing to drop every table in ${target.dataset}` +
          `${target.projectId === undefined ? "" : ` (project ${target.projectId})`}. ` +
          "Re-run with --yes if that is what you mean, then run migrate.",
      );
      process.exitCode = 1;
      break;
    }
    const dropped = await resetWarehouse(await connect(), target, { onProgress: log });
    log(`dropped ${dropped.length} table(s); run migrate to recreate them`);
    break;
  }

  case "settings": {
    for (const setting of await partitionSettings(await connect(), target)) {
      log(
        `${setting.table}: expiry ${setting.expirationDays ?? "none"} day(s), ` +
          `partition filter ${setting.requirePartitionFilter ? "required" : "optional"}`,
      );
    }
    log(`retention policy in code is ${RETENTION_DAYS} days`);
    break;
  }

  case "soak": {
    // Step 8c's verification, and the one thing about the new write path that
    // no test on this machine can show: that a table takes far more writes a
    // day through the Storage Write API than the 1 500 modifications a load job
    // would have been counted against.
    //
    // It writes the ingester's own batch shape through the ingester's own
    // writer — same rows, same two tables, same one call — as fast as
    // `--interval` says, because the limit being disproved is per *day* and
    // crossing it in an hour is a stronger result than crossing it in
    // thirteen. Nothing here touches a broker, and the rows are fixtures.
    //
    // It refuses to run against the production dataset. `power_meter` holds
    // real readings after go-live and step 6's fixtures before it; a soak's
    // rows would be indistinguishable from both.
    if (target.dataset === DEFAULT_DATASET) {
      log(
        `refusing to soak ${DEFAULT_DATASET}: its rows are indistinguishable from ` +
          "the ingester's. Make a scratch dataset and pass --dataset.",
      );
      process.exitCode = 1;
      break;
    }
    if (projectId === undefined) {
      log("soak needs --project or GOOGLE_PROJECT: a write stream is named by a full path");
      process.exitCode = 1;
      break;
    }
    const outcome = await soak({
      stream: await storageWriteStream({ projectId, dataset: target.dataset }),
      cycles: Number(flag("cycles") ?? "2000"),
      intervalMs: Number(flag("interval") ?? "1000"),
      log,
    });
    log(
      `${outcome.appends} append(s) per table, ${outcome.rows} rows, ` +
        `${outcome.failures.length} failure(s)`,
    );
    for (const failure of outcome.failures.slice(0, 5)) log(failure);
    if (outcome.failures.length > 0) process.exitCode = 1;
    break;
  }

  case "cost": {
    // Step 8's measurement: what the live screens' queries read, what they
    // bill, and how long each takes end to end through the same adapters and
    // use cases the web app runs. Reads only; writes nothing.
    await measureCost({
      client: await connect(),
      target,
      dryRun: (sql, params) => dryRunBytes({ ...target, location }, sql, params),
      runs: Number(flag("runs") ?? "10"),
      log,
    });
    break;
  }

  default:
    log(
      "usage: warehouse <sql|migrate|load|verify|settings|reset|cost|soak>\n" +
        "  --project P  --dataset D  --location L\n" +
        "  --hours N          window ending now; load prints the exact one it used\n" +
        "  --from T --to T    an exact window; verify needs the one load printed\n" +
        "  --dry-run          migrate only: connect, read the ledger, apply nothing\n" +
        "  --skip-if-no-dataset  migrate only: exit clean when the dataset is absent\n" +
        "  --yes              reset only: confirm dropping every table\n" +
        "  --runs N           cost only: timed runs per query (default 10)\n" +
        "  --cycles N --interval MS  soak only: flush-shaped writes, and how fast\n" +
        "                     (default 2000 every 1000 ms; refuses the real dataset)",
    );
    process.exitCode = 1;
}
