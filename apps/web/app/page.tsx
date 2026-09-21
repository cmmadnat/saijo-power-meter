import { MeterRegistry } from "@power-meter/domain";
import {
  RealtimeCharts,
  type SelectableMeter,
} from "@/components/realtime-charts";
import {
  RealtimeTable,
  type RealtimeTableRow,
} from "@/components/realtime-table";
import { formatClock } from "@/lib/format";
import { realtimeSnapshot } from "@/lib/realtime-source";
import {
  chartSeries,
  MAX_SERIES,
  parseSelection,
  parseWindow,
  WINDOWS,
} from "@/lib/series-source";

// The table and the charts are both snapshots of now, so there is nothing to
// cache: every request rebuilds them, and the client's refresh interval and the
// selection in the URL are what make them move.
export const dynamic = "force-dynamic";

export default async function RealTimePage(props: PageProps<"/">) {
  const params = await props.searchParams;
  const first = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;

  const registry = MeterRegistry.fromWorkbook();
  const selection = parseSelection(first(params.meters), registry);
  const windowId = parseWindow(first(params.window));

  const [table, charts] = await Promise.all([
    realtimeSnapshot(),
    chartSeries(registry, selection, windowId),
  ]);

  // Flattened here rather than in the components: the client is handed plain
  // values, and the domain's Reading — with its branded id and its Date — stays
  // on the server.
  const rows: RealtimeTableRow[] = table.rows.map((row) => ({
    meterId: row.meterId,
    meterNumber: row.meterNumber,
    department: row.department,
    machineNumber: row.machineNumber,
    machineName: row.machineName,
    voltage: row.reading
      ? [row.reading.voltage.l1, row.reading.voltage.l2, row.reading.voltage.l3]
      : null,
    current: row.reading
      ? [row.reading.current.l1, row.reading.current.l2, row.reading.current.l3]
      : null,
    powerFactor: row.reading?.powerFactor ?? null,
    activePowerKw: row.reading?.activePowerKw ?? null,
    energyKwh: row.reading?.energyKwh ?? null,
    ageMs: row.ageMs,
    status: row.status,
    running: row.running,
  }));

  const meters: SelectableMeter[] = table.rows.map((row) => ({
    meterId: row.meterId,
    meterNumber: row.meterNumber,
    department: row.department,
    machineName: row.machineName,
  }));

  // The colour slot is the meter's position in the selection, held across
  // changes, so it travels with the series rather than with its rank.
  const chartSeriesData = charts.view.series.map((s) => ({
    meterId: s.meterId,
    slot: selection.indexOf(s.meterId) + 1,
    meterNumber: s.meterNumber,
    machineNumber: s.machineNumber,
    machineName: s.machineName,
    activePowerKw: s.points.map((p) => p.activePowerKw),
    energyKwh: s.points.map((p) => p.energyKwh),
  }));

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-4">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Specification pages 1–3 · Real time
          </p>
          <h1 className="text-2xl font-semibold tracking-wide">Power Meter</h1>
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          Fixture data · no meter is connected yet
        </p>
      </header>

      <RealtimeTable
        rows={rows}
        departments={table.departments}
        asOf={formatClock(table.at)}
        counts={table.counts}
      />

      <RealtimeCharts
        meters={meters}
        selection={[...selection]}
        windows={WINDOWS.map((w) => ({ id: w.id, label: w.label }))}
        windowId={windowId}
        times={charts.view.series[0]?.points.map((p) => p.at.getTime()) ?? []}
        series={chartSeriesData}
        bucketMs={charts.view.bucketMs}
        maxSeries={MAX_SERIES}
      />
    </div>
  );
}
