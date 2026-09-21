/**
 * The scale factors that turn raw protocol integers into engineering units.
 *
 * This table is the whole reason the decoder is infrastructure rather than
 * domain. One of the nine fields has a documented conversion; two more are
 * pinned by physics; **two are still unanswered by the customer**, and getting
 * them wrong silently corrupts every row the ingester writes. Keeping them here
 * means the answer, when it comes, is one edit to one table and nothing above
 * this layer moves.
 *
 * See docs/requirements/power-meter-mqtt.md for the evidence behind each entry,
 * and the plan's "Still open" section for what settles the remaining two: one
 * real captured payload from a running meter, plus that meter's own display
 * reading at the same moment.
 */

/**
 * How much weight each divisor carries.
 *
 * - `documented` — the workbook states the conversion.
 * - `inferred`   — not stated, but only one value is physically credible.
 * - `assumed`    — **not known.** Chosen for consistency with the fields that
 *   are pinned, and wrong until the customer says otherwise.
 */
export type ScaleConfidence = "documented" | "inferred" | "assumed";

export interface ScaleFactor {
  /** Engineering value = raw / divisor. */
  readonly divisor: number;
  readonly unit: string;
  readonly confidence: ScaleConfidence;
  /** Why this number, in one line. Read it before changing the divisor. */
  readonly basis: string;
}

export interface ScaleTable {
  readonly voltage: ScaleFactor;
  readonly current: ScaleFactor;
  readonly activePower: ScaleFactor;
  readonly powerFactor: ScaleFactor;
  readonly energy: ScaleFactor;
}

export const SCALES: ScaleTable = {
  voltage: {
    divisor: 10,
    unit: "V",
    confidence: "documented",
    basis: "Sheet `Sample data`: FT01VL1 = 2325 -> 232.5 V. The one stated conversion.",
  },
  current: {
    divisor: 10,
    unit: "A",
    confidence: "inferred",
    basis:
      "3 x 232.1 V x I x 0.95 is 100.7 kW at I = raw/10, right for a 300-500 t press; " +
      "raw/100 gives 10.07 kW, too low for the named machines.",
  },
  activePower: {
    divisor: 10,
    unit: "kW",
    confidence: "assumed",
    basis:
      "UNANSWERED. Units are kW (customer-confirmed) so the raw 4995 is scaled, but no divisor " +
      "reconciles it with the 100.7 kW that V, I and PF imply - the sample was never measured. " +
      "One implied decimal is assumed, matching voltage and current; it is a guess.",
  },
  powerFactor: {
    divisor: 100,
    unit: "",
    confidence: "inferred",
    basis:
      "095 -> 0.95, consistent with the fixed-width zero padding, and the only scaling that " +
      "lands a power factor in 0..1.",
  },
  energy: {
    divisor: 10,
    unit: "kWh",
    confidence: "assumed",
    basis:
      "UNANSWERED. No documented conversion and nothing to infer one from. One implied decimal " +
      "is assumed for consistency. Cumulative-vs-interval is settled separately, by watching the " +
      "first hour of live data.",
  },
};

/**
 * The fields whose divisor is still a guess.
 *
 * Exported so the ingester's startup check can refuse to run against a live
 * broker while any of them remain - the gate the plan puts on step 7 - and so a
 * screen built on fixtures can say out loud which numbers are provisional.
 */
export function unconfirmedScales(
  scales: ScaleTable = SCALES,
): readonly (keyof ScaleTable)[] {
  return (Object.keys(scales) as (keyof ScaleTable)[]).filter(
    (field) => scales[field].confidence === "assumed",
  );
}
