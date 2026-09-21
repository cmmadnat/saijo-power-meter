/**
 * The fleet strip: what the whole factory is doing, above the 55 rows.
 *
 * An addition to the specification, not something the customer asked for — the
 * mock-up has the table and nothing above it. It exists because 55 rows of
 * numbers answer "what is this machine drawing" and never answer "is the
 * factory alright", which is the question someone crossing the floor actually
 * has. It is flagged to the customer alongside the other additions in
 * docs/requirements/power-meter-ui.md.
 *
 * Every figure here is derived from the same snapshot the table already holds —
 * no second query, and nothing that needs history. That is also why there is no
 * "energy today" tile and no sparkline, both of which the design sketch had: a
 * cumulative figure needs a baseline from the start of the shift, and a
 * sparkline needs the whole window. Neither is available from the latest
 * reading per meter, and adding a warehouse query to a screen that refreshes
 * every ten seconds is a cost decision for step 8, not a detail to slip in here.
 */
import type { DepartmentLoad } from "@power-meter/application";
import { formatNumber } from "@/lib/format";

export interface FleetStripProps {
  readonly counts: {
    readonly live: number;
    readonly stale: number;
    readonly offline: number;
    readonly running: number;
    readonly reporting: number;
  };
  readonly totalActivePowerKw: number;
  readonly byDepartment: readonly DepartmentLoad[];
  readonly meterCount: number;
  /** Status per meter in table order, for the census squares. */
  readonly statuses: readonly ("live" | "stale" | "offline")[];
  readonly asOf: string;
}

const DOT: Record<"live" | "stale" | "offline", string> = {
  live: "bg-status-live",
  stale: "bg-status-stale",
  offline: "bg-status-offline",
};

const WORD: Record<"live" | "stale" | "offline", string> = {
  live: "Live",
  stale: "Stale",
  offline: "Offline",
};

const tile = "flex flex-col gap-2 border border-border bg-card p-4";
const label =
  "font-mono text-2xs uppercase tracking-wider text-muted-foreground";
const figure = "font-mono text-2xl tabular-nums";

export function FleetStrip({
  counts,
  totalActivePowerKw,
  byDepartment,
  meterCount,
  statuses,
  asOf,
}: FleetStripProps) {
  const idle = counts.reporting - counts.running;
  const busiest = [...byDepartment].sort(
    (a, b) => b.activePowerKw - a.activePowerKw,
  )[0];

  return (
    <section
      aria-label="Fleet summary"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <div className={tile}>
        <p className={label}>reporting</p>
        <p className={figure}>
          {counts.reporting}
          <span className="ms-1 font-sans text-sm text-muted-foreground">
            / {meterCount}
          </span>
        </p>
        {/* One square per meter, in table order. The count says how many are
            silent; the squares say which part of the fleet they sit in. */}
        <ul className="flex flex-wrap gap-0.5" aria-hidden>
          {statuses.map((status, index) => (
            <li
              key={index}
              className={`size-2 ${DOT[status]}`}
              title={WORD[status]}
            />
          ))}
        </ul>
        <p className={label}>
          {counts.offline === 0
            ? "every meter reporting"
            : `${counts.offline} silent`}
        </p>
      </div>

      <div className={tile}>
        <p className={label}>total load now</p>
        <p className={figure}>
          {formatNumber(totalActivePowerKw, 1)}
          <span className="ms-1 font-sans text-sm text-muted-foreground">
            kW
          </span>
        </p>
        <p className={label}>
          reporting meters only · as of {asOf}
        </p>
      </div>

      <div className={tile}>
        <p className={label}>running</p>
        <p className={figure}>
          {counts.running}
          <span className="ms-1 font-sans text-sm text-muted-foreground">
            above standby
          </span>
        </p>
        {/* Running / idle / silent as one bar, in the same three colours the
            rows use, each segment carrying its count in the label below. */}
        <div
          className="flex h-3.5 w-full border border-border"
          role="img"
          aria-label={`${counts.running} running, ${idle} idle, ${counts.offline} silent`}
        >
          <span
            className="bg-series-1"
            style={{ width: `${(counts.running / meterCount) * 100}%` }}
          />
          <span
            className="bg-muted"
            style={{ width: `${(idle / meterCount) * 100}%` }}
          />
          <span
            className="bg-status-offline"
            style={{ width: `${(counts.offline / meterCount) * 100}%` }}
          />
        </div>
        <p className={label}>
          {idle} idle · {counts.offline} silent
        </p>
      </div>

      <div className={tile}>
        <p className={label}>freshness</p>
        <ul className="flex flex-col gap-1.5 text-sm">
          {(["live", "stale", "offline"] as const).map((status) => (
            <li key={status} className="flex items-center gap-2">
              <span aria-hidden className={`size-2 ${DOT[status]}`} />
              {counts[status]} {status}
            </li>
          ))}
        </ul>
        {busiest !== undefined && busiest.activePowerKw > 0 && (
          <p className={label}>
            busiest {busiest.department} · {formatNumber(busiest.activePowerKw, 1)} kW
          </p>
        )}
      </div>
    </section>
  );
}
