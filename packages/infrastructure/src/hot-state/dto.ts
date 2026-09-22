/**
 * The ingester's `GET /latest` response, stated once for both ends of it.
 *
 * The ingester serialises its hot state with `toLatestDto`; the web app's
 * `IngesterLatestReadingStore` parses it back with `readingsFromLatest`. Both
 * import this file, so the wire shape cannot drift between the two deployables
 * any more than the payload decoder can — they are built from the same commit
 * for exactly that reason.
 *
 * The payload is readings, not table rows: `realtimeTable` in
 * `packages/application` builds the rows on the web side, so the ingester and
 * the screen never disagree about what "offline" means.
 */
import type { MeterId, Reading } from "@power-meter/domain";

export interface LatestReadingDto {
  readonly meterId: string;
  /** ISO-8601, which is what `JSON.stringify` does with a Date anyway. */
  readonly at: string;
  readonly voltage: { readonly l1: number; readonly l2: number; readonly l3: number };
  readonly current: { readonly l1: number; readonly l2: number; readonly l3: number };
  readonly activePowerKw: number;
  readonly powerFactor: number;
  readonly energyKwh: number;
}

export interface LatestResponse {
  /** When the snapshot was taken, not when any reading was received. */
  readonly asOf: string;
  readonly readings: readonly LatestReadingDto[];
}

export function toLatestDto(reading: Reading): LatestReadingDto {
  return {
    meterId: reading.meterId,
    at: reading.at.toISOString(),
    voltage: reading.voltage,
    current: reading.current,
    activePowerKw: reading.activePowerKw,
    powerFactor: reading.powerFactor,
    energyKwh: reading.energyKwh,
  };
}

/**
 * Parse a `/latest` body back into readings.
 *
 * Checked field by field rather than cast: a response from the wrong service,
 * or from an ingester a version ahead, should fail here with the field named
 * rather than render a table of `NaN`.
 */
export function readingsFromLatest(body: unknown): Reading[] {
  if (typeof body !== "object" || body === null || !Array.isArray((body as LatestResponse).readings)) {
    throw new TypeError("the ingester's /latest response has no readings array");
  }
  return (body as { readings: unknown[] }).readings.map((item, index) => {
    const dto = item as Record<string, unknown>;
    const where = `readings[${index}]`;
    if (typeof dto["meterId"] !== "string") throw new TypeError(`${where}.meterId is not a string`);
    const at = new Date(String(dto["at"]));
    if (Number.isNaN(at.getTime())) throw new TypeError(`${where}.at is not a timestamp`);
    return {
      meterId: dto["meterId"] as MeterId,
      at,
      voltage: phases(dto["voltage"], `${where}.voltage`),
      current: phases(dto["current"], `${where}.current`),
      activePowerKw: finite(dto["activePowerKw"], `${where}.activePowerKw`),
      powerFactor: finite(dto["powerFactor"], `${where}.powerFactor`),
      energyKwh: finite(dto["energyKwh"], `${where}.energyKwh`),
    };
  });
}

function finite(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${where} is not a number: ${JSON.stringify(value)}`);
  }
  return value;
}

function phases(value: unknown, where: string): { l1: number; l2: number; l3: number } {
  const v = (value ?? {}) as Record<string, unknown>;
  return {
    l1: finite(v["l1"], `${where}.l1`),
    l2: finite(v["l2"], `${where}.l2`),
    l3: finite(v["l3"], `${where}.l3`),
  };
}
