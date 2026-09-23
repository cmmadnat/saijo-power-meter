/**
 * The warehouse, as files on disk. For the local replay and nothing else.
 *
 * Two of step 7's verification items cannot be answered by a writer that
 * throws its rows away: *restart and confirm the hot state rehydrates from
 * `latest`*, and *rollup totals reconcile against raw*. Both need the rows to
 * still be somewhere afterwards, and a cloud session has no project to put
 * them in. So `WAREHOUSE=file` writes what the warehouse adapter would write —
 * the same rows, from the same batch — as newline-delimited JSON in a
 * directory, and reads `latest.json` back the way a restarted ingester reads
 * its Firestore document.
 *
 * Step 8 added the read side, and moved the file here from `apps/ingester` so
 * both ends share one definition of the format: the web app's live mode reads
 * the charts, the strip and History back out of the same directory the
 * ingester writes, which is how live mode is exercised end to end without
 * BigQuery.
 *
 * It is a harness, not a second store. Nothing composes it in production: the
 * only way to reach it is `WAREHOUSE=file`, which both startup gates allow only
 * beside a loopback address, because nothing here can put a row in BigQuery.
 * The readers load the whole file per call, which is right for minutes of
 * replay and wrong for anything else.
 *
 * Every path is built by `under`, which carries `turbopackIgnore`. The
 * directory is a runtime setting, and without the comment Next's tracer cannot
 * tell what it will be and copies the web app's whole project into the image
 * to be safe.
 */
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  LatestReadingStore,
  ReadingBatch,
  ReadingRepository,
  ReadingWriter,
  RollupBucket,
  RollupRepository,
  TimeRange,
} from "@power-meter/application";
import type { MeterId, Reading } from "@power-meter/domain";

/** A file in the store's directory. The comment keeps Next's tracer off it. */
function under(dir: string, file: string): string {
  return join(/* turbopackIgnore: true */ dir, file);
}

export const FILES = {
  readings: "readings.jsonl",
  rollup: "readings_1m.jsonl",
  latest: "latest.json",
} as const;

interface StoredReading {
  readonly meterId: string;
  readonly at: string;
  readonly voltage: { l1: number; l2: number; l3: number };
  readonly current: { l1: number; l2: number; l3: number };
  readonly activePowerKw: number;
  readonly powerFactor: number;
  readonly energyKwh: number;
}

export class FileReadingWriter implements ReadingWriter {
  readonly #dir: string;

  constructor(dir: string) {
    this.#dir = dir;
  }

  async prepare(): Promise<void> {
    await mkdir(this.#dir, { recursive: true });
  }

  async append(batch: ReadingBatch): Promise<void> {
    if (batch.readings.length > 0) {
      await appendFile(
        under(this.#dir, FILES.readings),
        `${batch.readings
          .map((reading) =>
            JSON.stringify({
              ...store(reading),
              ingestedAt: batch.ingestedAt.toISOString(),
            }),
          )
          .join("\n")}\n`,
      );
    }
    if (batch.rollup.length > 0) {
      await appendFile(
        under(this.#dir, FILES.rollup),
        `${batch.rollup
          .map((bucket) =>
            JSON.stringify({
              meterId: bucket.meterId,
              minute: bucket.at.toISOString(),
              readingCount: bucket.readingCount,
              activePowerKw: bucket.activePowerKw,
              energyKwh: bucket.energyKwh,
            }),
          )
          .join("\n")}\n`,
      );
    }
  }

  async replaceLatest(readings: readonly Reading[]): Promise<void> {
    if (readings.length === 0) return;
    await writeFile(
      under(this.#dir, FILES.latest),
      `${JSON.stringify(readings.map(store), null, 2)}\n`,
    );
  }
}

export class FileLatestReadingStore implements LatestReadingStore {
  readonly #dir: string;

  constructor(dir: string) {
    this.#dir = dir;
  }

  async latest(): Promise<ReadonlyMap<MeterId, Reading>> {
    let text: string;
    try {
      text = await readFile(under(this.#dir, FILES.latest), "utf8");
    } catch {
      // Nothing written yet: the same case as a missing restart-state document
      // on a project that has never ingested, and handled the same way.
      return new Map();
    }
    const rows = JSON.parse(text) as StoredReading[];
    return new Map(
      rows.map((row) => {
        const reading = restore(row);
        return [reading.meterId, reading] as const;
      }),
    );
  }
}

function store(reading: Reading): StoredReading {
  return { ...reading, at: reading.at.toISOString() };
}

function restore(row: StoredReading): Reading {
  // Field by field: a raw row also carries `ingestedAt`, which is not a reading's.
  return {
    meterId: row.meterId as MeterId,
    at: new Date(row.at),
    voltage: row.voltage,
    current: row.current,
    activePowerKw: row.activePowerKw,
    powerFactor: row.powerFactor,
    energyKwh: row.energyKwh,
  };
}

interface StoredRollup {
  readonly meterId: string;
  readonly minute: string;
  readonly readingCount: number;
  readonly activePowerKw: number;
  readonly energyKwh: number;
}

async function lines<T>(path: string): Promise<T[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    // Nothing flushed yet — the same case as an empty partition.
    return [];
  }
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as T);
}

/** Meter-major, then ascending in time, within a half-open range: the port contract. */
function inContract<T>(
  rows: readonly T[],
  meterIds: readonly MeterId[],
  range: TimeRange,
  meterOf: (row: T) => string,
  atOf: (row: T) => number,
): T[] {
  const wanted = new Set<string>(meterIds);
  const from = range.from.getTime();
  const to = range.to.getTime();
  return rows
    .filter((row) => wanted.has(meterOf(row)))
    .filter((row) => atOf(row) >= from && atOf(row) < to)
    .sort((a, b) =>
      meterOf(a) === meterOf(b)
        ? atOf(a) - atOf(b)
        : meterOf(a) < meterOf(b)
          ? -1
          : 1,
    );
}

/** `readings.jsonl`, read back as the History screen's repository. */
export class FileReadingRepository implements ReadingRepository {
  readonly #dir: string;

  constructor(dir: string) {
    this.#dir = dir;
  }

  async *readingsInRange(
    meterIds: readonly MeterId[],
    range: TimeRange,
  ): AsyncIterable<Reading> {
    const rows = await lines<StoredReading>(under(this.#dir, FILES.readings));
    for (const row of inContract(rows, meterIds, range, (r) => r.meterId, (r) => Date.parse(r.at))) {
      yield restore(row);
    }
  }
}

/** `readings_1m.jsonl`, read back as the charts' and the strip's repository. */
export class FileRollupRepository implements RollupRepository {
  readonly #dir: string;

  constructor(dir: string) {
    this.#dir = dir;
  }

  async *bucketsInRange(
    meterIds: readonly MeterId[],
    range: TimeRange,
  ): AsyncIterable<RollupBucket> {
    const rows = await lines<StoredRollup>(under(this.#dir, FILES.rollup));
    for (const row of inContract(rows, meterIds, range, (r) => r.meterId, (r) => Date.parse(r.minute))) {
      yield {
        meterId: row.meterId as MeterId,
        at: new Date(row.minute),
        readingCount: row.readingCount,
        activePowerKw: row.activePowerKw,
        energyKwh: row.energyKwh,
      };
    }
  }
}
