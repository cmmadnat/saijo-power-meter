/**
 * The ports, backed by files on disk. For the local replay and nothing else.
 *
 * Two of the plan's verification items cannot be answered by a writer that
 * throws its rows away: *restart and confirm the hot state rehydrates from
 * `latest`*, and *rollup totals reconcile against raw*. Both need the rows to
 * still be somewhere afterwards, and this session has no project to put them
 * in. So `WAREHOUSE=file` writes what the warehouse adapter would write — the
 * same rows, from the same `readingToRow` shape — as newline-delimited JSON in
 * a directory, and reads `latest.json` back the way a restarted ingester reads
 * the `latest` table.
 *
 * It is a harness, not a second store. Nothing composes it in production: the
 * only way to reach it is `WAREHOUSE=file`, which the startup gate allows
 * exactly where it allows `memory` — a broker on loopback — because neither can
 * put a row in BigQuery.
 */
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  LatestReadingStore,
  ReadingBatch,
  ReadingWriter,
} from "@power-meter/application";
import type { MeterId, Reading } from "@power-meter/domain";

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
        join(this.#dir, FILES.readings),
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
        join(this.#dir, FILES.rollup),
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
      join(this.#dir, FILES.latest),
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
      text = await readFile(join(this.#dir, FILES.latest), "utf8");
    } catch {
      // Nothing written yet: the same case as an empty `latest` table on a
      // project that has never ingested, and handled the same way.
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
  return { ...row, meterId: row.meterId as MeterId, at: new Date(row.at) };
}
