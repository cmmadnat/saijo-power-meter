/**
 * The History screen's data, and the window it is asked for.
 *
 * Third of the three source files, and the same role as the other two: the only
 * place that knows the numbers are fixtures today. Step 8 replaces the
 * repository constructed here; `historyTable` above it and the screen above
 * that do not change.
 *
 * Server-only: it reaches into the meter registry and generates readings.
 */
import {
  DEFAULT_MAX_RUN_GAP_MS,
  historyTable,
  type HistoryTable,
} from "@power-meter/application";
import { MeterRegistry, type Department } from "@power-meter/domain";
import {
  defaultProfiles,
  FixtureReadingRepository,
  generateFixtures,
} from "@power-meter/infrastructure";
import { TIME_ZONE } from "./format.ts";

/**
 * Asia/Bangkok is UTC+07:00 and has been since 1920 — no daylight saving, no
 * transitions to straddle. So a picker value converts by appending the offset,
 * which is exact rather than approximately right, and every instant stays UTC
 * underneath. If this product ever serves a zone with DST, this is the function
 * that has to grow, not the screens.
 */
const UTC_OFFSET = "+07:00";

/** Matches an `<input type="date">` value: YYYY-MM-DD. */
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Matches an `<input type="time">` value: HH:MM, seconds optional. */
const TIME = /^\d{2}:\d{2}(:\d{2})?$/;

export interface HistoryRange {
  readonly from: Date;
  readonly to: Date;
  /** The picker values, echoed back so the form shows what was asked for. */
  readonly fromDate: string;
  readonly fromTime: string;
  readonly toDate: string;
  readonly toTime: string;
  /** Set when the requested range was unusable and the default was used instead. */
  readonly rejected: string | null;
}

const LOCAL_DATE = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: TIME_ZONE,
});

const LOCAL_TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TIME_ZONE,
});

function instant(date: string, time: string): Date {
  const seconds = time.length === 5 ? `${time}:00` : time;
  return new Date(`${date}T${seconds}${UTC_OFFSET}`);
}

/**
 * The default window: today's shift so far — 00:00 Bangkok up to the current
 * minute. The specification's mock-up ships empty pickers, but an empty screen
 * teaches nothing about what this screen is; today is the range someone opening
 * it at lunchtime almost always wants.
 */
export function defaultRange(now = new Date()): HistoryRange {
  const toDate = LOCAL_DATE.format(now);
  const toTime = LOCAL_TIME.format(now);
  return {
    from: instant(toDate, "00:00"),
    to: instant(toDate, toTime),
    fromDate: toDate,
    fromTime: "00:00",
    toDate,
    toTime,
    rejected: null,
  };
}

/**
 * Read the four picker values off the URL.
 *
 * Anything malformed falls back to the default window with a note the screen
 * prints, rather than throwing: these are query parameters, which anyone can
 * hand-edit, and a 500 for a typo in a date would be a worse answer than
 * today's numbers and a line saying why.
 */
export function parseRange(
  params: Record<string, string | undefined>,
  now = new Date(),
): HistoryRange {
  const fallback = defaultRange(now);
  const { fromDate, fromTime, toDate, toTime } = params;

  if (
    fromDate === undefined &&
    fromTime === undefined &&
    toDate === undefined &&
    toTime === undefined
  ) {
    return fallback;
  }

  const values = {
    fromDate: fromDate ?? fallback.fromDate,
    fromTime: fromTime ?? fallback.fromTime,
    toDate: toDate ?? fallback.toDate,
    toTime: toTime ?? fallback.toTime,
  };

  if (
    !DATE.test(values.fromDate) ||
    !DATE.test(values.toDate) ||
    !TIME.test(values.fromTime) ||
    !TIME.test(values.toTime)
  ) {
    return { ...fallback, rejected: "that date or time was not readable" };
  }

  const from = instant(values.fromDate, values.fromTime);
  const to = instant(values.toDate, values.toTime);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { ...fallback, rejected: "that date or time was not readable" };
  }
  if (to.getTime() <= from.getTime()) {
    return { ...fallback, rejected: "the end must come after the start" };
  }

  return { from, to, ...values, rejected: null };
}

/** The department filter, validated against the registry. */
export function parseDepartment(
  raw: string | undefined,
  registry: MeterRegistry,
): Department | null {
  if (raw === undefined || raw === "") return null;
  return registry.departments().includes(raw as Department)
    ? (raw as Department)
    : null;
}

/** The real publish interval; fixtures are generated no finer than this. */
const PUBLISH_INTERVAL_MS = 9_000;

/**
 * Generating a week of 55 meters at the real 9-second rate is nine million
 * readings to produce and immediately reduce to 55 rows. The window is sampled
 * coarsely instead, the way the charts do it.
 */
function samplingIntervalMs(spanMs: number): number {
  const target = spanMs / 2_000;
  const steps = Math.max(1, Math.ceil(target / PUBLISH_INTERVAL_MS));
  return steps * PUBLISH_INTERVAL_MS;
}

export async function historySnapshot(
  range: HistoryRange,
  department: Department | null,
): Promise<HistoryTable> {
  const registry = MeterRegistry.fromWorkbook();
  const spanMs = range.to.getTime() - range.from.getTime();
  const intervalMs = samplingIntervalMs(spanMs);

  const fixtures = generateFixtures({
    registry,
    from: range.from,
    to: range.to,
    intervalMs,
    profiles: defaultProfiles(registry),
  });

  return historyTable({
    registry,
    repository: new FixtureReadingRepository(fixtures.readings),
    range: { from: range.from, to: range.to },
    department,
    // The use case caps a gap at three minutes so an unobserved stretch is not
    // counted as running. That cap assumes readings arrive on the real 9-second
    // schedule; here they are sampled coarsely to keep a long window cheap, so
    // a week's 5-minute sampling would otherwise make every gap uncountable and
    // every machine read as never running. The cap travels with the sampling
    // rate, and at step 8 it goes back to the default because the readings will
    // be real ones.
    maxRunGapMs: Math.max(DEFAULT_MAX_RUN_GAP_MS, intervalMs * 2),
  });
}
