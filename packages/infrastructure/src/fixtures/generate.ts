/**
 * Synthetic readings for all 55 commissioned meters.
 *
 * The screens get built before any store exists, so they need data that behaves
 * like the real thing: a cumulative energy counter, meters that sit below their
 * standby level, meters that cross it during the window, one that stops
 * reporting, and one whose counter resets. Each of those is a case some screen
 * gets visibly wrong if it is only ever shown well-behaved data - the History
 * total in particular, which is a subtraction and goes negative across a reset.
 *
 * Deterministic: the same seed and window produce the same readings, so a test
 * can assert a hand-computed total and a screenshot is comparable across runs.
 * Values are rounded to the resolution the decoder produces, which also makes
 * `toStationPayload` an exact inverse.
 */
import type { Meter, MeterId, Reading } from "@power-meter/domain";
import { MeterRegistry } from "@power-meter/domain";
import { SCALES, type ScaleTable } from "../mqtt/scaling.ts";

/**
 * How a meter behaves across the window.
 *
 * - `running`  — above standby throughout, load wandering as a machine's does.
 * - `cycling`  — crosses the standby level repeatedly, so running-hours is less
 *   than the window and has to actually be measured.
 * - `idle`     — powered but never above standby: zero running hours, non-zero
 *   consumption.
 * - `offline`  — reports for the first part of the window and then stops, which
 *   is what a dead station looks like from the outside.
 */
export type MeterProfile = "running" | "cycling" | "idle" | "offline";

export interface FixtureOptions {
  readonly registry?: MeterRegistry;
  /** Inclusive start of the window. */
  readonly from: Date;
  /** Exclusive end. */
  readonly to: Date;
  /** Publish interval. 9 s is the real rate: 60 messages/min across 9 stations. */
  readonly intervalMs?: number;
  readonly seed?: number;
  /** Pins a meter to a profile instead of the deterministic assignment. */
  readonly profiles?: Readonly<Record<string, MeterProfile>>;
  /**
   * The meter whose energy counter resets mid-window, or null for none.
   * Defaults to the first commissioned meter, so every fixture set contains the
   * case by default rather than only when someone remembers to ask for it.
   */
  readonly energyResetFor?: MeterId | null;
}

export interface FixtureSet {
  /** Ordered by meter, then ascending in time — the ReadingRepository contract. */
  readonly readings: readonly Reading[];
  readonly profiles: ReadonlyMap<MeterId, MeterProfile>;
  readonly from: Date;
  readonly to: Date;
  readonly intervalMs: number;
  /** The meter given a counter reset, if any. */
  readonly energyResetFor: MeterId | null;
  /** When that reset happens. */
  readonly energyResetAt: Date | null;
}

const DEFAULT_INTERVAL_MS = 9_000;
const NOMINAL_VOLTAGE = 230;

/** Small, fast, and stable across Node versions — which `Math.random` is not. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Which profile a meter gets when nothing pins it.
 *
 * Weighted so a factory's worth of meters looks like one: mostly running, a few
 * duty-cycling, a couple idle, and one station's worth of silence.
 *
 * It is a function of the meter's position in the registry, which makes it a
 * property of the fleet rather than of the meter - so generating for a subset
 * would re-roll everyone. `defaultProfiles` is the fix: take the assignment
 * once from the whole registry and pass it in.
 */
function assignProfile(index: number): MeterProfile {
  if (index % 17 === 3) return "offline";
  if (index % 7 === 1) return "idle";
  if (index % 3 === 2) return "cycling";
  return "running";
}

/** Rated load in kW, spread by machine so the table is not 55 identical rows. */
function ratedPowerKw(meter: Meter): number {
  const random = mulberry32(hash(meter.meterId));
  return round(8 + random() * 92, 1);
}

/**
 * The profile every commissioned meter gets from the full registry.
 *
 * A caller generating for a handful of meters - one chart's selection, say -
 * passes this so each meter keeps the behaviour it has in the whole fleet.
 * Without it a meter that is idle among 55 could come back running among four,
 * and two screens would disagree about the same machine.
 */
export function defaultProfiles(
  registry: MeterRegistry = MeterRegistry.fromWorkbook(),
): Record<string, MeterProfile> {
  const profiles: Record<string, MeterProfile> = {};
  registry.commissioned().forEach((meter, index) => {
    profiles[meter.meterId] = assignProfile(index);
  });
  return profiles;
}

export function generateFixtures(options: FixtureOptions): FixtureSet {
  const registry = options.registry ?? MeterRegistry.fromWorkbook();
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const seed = options.seed ?? 20250921;
  const from = options.from;
  const to = options.to;

  if (!(from.getTime() < to.getTime())) {
    throw new RangeError("fixture window must have from < to");
  }
  if (intervalMs <= 0) {
    throw new RangeError("fixture interval must be positive");
  }

  const meters = registry.commissioned();
  if (meters.length === 0) throw new RangeError("registry has no commissioned meters");

  const resetFor =
    options.energyResetFor === undefined
      ? (meters[0] as Meter).meterId
      : options.energyResetFor;
  const resetAt =
    resetFor === null
      ? null
      : new Date(from.getTime() + Math.floor((to.getTime() - from.getTime()) / 2));

  const readings: Reading[] = [];
  const profiles = new Map<MeterId, MeterProfile>();

  meters.forEach((meter, index) => {
    const profile =
      options.profiles?.[meter.meterId] ?? assignProfile(index);
    profiles.set(meter.meterId, profile);

    const random = mulberry32(seed ^ hash(meter.meterId));
    const rated = ratedPowerKw(meter);
    const standby = meter.standbyPowerKw ?? 0.1;
    // Phase the duty cycle per meter so they do not all switch on together.
    const phaseOffset = random() * Math.PI * 2;
    // A dead station stops partway rather than at a tidy boundary.
    const silentFrom =
      profile === "offline"
        ? from.getTime() + (to.getTime() - from.getTime()) * (0.2 + random() * 0.2)
        : Number.POSITIVE_INFINITY;

    let energyKwh = round(1000 + random() * 9000, 1);
    let resetApplied = false;

    for (let t = from.getTime(); t < to.getTime(); t += intervalMs) {
      if (t >= silentFrom) break;

      const at = new Date(t);
      // Absolute hours, not hours since the window started: a meter's load has
      // to be a function of when it is, or the same machine at the same instant
      // would read one way on a 45-minute window and another on a six-hour one,
      // and the table and the charts would disagree about it on the same page.
      const hours = t / 3_600_000;
      const duty = Math.sin(phaseOffset + hours * 1.7);

      let activePowerKw: number;
      switch (profile) {
        case "idle":
          // Below standby throughout: consumes energy, never counts as running.
          activePowerKw = round(standby * (0.2 + random() * 0.6), 1);
          break;
        case "cycling":
          // Swings either side of standby, so running-hours is a real measurement.
          activePowerKw =
            duty > 0
              ? round(standby + duty * rated * 0.6 + random() * 0.5, 1)
              : round(standby * (0.1 + random() * 0.7), 1);
          break;
        default:
          activePowerKw = round(
            rated * (0.55 + 0.35 * ((duty + 1) / 2)) + (random() - 0.5) * 2,
            1,
          );
          break;
      }
      activePowerKw = Math.max(0, activePowerKw);

      const powerFactor =
        activePowerKw > standby
          ? round(0.86 + random() * 0.11, 2)
          : round(0.3 + random() * 0.25, 2);

      const voltage = {
        l1: round(NOMINAL_VOLTAGE + (random() - 0.5) * 6, 1),
        l2: round(NOMINAL_VOLTAGE + (random() - 0.5) * 6, 1),
        l3: round(NOMINAL_VOLTAGE + (random() - 0.5) * 6, 1),
      };

      // Three-phase: P = 3 x V x I x PF, so the current the table shows agrees
      // with the power beside it instead of being independently invented.
      const perPhaseCurrent = (v: number): number =>
        round(
          powerFactor > 0 && v > 0
            ? (activePowerKw * 1000) / (3 * v * powerFactor)
            : 0,
          1,
        );

      energyKwh = round(energyKwh + (activePowerKw * intervalMs) / 3_600_000, 1);
      if (
        !resetApplied &&
        resetFor === meter.meterId &&
        resetAt !== null &&
        t >= resetAt.getTime()
      ) {
        // A meter replacement, once: the counter starts again from near zero
        // and climbs from there. The History total must not read the step down
        // as consumption going backwards.
        energyKwh = round(random() * 2, 1);
        resetApplied = true;
      }

      readings.push({
        meterId: meter.meterId,
        at,
        voltage,
        current: {
          l1: perPhaseCurrent(voltage.l1),
          l2: perPhaseCurrent(voltage.l2),
          l3: perPhaseCurrent(voltage.l3),
        },
        activePowerKw,
        powerFactor,
        energyKwh,
      });
    }
  });

  return {
    readings,
    profiles,
    from,
    to,
    intervalMs,
    energyResetFor: resetFor,
    energyResetAt: resetFor === null ? null : resetAt,
  };
}

/**
 * The inverse of the decoder: readings back into a raw station payload.
 *
 * Used by the decoder's round-trip test now, and by step 7's local broker replay
 * later - a fixture station that publishes at the real rate is how the ingester
 * gets exercised without the customer's broker.
 */
export function toStationPayload(
  readings: readonly Reading[],
  options: { registry?: MeterRegistry; scales?: ScaleTable } = {},
): Record<string, number> {
  const registry = options.registry ?? MeterRegistry.fromWorkbook();
  const scales = options.scales ?? SCALES;
  const payload: Record<string, number> = {};

  for (const reading of readings) {
    const meter = registry.find(reading.meterId);
    if (meter === undefined) {
      throw new RangeError(`${reading.meterId} is not in the registry`);
    }
    const prefix = meter.keyPrefix;
    const raw = (value: number, divisor: number): number =>
      Math.round(value * divisor);

    payload[`${prefix}VL1`] = raw(reading.voltage.l1, scales.voltage.divisor);
    payload[`${prefix}VL2`] = raw(reading.voltage.l2, scales.voltage.divisor);
    payload[`${prefix}VL3`] = raw(reading.voltage.l3, scales.voltage.divisor);
    payload[`${prefix}CL1`] = raw(reading.current.l1, scales.current.divisor);
    payload[`${prefix}CL2`] = raw(reading.current.l2, scales.current.divisor);
    payload[`${prefix}CL3`] = raw(reading.current.l3, scales.current.divisor);
    payload[`${prefix}P`] = raw(reading.activePowerKw, scales.activePower.divisor);
    payload[`${prefix}PF`] = raw(reading.powerFactor, scales.powerFactor.divisor);
    payload[`${prefix}E`] = raw(reading.energyKwh, scales.energy.divisor);
  }

  return payload;
}
