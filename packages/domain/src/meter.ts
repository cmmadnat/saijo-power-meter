/**
 * Meters and their identity.
 *
 * Identity in the MQTT protocol is positional: a payload carries no timestamp,
 * no station id and no meter id, only an `M<n>` prefix on the keys, arriving on
 * a topic. So identity has to be assigned, and `MeterId` is that assignment.
 * Department and machine name hang off it as display attributes and are never
 * identity — a machine that gets relabelled keeps its readings.
 *
 * See docs/requirements/power-meter-mqtt.md.
 */

/** `s<station>m<slot>` — e.g. `s01m1`. Derivable from (topic, key prefix). */
export type MeterId = string & { readonly __brand: "MeterId" };

export function meterId(station: number, slot: number): MeterId {
  if (!Number.isInteger(station) || station < 1 || station > 99) {
    throw new RangeError(`station must be an integer in 1..99, got ${station}`);
  }
  if (!Number.isInteger(slot) || slot < 1 || slot > 8) {
    throw new RangeError(`slot must be an integer in 1..8, got ${slot}`);
  }
  return `s${String(station).padStart(2, "0")}m${slot}` as MeterId;
}

/** Thai department names, exactly as the customer wrote them. */
export type Department = string;

export interface Meter {
  readonly meterId: MeterId;
  readonly station: number;
  /** The MQTT topic this meter's readings arrive on. */
  readonly topic: string;
  /** 1..8 — which meter within the station's payload. */
  readonly slot: number;
  /** The `M<n>` prefix its keys carry in that payload. */
  readonly keyPrefix: string;
  readonly department: Department | null;
  readonly machineName: string | null;
  /**
   * Active power at or below which the machine counts as idle rather than
   * running, in kW. Per-meter because the specification states it per-meter,
   * even though every commissioned meter currently carries 0.1.
   */
  readonly standbyPowerKw: number | null;
  /**
   * False for a slot that exists in every payload but has no machine behind it.
   * 17 of the 72 slots are in this state and must be dropped at decode rather
   * than shown as meters reading zero.
   */
  readonly commissioned: boolean;
}

/** A meter is running when its active power exceeds its standby level. */
export function isRunning(meter: Meter, activePowerKw: number): boolean {
  const standby = meter.standbyPowerKw;
  if (standby === null) return activePowerKw > 0;
  return activePowerKw > standby;
}
