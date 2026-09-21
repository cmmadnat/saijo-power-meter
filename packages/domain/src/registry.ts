/**
 * The meter registry: which meters exist, what they are called, and where in
 * the MQTT payloads to find them.
 *
 * The data is generated from the customer workbook by tools/extract-meters.py.
 * Re-run that rather than editing meters.generated.json when a new revision of
 * the workbook arrives.
 */
import raw from "./meters.generated.json" with { type: "json" };
import type { Department, Meter, MeterId } from "./meter.ts";

interface RawMeter {
  meterId: string;
  station: number;
  topic: string;
  slot: number;
  keyPrefix: string;
  department: string | null;
  machineName: string | null;
  standbyPowerKw: number | null;
  commissioned: boolean;
}

export class MeterRegistry {
  readonly #byId: ReadonlyMap<MeterId, Meter>;
  readonly #byTopic: ReadonlyMap<string, readonly Meter[]>;

  private constructor(meters: readonly Meter[]) {
    this.#byId = new Map(meters.map((m) => [m.meterId, m]));

    const byTopic = new Map<string, Meter[]>();
    for (const meter of meters) {
      const existing = byTopic.get(meter.topic);
      if (existing) existing.push(meter);
      else byTopic.set(meter.topic, [meter]);
    }
    this.#byTopic = byTopic;
  }

  /** The registry as generated from the workbook. */
  static fromWorkbook(): MeterRegistry {
    return new MeterRegistry(
      (raw.meters as RawMeter[]).map(
        (m): Meter => ({
          meterId: m.meterId as MeterId,
          station: m.station,
          topic: m.topic,
          slot: m.slot,
          keyPrefix: m.keyPrefix,
          department: m.department,
          machineName: m.machineName,
          standbyPowerKw: m.standbyPowerKw,
          commissioned: m.commissioned,
        }),
      ),
    );
  }

  /** Built from an explicit list — for tests and fixtures. */
  static of(meters: readonly Meter[]): MeterRegistry {
    return new MeterRegistry(meters);
  }

  /** Every slot, commissioned or not. */
  all(): readonly Meter[] {
    return [...this.#byId.values()];
  }

  /**
   * Only the slots with a machine behind them. This is what every screen shows
   * and what the decoder keeps; the rest arrive in every payload and are noise.
   */
  commissioned(): readonly Meter[] {
    return this.all().filter((m) => m.commissioned);
  }

  find(id: MeterId): Meter | undefined {
    return this.#byId.get(id);
  }

  /** Every slot published on a topic, in slot order. Empty for a topic we do not know. */
  forTopic(topic: string): readonly Meter[] {
    return this.#byTopic.get(topic) ?? [];
  }

  /** The distinct departments of commissioned meters — the History filter's values. */
  departments(): readonly Department[] {
    const seen = new Set<Department>();
    for (const meter of this.commissioned()) {
      if (meter.department !== null) seen.add(meter.department);
    }
    return [...seen].sort();
  }

  /** Every topic the ingester subscribes to. */
  topics(): readonly string[] {
    return [...this.#byTopic.keys()].sort();
  }
}
