/**
 * The payload decoder: one station message in, readings for that station's
 * commissioned meters out.
 *
 * This is the single piece of code the web app and the ingester must share
 * verbatim - if they ever drift, stored history and the live screen disagree
 * about the same meter and nobody notices until a total looks wrong. It lives
 * in infrastructure because it translates one specific wire format, which the
 * domain has no business knowing exists.
 *
 * Three things it deliberately does not do quietly:
 *
 * - **Uncommissioned slots are dropped**, not rendered as meters reading zero.
 *   Every payload carries all 8 slots; 17 of the 72 have no machine behind them.
 * - **A meter with a bad field is skipped whole**, not emitted half-populated.
 *   A reading missing its current is not a reading, and a partial row in the
 *   warehouse is harder to find later than a gap.
 * - **A decreasing energy counter is flagged**, because the History screen's
 *   total is a subtraction: a reset that passes unnoticed becomes a negative
 *   total or, worse, a plausible wrong one.
 */
import type { Meter, MeterId, PerPhase, Reading } from "@power-meter/domain";
import { MeterRegistry } from "@power-meter/domain";
import { numericField, parseStationPayload } from "./payload.ts";
import { SCALES, type ScaleTable } from "./scaling.ts";

export type DecodeIssueKind =
  | "unknown-topic"
  | "missing-field"
  | "out-of-range"
  | "energy-counter-decreased";

export interface DecodeIssue {
  readonly kind: DecodeIssueKind;
  /** Absent only for `unknown-topic`, which is about the message, not a meter. */
  readonly meterId?: MeterId;
  /** The payload key at fault, where there is one. */
  readonly key?: string;
  readonly detail: string;
}

export interface DecodeResult {
  /** One per commissioned meter that decoded cleanly, in slot order. */
  readonly readings: readonly Reading[];
  /** Everything the decoder refused to accept silently. */
  readonly issues: readonly DecodeIssue[];
  /** Slots present in the payload with no machine behind them. Expected, not an issue. */
  readonly droppedUncommissioned: number;
}

export interface DecodeOptions {
  /** Defaults to the registry generated from the customer workbook. */
  readonly registry?: MeterRegistry;
  /** Reception time. The protocol carries no timestamp, so the receiver supplies one. */
  readonly at: Date;
  /** Overridable so a test can assert what a different divisor would produce. */
  readonly scales?: ScaleTable;
  /**
   * Last energy counter seen per meter, for detecting a decrease. Stateless
   * callers omit it; `StationDecoder` below keeps it for you.
   */
  readonly previousEnergyKwh?: ReadonlyMap<MeterId, number>;
}

/** Plausible line voltage, generously bounded. Outside this, the scaling is wrong. */
const VOLTAGE_RANGE = { min: 0, max: 1000 } as const;
/** No meter here is on a 10 kA service; a value above this is a scaling error. */
const CURRENT_RANGE = { min: 0, max: 10_000 } as const;

export function decodeStationPayload(
  topic: string,
  payload: string | Uint8Array | Record<string, unknown>,
  options: DecodeOptions,
): DecodeResult {
  const registry = options.registry ?? MeterRegistry.fromWorkbook();
  const scales = options.scales ?? SCALES;
  const meters = registry.forTopic(topic);

  if (meters.length === 0) {
    return {
      readings: [],
      issues: [
        {
          kind: "unknown-topic",
          detail: `no meters are registered on topic "${topic}"`,
        },
      ],
      droppedUncommissioned: 0,
    };
  }

  const fields =
    typeof payload === "string" || payload instanceof Uint8Array
      ? parseStationPayload(payload)
      : payload;

  const readings: Reading[] = [];
  const issues: DecodeIssue[] = [];
  let droppedUncommissioned = 0;

  for (const meter of meters) {
    if (!meter.commissioned) {
      droppedUncommissioned += 1;
      continue;
    }

    const reading = decodeMeter(meter, fields, options.at, scales, issues);
    if (reading === null) continue;

    const previous = options.previousEnergyKwh?.get(meter.meterId);
    if (previous !== undefined && reading.energyKwh < previous) {
      issues.push({
        kind: "energy-counter-decreased",
        meterId: meter.meterId,
        key: `${meter.keyPrefix}E`,
        detail:
          `energy counter went backwards, ${previous} -> ${reading.energyKwh} kWh; ` +
          "a meter replacement or counter rollover, and the window total has to account for it",
      });
    }

    readings.push(reading);
  }

  return { readings, issues, droppedUncommissioned };
}

function decodeMeter(
  meter: Meter,
  fields: Record<string, unknown>,
  at: Date,
  scales: ScaleTable,
  issues: DecodeIssue[],
): Reading | null {
  const prefix = meter.keyPrefix;
  const before = issues.length;

  const scaled = (key: string, divisor: number): number | null => {
    const raw = numericField(fields, key);
    if (raw === null) {
      issues.push({
        kind: "missing-field",
        meterId: meter.meterId,
        key,
        detail: `${key} is absent or not numeric`,
      });
      return null;
    }
    return raw / divisor;
  };

  const inRange = (
    key: string,
    value: number | null,
    range: { min: number; max: number },
  ): number | null => {
    if (value === null) return null;
    if (value < range.min || value > range.max) {
      issues.push({
        kind: "out-of-range",
        meterId: meter.meterId,
        key,
        detail: `${key} decoded to ${value}, outside ${range.min}..${range.max} — suspect the scaling before the meter`,
      });
      return null;
    }
    return value;
  };

  const phase = (
    field: "VL" | "CL",
    divisor: number,
    range: { min: number; max: number },
  ): PerPhase | null => {
    const values = ([1, 2, 3] as const).map((n) => {
      const key = `${prefix}${field}${n}`;
      return inRange(key, scaled(key, divisor), range);
    });
    const [l1, l2, l3] = values;
    if (l1 == null || l2 == null || l3 == null) return null;
    return { l1, l2, l3 };
  };

  const voltage = phase("VL", scales.voltage.divisor, VOLTAGE_RANGE);
  const current = phase("CL", scales.current.divisor, CURRENT_RANGE);
  const activePowerKw = scaled(`${prefix}P`, scales.activePower.divisor);
  const powerFactor = inRange(
    `${prefix}PF`,
    scaled(`${prefix}PF`, scales.powerFactor.divisor),
    { min: 0, max: 1 },
  );
  const energyKwh = inRange(
    `${prefix}E`,
    scaled(`${prefix}E`, scales.energy.divisor),
    { min: 0, max: Number.MAX_SAFE_INTEGER },
  );

  if (
    voltage === null ||
    current === null ||
    activePowerKw === null ||
    powerFactor === null ||
    energyKwh === null
  ) {
    // Every fault already pushed its own issue; the meter is skipped whole.
    if (issues.length === before) {
      issues.push({
        kind: "missing-field",
        meterId: meter.meterId,
        detail: "meter did not decode",
      });
    }
    return null;
  }

  return {
    meterId: meter.meterId,
    at,
    voltage,
    current,
    activePowerKw,
    powerFactor,
    energyKwh,
  };
}

/**
 * The decoder plus the one piece of state it needs: the last energy counter per
 * meter.
 *
 * A decrease can only be seen across two messages, and the ingester is a single
 * always-on process already holding exactly this kind of hot state, so it keeps
 * it here rather than asking the warehouse on every message. Restarting loses
 * the comparison for one reading per meter, which is a missed flag and never a
 * wrong number - the aggregation handles resets on its own.
 */
export class StationDecoder {
  readonly #registry: MeterRegistry;
  readonly #scales: ScaleTable;
  readonly #lastEnergyKwh = new Map<MeterId, number>();

  constructor(
    options: { registry?: MeterRegistry; scales?: ScaleTable } = {},
  ) {
    this.#registry = options.registry ?? MeterRegistry.fromWorkbook();
    this.#scales = options.scales ?? SCALES;
  }

  decode(
    topic: string,
    payload: string | Uint8Array | Record<string, unknown>,
    at: Date,
  ): DecodeResult {
    const result = decodeStationPayload(topic, payload, {
      registry: this.#registry,
      scales: this.#scales,
      at,
      previousEnergyKwh: this.#lastEnergyKwh,
    });
    for (const reading of result.readings) {
      this.#lastEnergyKwh.set(reading.meterId, reading.energyKwh);
    }
    return result;
  }
}
