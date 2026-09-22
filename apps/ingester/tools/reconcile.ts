/**
 * Check a replay run's rollup against the raw readings it came from.
 *
 * This is the plan's "rollup totals reconcile against raw", run over what the
 * ingester actually wrote rather than over what it would have written. It reads
 * the two JSONL files `WAREHOUSE=file` produces and asserts, per bucket:
 *
 * - every raw reading is counted in exactly one bucket, and none twice;
 * - `active_power_kw` is the mean of the bucket's readings, because power is a
 *   rate;
 * - `energy_kwh` is the bucket's *last* counter, because energy is a counter
 *   and averaging one invents a reading;
 * - `(meter, minute)` appears once across the whole run, which is the property
 *   the flush schedule could break and no reader would notice.
 *
 *     npm run reconcile -w @power-meter/ingester -- --dir .ingester
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { FILES } from "../src/file-store.ts";

const index = process.argv.indexOf("--dir");
const dir = index === -1 ? ".ingester" : (process.argv[index + 1] ?? ".ingester");

interface RawRow {
  meterId: string;
  at: string;
  activePowerKw: number;
  energyKwh: number;
}
interface RollupRow {
  meterId: string;
  minute: string;
  readingCount: number;
  activePowerKw: number;
  energyKwh: number;
}

async function lines<T>(file: string): Promise<T[]> {
  const text = await readFile(join(dir, file), "utf8");
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}

const raw = await lines<RawRow>(FILES.readings);
const rollup = await lines<RollupRow>(FILES.rollup);

const byBucket = new Map<string, RawRow[]>();
for (const row of raw) {
  const minute = Math.floor(Date.parse(row.at) / 60_000) * 60_000;
  const key = `${row.meterId}@${minute}`;
  const bucket = byBucket.get(key);
  if (bucket === undefined) byBucket.set(key, [row]);
  else bucket.push(row);
}

const problems: string[] = [];
const seen = new Set<string>();
let counted = 0;

for (const row of rollup) {
  const key = `${row.meterId}@${Date.parse(row.minute)}`;
  if (seen.has(key)) problems.push(`${key}: written more than once`);
  seen.add(key);
  counted += row.readingCount;

  const behind = byBucket.get(key);
  if (behind === undefined) {
    problems.push(`${key}: no raw readings behind this bucket`);
    continue;
  }
  if (behind.length !== row.readingCount) {
    problems.push(
      `${key}: reading_count is ${row.readingCount}, raw has ${behind.length}`,
    );
  }
  const ordered = [...behind].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const mean =
    ordered.reduce((sum, r) => sum + r.activePowerKw, 0) / ordered.length;
  if (Math.abs(mean - row.activePowerKw) > 1e-9) {
    problems.push(`${key}: mean power ${row.activePowerKw} against raw ${mean}`);
  }
  const last = ordered[ordered.length - 1]?.energyKwh;
  if (last !== row.energyKwh) {
    problems.push(`${key}: energy ${row.energyKwh} is not the bucket's last, ${last}`);
  }
}

// Raw readings in a minute that had not closed when the run ended have no
// bucket yet, and that is correct rather than missing: they roll up on the next
// flush after the minute ends.
const openMinute = Math.max(...raw.map((row) => Date.parse(row.at)));
const openBucket = Math.floor(openMinute / 60_000) * 60_000;
const pending = raw.filter(
  (row) => Math.floor(Date.parse(row.at) / 60_000) * 60_000 >= openBucket,
).length;

process.stdout.write(
  `raw readings      ${raw.length}\n` +
    `rollup rows       ${rollup.length}\n` +
    `readings counted  ${counted}\n` +
    `still open        ${pending} (in the minute the run ended in)\n` +
    `distinct buckets  ${seen.size}\n`,
);

if (counted + pending < raw.length) {
  problems.push(
    `${raw.length - counted - pending} raw reading(s) are in no bucket and in no open minute`,
  );
}

if (problems.length > 0) {
  process.stdout.write(`\n${problems.length} problem(s):\n`);
  for (const problem of problems.slice(0, 20)) process.stdout.write(`  ${problem}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("\nrollup reconciles against raw\n");
}
