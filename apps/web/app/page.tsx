import type { Meter, MeterId } from "@power-meter/domain";
import { rawFieldsOf } from "@power-meter/infrastructure";
import {
  RealtimeCharts,
  type SelectableMeter,
} from "@/components/realtime-charts";
import { FleetStrip } from "@/components/fleet-strip";
import { FeedBanner } from "@/components/feed-banner";
import { feedCondition } from "@/lib/feed-condition";
import {
  RealtimeTable,
  type RealtimeTableRow,
} from "@/components/realtime-table";
import { formatAge, formatClock, formatClockMinutes } from "@/lib/format";
import { dataSource, provenance } from "@/lib/data-mode";
import { currentView } from "@/lib/view";
import { registryFor } from "@/lib/registry-source";
import { feedStatus, fleetTrendSnapshot, realtimeSnapshot } from "@/lib/realtime-source";
import {
  chartSeries,
  MAX_SERIES,
  parseSelection,
  parseWindow,
  windowsFor,
} from "@/lib/series-source";

// The table and the charts are both snapshots of now, so there is nothing to
// cache: every request rebuilds them, and the client's refresh interval and the
// selection in the URL are what make them move.
export const dynamic = "force-dynamic";

export default async function RealTimePage(props: PageProps<"/">) {
  const params = await props.searchParams;
  const first = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;

  // One view for the whole page, and every source function handed the same
  // source for it: the toggle switches the app, never one panel of it.
  const view = await currentView();
  const source = dataSource(view);
  const { records, maxSeriesMs, labels } = await source;
  const windows = windowsFor(maxSeriesMs);
  // Where labels are kept, the table links an unlabelled meter to the page
  // that names it.
  const labelling = labels !== undefined;

  const registry = await registryFor(source);
  const selection = parseSelection(first(params.meters), registry);
  const windowId = parseWindow(first(params.window), windows);

  const [table, charts, trend, feed] = await Promise.all([
    realtimeSnapshot(source),
    chartSeries(registry, selection, windowId, source),
    fleetTrendSnapshot(source),
    feedStatus(source),
  ]);

  // Incoming only: the wire integers under each value, recovered exactly from
  // the scaled reading, so the table can show what the broker's console shows.
  const rawFor = (meterId: string, reading: (typeof table.rows)[number]["reading"]) => {
    if (view !== "incoming" || reading === null) return null;
    const prefix = registry.find(meterId as MeterId)?.keyPrefix;
    return prefix === undefined ? null : { prefix, fields: rawFieldsOf(reading) };
  };

  // What an Incoming screen prints for a meter nobody has named. Said plainly,
  // never stood in for by a number or a workbook name.
  const UNLABELED = "Unlabeled";

  // Which meter a payload problem was about: the topic and key prefix as the
  // payload sent them, and its label or that it has none. The decoder names
  // the meter when it got that far and the wire key when it did not; a key
  // resolves to the slot on its topic whose prefix it starts with.
  const issueMeter = (issue: { topic: string; meterId?: string; key?: string }): string => {
    const key = issue.key ?? "";
    const meter: Meter | undefined =
      (issue.meterId === undefined ? undefined : registry.find(issue.meterId as MeterId)) ??
      registry
        .forTopic(issue.topic)
        .filter((m) => key.startsWith(m.keyPrefix))
        .sort((a, b) => b.keyPrefix.length - a.keyPrefix.length)[0];
    if (meter === undefined) return issue.topic;
    return `${meter.topic} ${meter.keyPrefix} · ${meter.machineName ?? UNLABELED}`;
  };

  // What the footer says about cadence: the specification's, or the one the
  // observer measured and the thresholds derived from it.
  const cadence =
    feed.publishIntervalMs === null
      ? view === "incoming"
        ? "no publish interval measured yet — thresholds are the specification's 30 s and 3 min until one is."
        : undefined
      : `the observer measured one publish every ${formatAge(feed.publishIntervalMs)}; live within ${formatAge(feed.thresholds.liveWithinMs)}, offline after ${formatAge(feed.thresholds.staleWithinMs)} of silence.`;

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
    raw: rawFor(row.meterId, row.reading),
  }));

  const meters: SelectableMeter[] = table.rows.map((row) => ({
    meterId: row.meterId,
    meterNumber: row.meterNumber,
    department: row.department,
    machineName: row.machineName ?? (labelling ? UNLABELED : null),
  }));

  // The colour slot is the meter's position in the selection, held across
  // changes, so it travels with the series rather than with its rank.
  const chartSeriesData = charts.view.series.map((s) => ({
    meterId: s.meterId,
    slot: selection.indexOf(s.meterId) + 1,
    // A legend has no group column beside it, so an Incoming series names its
    // topic too: `M6` alone is on every station.
    meterNumber: labelling
      ? `${registry.find(s.meterId)?.topic ?? ""} ${s.meterNumber}`.trim()
      : s.meterNumber,
    machineNumber: s.machineNumber,
    machineName: s.machineName ?? (labelling ? UNLABELED : null),
    activePowerKw: s.points.map((p) => p.activePowerKw),
    // The counter's rise across the window, not the counter: four counters
    // plotted raw are four flat parallel lines whose spacing is only how long
    // each meter has been installed.
    energyConsumedKwh: s.points.map((p) => p.energyConsumedKwh),
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
          {provenance(view).line}
          {feed.observedAt !== null && ` · observer as of ${formatClock(feed.observedAt)}`}
        </p>
      </header>

      {view === "incoming" && (
        <FeedBanner
          condition={feedCondition(feed, table.at)}
          issues={[...(feed.health?.recentIssues ?? [])].reverse().map((issue) => ({
            at: formatClock(issue.at),
            topic: issue.topic,
            meter: issueMeter(issue),
            kind: issue.kind,
            where: issue.key ?? issue.meterId ?? null,
            detail: issue.detail,
          }))}
          issueCounts={feed.health?.issueCounts ?? {}}
        />
      )}

      <FleetStrip
        counts={table.counts}
        totalActivePowerKw={table.totalActivePowerKw}
        byDepartment={table.byDepartment}
        meterCount={table.rows.length}
        statuses={table.rows.map((row) => row.status)}
        asOf={formatClock(table.at)}
        energyTodayKwh={trend.energyTodayKwh}
        energyMeters={trend.energyMeters}
        energySince={formatClockMinutes(trend.dayStart)}
        energyRecorded={records}
        spark={trend.spark.map((point) => ({
          label: formatClockMinutes(point.at),
          kw: point.activePowerKw,
          meters: point.meters,
        }))}
      />

      {/*
        Charts above the table, which inverts the mock-up: page 1 draws the
        table first with the kW panel beginning below it. The reorder is the
        customer's own call and is flagged as a deviation in
        docs/requirements/power-meter-ui.md. The reasoning behind it: the strip
        and the two charts are what a glance is for, and a 55-row, 15-column
        table pushes them below the fold on every screen it was checked on. The
        table stays the detail view, reached by scrolling to it.
      */}
      <RealtimeCharts
        meters={meters}
        selection={[...selection]}
        windows={windows.map((w) => ({ id: w.id, label: w.label }))}
        windowId={windowId}
        windowLabel={
          windows.find((w) => w.id === windowId)?.label ?? windowId
        }
        energyRecorded={records}
        since={formatClockMinutes(charts.view.from)}
        times={charts.view.series[0]?.points.map((p) => p.at.getTime()) ?? []}
        series={chartSeriesData}
        bucketMs={charts.view.bucketMs}
        maxSeries={MAX_SERIES}
      />

      <RealtimeTable
        rows={rows}
        departments={table.departments}
        byDepartment={table.byDepartment.map((d) => ({ ...d }))}
        asOf={formatClock(table.at)}
        counts={table.counts}
        labelling={labelling}
        {...(cadence === undefined ? {} : { cadence })}
      />
    </div>
  );
}
