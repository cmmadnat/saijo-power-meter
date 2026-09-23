"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatAge, formatNumber } from "@/lib/format";

/**
 * Screen 1: one row per commissioned meter, in the columns of page 1 of the
 * customer specification and under the customer's own Thai headings.
 *
 * A presentation adapter and nothing more. It is handed rows that the
 * application layer built and decides only how they are ordered on screen,
 * which of them are shown, and how the numbers are printed — so the same table
 * renders live ingester data at step 8 without a change here.
 */

export type MeterStatus = "live" | "stale" | "offline";

/** A department's own census and load, summed in the application layer. */
export interface DepartmentSummary {
  readonly department: string;
  readonly meters: number;
  readonly reporting: number;
  readonly running: number;
  readonly activePowerKw: number;
}

export interface RealtimeTableRow {
  readonly meterId: string;
  readonly meterNumber: string;
  readonly department: string | null;
  readonly machineNumber: string | null;
  readonly machineName: string | null;
  /** L1, L2, L3. Null for a meter that has never reported. */
  readonly voltage: readonly [number, number, number] | null;
  readonly current: readonly [number, number, number] | null;
  readonly powerFactor: number | null;
  readonly activePowerKw: number | null;
  readonly energyKwh: number | null;
  readonly ageMs: number | null;
  readonly status: MeterStatus;
  readonly running: boolean;
  /**
   * The payload integers behind the scaled values, keyed as the wire keys
   * them (`M1VL1`, `M1P`, …). Present only in the Incoming view, where the
   * point is to compare them with what the broker's own console shows.
   */
  readonly raw?: { readonly prefix: string; readonly fields: Readonly<Record<RawField, number>> } | null;
}

export type RawField = "VL1" | "VL2" | "VL3" | "CL1" | "CL2" | "CL3" | "PF" | "P" | "E";

type SortKey =
  | "meterNumber"
  | "department"
  | "machineNumber"
  | "machineName"
  | "v1"
  | "v2"
  | "v3"
  | "c1"
  | "c2"
  | "c3"
  | "powerFactor"
  | "activePowerKw"
  | "energyKwh"
  | "status";

type SortDirection = "asc" | "desc";

const ALL = "__all__";

/** Thai sorts by a collator, not by code point: ก comes before ข, not after A. */
const collator = new Intl.Collator("th");

const STATUS_ORDER: Record<MeterStatus, number> = {
  live: 0,
  stale: 1,
  offline: 2,
};

const STATUS_LABEL: Record<MeterStatus, string> = {
  live: "Live",
  stale: "Stale",
  offline: "Offline",
};

/**
 * Never by colour alone: the marker's title names the status and the age in
 * words, and an offline row is also muted and prints how long it has been
 * silent beside its meter number. A screen meant for a factory wall has to say
 * what a red square means to someone who cannot tell it from the green one.
 */
const STATUS_DOT: Record<MeterStatus, string> = {
  live: "bg-status-live",
  stale: "bg-status-stale",
  offline: "bg-status-offline",
};

function value(row: RealtimeTableRow, key: SortKey): string | number | null {
  switch (key) {
    case "meterNumber":
      return row.meterNumber;
    case "department":
      return row.department;
    case "machineNumber":
      return row.machineNumber;
    case "machineName":
      return row.machineName;
    case "v1":
      return row.voltage?.[0] ?? null;
    case "v2":
      return row.voltage?.[1] ?? null;
    case "v3":
      return row.voltage?.[2] ?? null;
    case "c1":
      return row.current?.[0] ?? null;
    case "c2":
      return row.current?.[1] ?? null;
    case "c3":
      return row.current?.[2] ?? null;
    case "powerFactor":
      return row.powerFactor;
    case "activePowerKw":
      return row.activePowerKw;
    case "energyKwh":
      return row.energyKwh;
    case "status":
      return STATUS_ORDER[row.status];
  }
}

function compare(
  a: RealtimeTableRow,
  b: RealtimeTableRow,
  key: SortKey,
  direction: SortDirection,
): number {
  const left = value(a, key);
  const right = value(b, key);

  // A meter with nothing to show sorts last whichever way the column is
  // pointed: it is absent data, not a small value, and letting it lead the
  // descending sort would push the meters someone is looking for off screen.
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;

  const sign = direction === "asc" ? 1 : -1;
  if (typeof left === "number" && typeof right === "number") {
    return (left - right) * sign;
  }
  return collator.compare(String(left), String(right)) * sign;
}

function Marker({ row }: { row: RealtimeTableRow }) {
  const label = `${STATUS_LABEL[row.status]} · last reading ${formatAge(row.ageMs)} ago`;
  return (
    <span
      className={`inline-block size-2 shrink-0 ${STATUS_DOT[row.status]}`}
      title={label}
      aria-label={label}
      role="img"
    />
  );
}

function SortButton({
  label,
  columnKey,
  sort,
  onSort,
  align = "start",
}: {
  label: React.ReactNode;
  columnKey: SortKey;
  sort: { key: SortKey; direction: SortDirection };
  onSort: (key: SortKey) => void;
  align?: "start" | "end";
}) {
  const active = sort.key === columnKey;
  return (
    <button
      type="button"
      onClick={() => onSort(columnKey)}
      className={[
        "flex w-full items-center gap-1 whitespace-nowrap transition-colors hover:text-foreground",
        align === "end" ? "justify-end" : "justify-start",
        active ? "text-foreground" : "text-muted-foreground",
      ].join(" ")}
    >
      <span>{label}</span>
      <span aria-hidden className="text-accent-strong">
        {active ? (sort.direction === "asc" ? "▲" : "▼") : ""}
      </span>
    </button>
  );
}

const REFRESH_MS = 10_000;

export function RealtimeTable({
  rows,
  departments,
  byDepartment,
  asOf,
  counts,
  labelling = false,
  cadence = "readings arrive every 9 s; a meter silent for more than 3 min is shown offline with its last values.",
}: {
  /**
   * True where meters are grouped by station and named by label — Incoming.
   * The group heading says สถานี rather than แผนก, and an unlabelled meter
   * links to the Meters page instead of printing a dash.
   */
  labelling?: boolean;
  /** The footer's line about how often readings arrive and when a meter is called offline. */
  cadence?: string;
  rows: readonly RealtimeTableRow[];
  departments: readonly string[];
  /** Per-department census and load, summed in the application layer. */
  byDepartment: readonly DepartmentSummary[];
  /** Formatted on the server, in Asia/Bangkok, so hydration cannot disagree. */
  asOf: string;
  counts: {
    live: number;
    stale: number;
    offline: number;
    running: number;
  };
}) {
  const router = useRouter();
  const groupLabel = labelling ? "สถานี" : "แผนก";
  const [department, setDepartment] = useState<string>(ALL);
  const [live, setLive] = useState(true);
  // Grouping is on by default: 55 rows in five departments read as a list of
  // machines, and a supervisor's question is usually about a department.
  const [grouped, setGrouped] = useState(true);
  // The wire integers in place of the scaled values, one click away. Offered
  // only where the rows carry them.
  const hasRaw = rows.some((row) => row.raw != null);
  const [raw, setRaw] = useState(false);
  const showRaw = hasRaw && raw;
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "meterNumber",
    direction: "asc",
  });

  // The meters publish every ~9 s, so the screen re-reads on that order. Until
  // the ingester exists this re-runs the server component, which regenerates
  // the fixture window; at step 8 the same refresh re-reads the hot state.
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(id);
  }, [live, router]);

  const visible = useMemo(() => {
    const filtered =
      department === ALL
        ? [...rows]
        : rows.filter((row) => row.department === department);
    return filtered.sort((a, b) => {
      const primary = compare(a, b, sort.key, sort.direction);
      // Meter number is the tiebreak so equal values keep a stable, meaningful
      // order rather than whatever the previous sort left behind.
      return primary !== 0
        ? primary
        : collator.compare(a.meterNumber, b.meterNumber);
    });
  }, [rows, department, sort]);

  /**
   * The rows as the table draws them: one flat list, or one list per
   * department with a band ahead of each.
   *
   * Sorting applies inside a group rather than across the whole table, which is
   * what makes grouping and sorting compose instead of fight: pointing the
   * Power column at its largest value answers "the biggest machine in each
   * department" without dissolving the departments.
   */
  const groups = useMemo(() => {
    if (!grouped || department !== ALL) return null;
    return departments
      .map((name) => ({
        department: name,
        rows: visible.filter((row) => row.department === name),
        summary: byDepartment.find((d) => d.department === name) ?? null,
      }))
      .filter((group) => group.rows.length > 0);
  }, [grouped, department, departments, visible, byDepartment]);

  const onSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "meterNumber" ? "asc" : "desc" },
    );

  const headCell =
    "border-b border-border bg-card px-2 py-2 font-mono text-2xs font-normal uppercase tracking-wider";
  const cell = "px-2 py-1.5 align-middle";
  const numeric = `${cell} text-right font-mono tabular-nums`;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex flex-wrap items-center gap-1">
          <span className="me-1 font-mono text-2xs uppercase tracking-wider text-muted-foreground">
            {groupLabel}
          </span>
          {[ALL, ...departments].map((name) => {
            const selected = department === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => setDepartment(name)}
                aria-pressed={selected}
                className={[
                  "border px-2.5 py-1 text-xs transition-colors",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-accent-strong hover:text-foreground",
                ].join(" ")}
              >
                {name === ALL ? "ทั้งหมด" : name}
              </button>
            );
          })}
        </div>

        {department === ALL && (
          <button
            type="button"
            onClick={() => setGrouped((on) => !on)}
            aria-pressed={grouped}
            className={[
              "border px-2.5 py-1 font-mono text-2xs uppercase tracking-wider transition-colors",
              grouped
                ? "border-accent-strong text-foreground"
                : "border-border text-muted-foreground hover:border-accent-strong hover:text-foreground",
            ].join(" ")}
          >
            group by {groupLabel}
          </button>
        )}

        {hasRaw && (
          <button
            type="button"
            onClick={() => setRaw((on) => !on)}
            aria-pressed={raw}
            title="Show the integers exactly as the payload carried them, before any divisor"
            className={[
              "border px-2.5 py-1 font-mono text-2xs uppercase tracking-wider transition-colors",
              raw
                ? "border-accent-strong text-foreground"
                : "border-border text-muted-foreground hover:border-accent-strong hover:text-foreground",
            ].join(" ")}
          >
            {raw ? "raw integers" : "show raw"}
          </button>
        )}

        <div className="ms-auto flex flex-wrap items-center gap-3 font-mono text-2xs uppercase tracking-wider text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className={`inline-block size-2 ${STATUS_DOT.live}`} />
            {counts.live} live
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className={`inline-block size-2 ${STATUS_DOT.stale}`} />
            {counts.stale} stale
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className={`inline-block size-2 ${STATUS_DOT.offline}`} />
            {counts.offline} offline
          </span>
          <span>{counts.running} running</span>
          <span>as of {asOf}</span>
          <button
            type="button"
            onClick={() => setLive((on) => !on)}
            aria-pressed={live}
            className={[
              "border px-2.5 py-1 uppercase tracking-wider transition-colors",
              live
                ? "border-accent-strong text-foreground"
                : "border-border hover:border-accent-strong hover:text-foreground",
            ].join(" ")}
          >
            {live ? "● auto 10s" : "paused"}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto border border-border">
        <table className="w-full min-w-275 border-collapse text-sm">
          <caption className="sr-only">
            Real-time readings for every commissioned power meter
          </caption>
          <thead className="sticky top-0 z-10">
            <tr>
              <th rowSpan={2} scope="col" className={headCell}>
                <SortButton
                  label="หมายเลขมิเตอร์"
                  columnKey="meterNumber"
                  sort={sort}
                  onSort={onSort}
                />
              </th>
              <th rowSpan={2} scope="col" className={headCell}>
                <SortButton
                  label={groupLabel}
                  columnKey="department"
                  sort={sort}
                  onSort={onSort}
                />
              </th>
              <th rowSpan={2} scope="col" className={headCell}>
                <SortButton
                  label="หมายเลขเครื่องจักร"
                  columnKey="machineNumber"
                  sort={sort}
                  onSort={onSort}
                />
              </th>
              <th rowSpan={2} scope="col" className={headCell}>
                <SortButton
                  label="ชื่อเครื่องจักร"
                  columnKey="machineName"
                  sort={sort}
                  onSort={onSort}
                />
              </th>
              <th
                colSpan={3}
                scope="colgroup"
                className={`${headCell} border-s border-border text-center text-muted-foreground`}
              >
                Voltage (V)
              </th>
              <th
                colSpan={3}
                scope="colgroup"
                className={`${headCell} border-s border-border text-center text-muted-foreground`}
              >
                Current (A)
              </th>
              <th rowSpan={2} scope="col" className={`${headCell} border-s border-border`}>
                <SortButton
                  label="PF"
                  columnKey="powerFactor"
                  sort={sort}
                  onSort={onSort}
                  align="end"
                />
              </th>
              <th rowSpan={2} scope="col" className={headCell}>
                <SortButton
                  label="Power(kW)"
                  columnKey="activePowerKw"
                  sort={sort}
                  onSort={onSort}
                  align="end"
                />
              </th>
              <th rowSpan={2} scope="col" className={headCell}>
                <SortButton
                  label="Energy (kWh)"
                  columnKey="energyKwh"
                  sort={sort}
                  onSort={onSort}
                  align="end"
                />
              </th>
            </tr>
            <tr>
              {(
                [
                  ["L1", "v1", true],
                  ["L2", "v2", false],
                  ["L3", "v3", false],
                  ["L1", "c1", true],
                  ["L2", "c2", false],
                  ["L3", "c3", false],
                ] as const
              ).map(([label, key, groupStart]) => (
                <th
                  key={key}
                  scope="col"
                  className={`${headCell} ${groupStart ? "border-s border-border" : ""}`}
                >
                  <SortButton
                    label={label}
                    columnKey={key}
                    sort={sort}
                    onSort={onSort}
                    align="end"
                  />
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {groups !== null &&
              groups.map((group) => (
                <Fragment key={group.department}>
                  <tr className="bg-muted">
                    <td
                      colSpan={11}
                      className={`${cell} font-mono text-2xs uppercase tracking-widest text-muted-foreground`}
                    >
                      {group.department}
                      <span className="ms-3 normal-case tracking-wider">
                        {group.summary
                          ? `${group.summary.running} of ${group.summary.meters} running` +
                            (group.summary.reporting < group.summary.meters
                              ? ` · ${group.summary.meters - group.summary.reporting} silent`
                              : "")
                          : `${group.rows.length} meters`}
                      </span>
                    </td>
                    <td className={`${numeric} font-semibold`}>
                      {formatNumber(group.summary?.activePowerKw ?? null, 1)}
                    </td>
                    {/* No energy subtotal: these are cumulative counters, and
                        adding them together yields a number that means nothing
                        — how long the department's meters have been installed. */}
                    <td className={numeric} />
                  </tr>
                  {group.rows.map((row) => (
                    <Row key={row.meterId} row={row} cell={cell} numeric={numeric} raw={showRaw} labelling={labelling} />
                  ))}
                </Fragment>
              ))}

            {groups === null &&
              visible.map((row) => (
                <Row key={row.meterId} row={row} cell={cell} numeric={numeric} raw={showRaw} labelling={labelling} />
              ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-xs text-muted-foreground">
        {visible.length} of {rows.length} meters
        {department === ALL ? "" : ` · ${department}`} · {cadence}
        {showRaw &&
          " Raw: the payload's integers under each wire key, before any divisor — compare them with the broker's console."}
      </p>
    </section>
  );
}

/** One meter. Extracted so the grouped and flat bodies draw the same row. */
function Row({
  row,
  cell,
  numeric,
  raw = false,
  labelling = false,
}: {
  row: RealtimeTableRow;
  cell: string;
  numeric: string;
  raw?: boolean;
  labelling?: boolean;
}) {
  const dim = row.status === "offline";
  const wire = raw ? (row.raw ?? null) : null;
  /** A scaled value, or its wire integer under the key it arrived as. */
  const show = (field: RawField, scaled: number | null, decimals: number) =>
    raw ? (
      wire === null ? (
        "—"
      ) : (
        <span title={`${wire.prefix}${field}`}>{wire.fields[field]}</span>
      )
    ) : (
      formatNumber(scaled, decimals)
    );
  return (
    <tr
      className={[
        "border-b border-border/60 last:border-b-0",
        dim ? "bg-muted/30 text-muted-foreground" : "",
      ].join(" ")}
    >
      <td className={`${cell} font-mono whitespace-nowrap`}>
        <span className="flex items-center gap-2">
          <Marker row={row} />
          {row.meterNumber}
          {dim ? (
            <span className="text-2xs tracking-wider">
              {formatAge(row.ageMs)}
            </span>
          ) : null}
        </span>
      </td>
      <td className={`${cell} whitespace-nowrap`}>
        {row.department ?? "—"}
      </td>
      <td className={`${cell} font-mono whitespace-nowrap`}>
        {row.machineNumber ?? "—"}
      </td>
      <td className={cell}>
        {row.machineName ??
          (labelling ? (
            <Link
              href={`/meters#${row.meterId}`}
              className="font-mono text-2xs uppercase tracking-wider text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
            >
              add label
            </Link>
          ) : (
            "—"
          ))}
      </td>
      {[0, 1, 2].map((phase) => (
        <td
          key={`v${phase}`}
          className={`${numeric} ${phase === 0 ? "border-s border-border" : ""}`}
        >
          {show((["VL1", "VL2", "VL3"] as const)[phase]!, row.voltage?.[phase] ?? null, 1)}
        </td>
      ))}
      {[0, 1, 2].map((phase) => (
        <td
          key={`c${phase}`}
          className={`${numeric} ${phase === 0 ? "border-s border-border" : ""}`}
        >
          {show((["CL1", "CL2", "CL3"] as const)[phase]!, row.current?.[phase] ?? null, 1)}
        </td>
      ))}
      <td className={`${numeric} border-s border-border`}>
        {show("PF", row.powerFactor, 2)}
      </td>
      <td
        className={[
          numeric,
          row.running && !dim ? "text-foreground" : "",
        ].join(" ")}
      >
        {show("P", row.activePowerKw, 1)}
      </td>
      <td className={numeric}>
        {show("E", row.energyKwh, 1)}
      </td>
    </tr>
  );
}
