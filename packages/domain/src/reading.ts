/**
 * A single meter reading, in engineering units.
 *
 * Everything here is already scaled: the raw integers the protocol carries, and
 * the divisors that turn them into these units, belong to the decoder in the
 * infrastructure layer. The domain never sees a raw payload, which is what lets
 * the outstanding question about the power and energy divisors stay confined to
 * one adapter instead of spreading through the application.
 */
import type { MeterId } from "./meter.ts";

/** Readings per phase. The protocol carries L1, L2 and L3 for voltage and current. */
export interface PerPhase {
  readonly l1: number;
  readonly l2: number;
  readonly l3: number;
}

export interface Reading {
  readonly meterId: MeterId;
  /** When the reading was received. Stored as an instant; rendered in Asia/Bangkok. */
  readonly at: Date;
  /** Volts. */
  readonly voltage: PerPhase;
  /** Amperes. */
  readonly current: PerPhase;
  /** Active power, kW. */
  readonly activePowerKw: number;
  /** Dimensionless, 0..1. */
  readonly powerFactor: number;
  /**
   * Cumulative energy counter, kWh. Cumulative rather than per-interval, which
   * is what makes total-energy-over-a-window a subtraction — and what makes a
   * counter reset something the aggregation has to handle rather than ignore.
   */
  readonly energyKwh: number;
}
