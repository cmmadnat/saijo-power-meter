/**
 * Display formatting. No rounding decisions live here that change a number's
 * meaning — only how many digits of it are shown.
 */

/** Asia/Bangkok throughout, per the plan. Formatted on the server and passed down. */
export const TIME_ZONE = "Asia/Bangkok";

const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: TIME_ZONE,
});

export function formatClock(at: Date): string {
  return TIME.format(at);
}

const CLOCK_MINUTES = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TIME_ZONE,
});

/** Without seconds: a window boundary is a time, not an instant to the second. */
export function formatClockMinutes(at: Date): string {
  return CLOCK_MINUTES.format(at);
}

/** A number to a fixed number of decimals, or an em dash when there is none. */
export function formatNumber(value: number | null, places: number): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(places);
}

/**
 * How long ago a reading arrived, short enough to sit inside a table cell:
 * `9s`, `4m`, `1h 12m`.
 */
export function formatAge(ageMs: number | null): string {
  if (ageMs === null) return "never";
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

const LOCAL_DAY = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: TIME_ZONE,
});

/**
 * 00:00 Asia/Bangkok on the day containing `at`, as an instant.
 *
 * Bangkok is UTC+07:00 with no daylight saving, so appending the offset is
 * exact — the same conversion History's pickers use.
 */
export function startOfDay(at: Date): Date {
  return new Date(`${LOCAL_DAY.format(at)}T00:00:00+07:00`);
}
