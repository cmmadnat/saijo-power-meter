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
  /**
   * True where the meter is known only by what its feed sends: its number is
   * its key prefix exactly as the payload carries it (`M6`), and its name is a
   * person's label, printed whole — never reformatted, never split into a
   * machine number. Absent for the workbook's meters.
   */
  readonly verbatim?: boolean;
}

/** A meter is running when its active power exceeds its standby level. */
export function isRunning(meter: Meter, activePowerKw: number): boolean {
  const standby = meter.standbyPowerKw;
  if (standby === null) return activePowerKw > 0;
  return activePowerKw > standby;
}

/**
 * The machine number and the machine name, split out of the one field the
 * workbook actually has.
 *
 * The UI specification asks for หมายเลขเครื่องจักร (machine number) and
 * ชื่อเครื่องจักร (machine name) as two columns, but the workbook carries a
 * single `Name` per slot. In 35 of the 55 commissioned rows that name has the
 * code appended after a colon — `ปั้มเหล็ก 300 Ton : STL003`. The other 20 have
 * no code at all, and three of the MDB panels have a *department* after the
 * colon rather than a code.
 *
 * So the split is conditional on the suffix looking like a code: letters and
 * digits, at least one digit, nothing else. `ตู้ไฟฟ้า MDB3 : แผนกจัดส่ง` keeps
 * its whole name and gets no machine number, which is the honest answer — there
 * is no machine number for it to have.
 *
 * See docs/requirements/power-meter-ui.md, which records this as a question
 * back to the customer: if a real machine-number list exists it replaces this.
 */
const NAME_SEPARATOR = " : ";
const MACHINE_CODE = /^(?=.*\d)[A-Za-z0-9./-]+$/;

export interface MachineLabel {
  /** The code after the colon when there is one, else null. */
  readonly number: string | null;
  /** The name with that code removed, or the whole name when there is none. */
  readonly name: string | null;
}

export function machineLabel(meter: Meter): MachineLabel {
  const full = meter.machineName;
  if (full === null) return { number: null, name: null };
  if (meter.verbatim === true) return { number: null, name: full };

  const at = full.lastIndexOf(NAME_SEPARATOR);
  if (at === -1) return { number: null, name: full };

  const suffix = full.slice(at + NAME_SEPARATOR.length).trim();
  if (!MACHINE_CODE.test(suffix)) return { number: null, name: full };

  return { number: suffix, name: full.slice(0, at).trim() };
}

/**
 * The meter's number as the screens print it: station and Power Meter ID, the
 * workbook's own two columns, formatted `01-1`.
 *
 * The specification's mock-up numbers meters flat (`Power Meter 1`…), which the
 * workbook does not do and which would shift every time a slot is
 * commissioned. Recorded as an open question in the UI requirements.
 *
 * A verbatim meter is numbered by its key prefix as the payload sends it.
 */
export function meterNumber(meter: Meter): string {
  if (meter.verbatim === true) return meter.keyPrefix;
  return `${String(meter.station).padStart(2, "0")}-${meter.slot}`;
}
