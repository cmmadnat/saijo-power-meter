import {
  RealtimeTable,
  type RealtimeTableRow,
} from "@/components/realtime-table";
import { formatClock } from "@/lib/format";
import { realtimeSnapshot } from "@/lib/realtime-source";

// The table is a snapshot of now, so there is nothing to cache: every request
// rebuilds it, and the client's refresh interval is what makes it move.
export const dynamic = "force-dynamic";

export default async function RealTimePage() {
  const table = await realtimeSnapshot();

  // Flattened here rather than in the component: the client is handed plain
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

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-4">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Specification page 1 · Real time
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

      {/* Page 1 of the specification shows the Power(kW) panel beginning below
          the table, and page 2 is that panel full-page. It lands in step 4. */}
      <div className="flex items-center gap-3 border border-dashed border-border bg-muted/40 px-4 py-3">
        <span className="bg-primary px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-primary-foreground">
          Step 4
        </span>
        <p className="text-sm text-muted-foreground">
          Power (kW) and Energy (kWh) over time — specification pages 2 and 3 —
          sit below this table and are built next.
        </p>
      </div>
    </div>
  );
}
