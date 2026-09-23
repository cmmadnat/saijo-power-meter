/**
 * Screen 4: History.
 *
 * Server-rendered end to end. The filters are a GET form, so the window lives
 * in the URL and the screen needs no client component at all — unlike the
 * real-time screen, nothing here refreshes, sorts or hovers.
 */
import { formatRunningHours } from "@power-meter/application";
import { MeterRegistry } from "@power-meter/domain";
import { HistoryFilters } from "@/components/history-filters";
import { provenance } from "@/lib/data-mode";
import { formatClockMinutes, formatNumber } from "@/lib/format";
import {
  historySnapshot,
  parseDepartment,
  parseRange,
} from "@/lib/history-source";

// The window comes from the URL and is read per request, so there is nothing
// to cache between them.
export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  timeZone: "Asia/Bangkok",
});

export default async function HistoryPage(props: PageProps<"/history">) {
  const params = await props.searchParams;
  const first = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;

  const registry = MeterRegistry.fromWorkbook();
  const range = parseRange({
    fromDate: first(params.fromDate),
    fromTime: first(params.fromTime),
    toDate: first(params.toDate),
    toTime: first(params.toTime),
  });
  const department = parseDepartment(first(params.department), registry);
  const table = await historySnapshot(range, department);

  const totalEnergy = table.rows.reduce(
    (sum, row) => sum + (row.totalEnergyKwh ?? 0),
    0,
  );
  const totalRunningMs = table.rows.reduce(
    (sum, row) => sum + (row.runningMs ?? 0),
    0,
  );

  const headCell =
    "border-b border-border bg-card px-2 py-2 text-start font-mono text-2xs font-normal uppercase tracking-wider text-muted-foreground";
  const cell = "px-2 py-1.5 align-middle";
  const numeric = `${cell} text-right font-mono tabular-nums`;

  const window = `${DATE.format(range.from)} ${formatClockMinutes(range.from)} → ${DATE.format(range.to)} ${formatClockMinutes(range.to)}`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-4">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Specification page 4 · History
          </p>
          <h1 className="text-2xl font-semibold tracking-wide">History</h1>
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          {provenance().line}
        </p>
      </header>

      <HistoryFilters
        departments={registry.departments()}
        department={department}
        range={range}
      />

      {range.rejected !== null && (
        <p className="border border-status-stale px-4 py-2 text-sm text-foreground">
          Showing today instead — {range.rejected}.
        </p>
      )}

      <section className="flex flex-col gap-4">
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-225 border-collapse text-sm">
            <caption className="sr-only">
              Energy consumed and running hours per meter, {window}
            </caption>
            <thead>
              <tr>
                <th scope="col" className={headCell}>
                  หมายเลขมิเตอร์
                </th>
                <th scope="col" className={headCell}>
                  แผนก
                </th>
                <th scope="col" className={headCell}>
                  หมายเลขเครื่องจักร
                </th>
                <th scope="col" className={headCell}>
                  ชื่อเครื่องจักร
                </th>
                <th scope="col" className={`${headCell} text-end`}>
                  Total Energy (kWh)
                </th>
                <th scope="col" className={`${headCell} text-end`}>
                  ชั่วโมงการทำงาน (Hr:min)
                </th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => {
                // A meter that reported nothing keeps its row — that is the
                // case someone opens this screen to find — but it is washed and
                // quietened so it cannot be mistaken for a machine that ran and
                // used nothing.
                const silent = row.readingCount === 0;
                return (
                  <tr
                    key={row.meterId}
                    className={[
                      "border-b border-border/60 last:border-b-0",
                      silent ? "bg-muted/30 text-muted-foreground" : "",
                    ].join(" ")}
                  >
                    <td className={`${cell} font-mono whitespace-nowrap`}>
                      {row.meterNumber}
                      {silent && (
                        <span className="ms-2 font-mono text-2xs text-muted-foreground">
                          no readings
                        </span>
                      )}
                    </td>
                    <td className={`${cell} whitespace-nowrap`}>
                      {row.department ?? "—"}
                    </td>
                    <td className={`${cell} font-mono whitespace-nowrap`}>
                      {row.machineNumber ?? "—"}
                    </td>
                    <td className={`${cell} whitespace-nowrap`}>
                      {row.machineName ?? "—"}
                    </td>
                    <td className={numeric}>
                      {formatNumber(row.totalEnergyKwh, 1)}
                    </td>
                    <td className={numeric}>
                      {formatRunningHours(row.runningMs)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <td
                  colSpan={4}
                  className={`${cell} font-mono text-2xs uppercase tracking-wider text-muted-foreground`}
                >
                  {table.rows.length} meters · {window}
                </td>
                <td className={`${numeric} font-semibold`}>
                  {formatNumber(totalEnergy, 1)}
                </td>
                <td className={`${numeric} font-semibold`}>
                  {formatRunningHours(totalRunningMs)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="max-w-[80ch] text-sm text-muted-foreground">
          Total energy is the counter&rsquo;s rise across the window, counter
          resets included — the same arithmetic the energy chart plots. Running
          hours count the time a meter spent above its standby level
          ({formatNumber(registry.commissioned()[0]?.standbyPowerKw ?? null, 1)}{" "}
          kW), summed from the gaps between readings; a silence longer than three
          minutes is not counted as running, because nothing was observed through
          it.
          {table.silentCount > 0 &&
            ` ${table.silentCount} of these meters reported nothing in this window and print an em dash rather than a zero.`}
        </p>
      </section>
    </div>
  );
}
