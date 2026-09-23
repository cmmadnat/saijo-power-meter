/**
 * Meters: name the feed's meters.
 *
 * The feed identifies a meter by its station's topic and an `M<n>` slot and
 * nothing more, so this is where a meter gets a name people recognise. One
 * form per station, posting to a server action, so it works without
 * JavaScript and two people labelling different stations do not overwrite
 * each other. Beside each field: the slot's wire key, what it is reading now
 * — switch a machine on and watch which meter moves — and the machine the
 * workbook puts in that slot, which is a suggestion and not a fact.
 */
import { meterNumber, MeterRegistry, type Meter } from "@power-meter/domain";
import { stationName } from "@power-meter/application";
import { saveStationLabels } from "@/app/actions";
import { dataSource, labelStore } from "@/lib/data-mode";
import { formatAge, formatNumber } from "@/lib/format";
import { LABEL_FIELD } from "@/lib/registry-source";
import { realtimeSnapshot } from "@/lib/realtime-source";

export const dynamic = "force-dynamic";

const STATUS_DOT = {
  live: "bg-status-live",
  stale: "bg-status-stale",
  offline: "bg-status-offline",
} as const;

export default async function MetersPage(props: PageProps<"/meters">) {
  const params = await props.searchParams;
  const saved = typeof params.saved === "string" ? params.saved : null;

  const store = await labelStore();
  const workbook = MeterRegistry.fromWorkbook();

  const header = (
    <header className="flex flex-col gap-1 border-b border-border pb-4">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        Incoming feed · meter labels
      </p>
      <h1 className="text-2xl font-semibold tracking-wide">Meters</h1>
      <p className="max-w-[80ch] text-sm text-muted-foreground">
        The feed names a meter only by its station&rsquo;s topic and its slot. Give each one a
        name here and the Incoming view uses it on every screen; a meter without one shows its
        number. Clear a field to remove its label.
      </p>
    </header>
  );

  if (store === null) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <p className="max-w-[80ch] border border-border bg-card p-6 text-sm">
          This deployment has no Incoming feed, so there are no meters to label.
        </p>
      </div>
    );
  }

  const [labels, table] = await Promise.all([
    store.labels(),
    realtimeSnapshot(dataSource("incoming")),
  ]);
  const rowFor = new Map(table.rows.map((row) => [row.meterId, row]));

  const stations = workbook.topics().map((topic) => ({
    topic,
    meters: workbook.forTopic(topic).filter((meter) => meter.commissioned),
  }));
  const labelled = labels.size;
  const total = stations.reduce((sum, s) => sum + s.meters.length, 0);

  return (
    <div className="flex flex-col gap-6">
      {header}
      <p className="font-mono text-xs text-muted-foreground">
        {labelled} of {total} meters labelled · readings as of the observer&rsquo;s last snapshot
      </p>

      <div className="grid gap-4 xl:grid-cols-2">
        {stations.map(({ topic, meters }) => {
          const station = meters[0]?.station ?? 0;
          return (
            <form
              key={topic}
              id={topic}
              action={saveStationLabels}
              className="flex scroll-mt-4 flex-col border border-border bg-card"
            >
              <input type="hidden" name="topic" value={topic} />
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
                <h2 className="text-base font-semibold">{stationName(station)}</h2>
                <span className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">
                  {topic} · {meters.length} meters
                </span>
              </div>

              <ul>
                {meters.map((meter) => (
                  <MeterField
                    key={meter.meterId}
                    meter={meter}
                    label={labels.get(meter.meterId) ?? ""}
                    row={rowFor.get(meter.meterId)}
                  />
                ))}
              </ul>

              <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
                <button
                  type="submit"
                  className="border border-primary bg-primary px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-primary-foreground"
                >
                  Save {stationName(station)}
                </button>
                <button
                  type="submit"
                  name="fill"
                  value="workbook"
                  className="border border-border px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-muted-foreground hover:border-accent-strong hover:text-foreground"
                  title="Save, filling every empty field with the machine the workbook lists for that slot"
                >
                  Fill empty from workbook
                </button>
                {saved === topic && (
                  <span role="status" className="font-mono text-2xs uppercase tracking-wider text-accent-strong">
                    Saved
                  </span>
                )}
              </div>
            </form>
          );
        })}
      </div>
    </div>
  );
}

function MeterField({
  meter,
  label,
  row,
}: {
  meter: Meter;
  label: string;
  row: Awaited<ReturnType<typeof realtimeSnapshot>>["rows"][number] | undefined;
}) {
  const inputId = `${LABEL_FIELD}${meter.meterId}`;
  const status = row?.status ?? "offline";
  return (
    <li
      id={meter.meterId}
      className="flex scroll-mt-4 flex-wrap items-start gap-x-3 gap-y-1 border-b border-border/60 px-4 py-2 last:border-b-0 target:bg-muted/60 sm:flex-nowrap"
    >
      <label htmlFor={inputId} className="flex w-14 shrink-0 flex-col pt-1.5 font-mono text-xs">
        <span>{meterNumber(meter)}</span>
        <span className="text-2xs text-muted-foreground">{meter.keyPrefix}</span>
      </label>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <input
          id={inputId}
          name={inputId}
          defaultValue={label}
          maxLength={60}
          placeholder={`${meterNumber(meter)} — unlabelled`}
          autoComplete="off"
          className="w-full border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:border-accent-strong focus-visible:ring-1 focus-visible:ring-accent-strong"
        />
        {meter.machineName !== null && (
          <span className="truncate text-2xs text-muted-foreground" title={meter.machineName}>
            Workbook: {meter.machineName}
          </span>
        )}
      </div>
      <span
        className="ms-17 flex items-center gap-2 font-mono text-2xs text-muted-foreground sm:ms-0 sm:w-28 sm:shrink-0 sm:justify-end sm:pt-2"
        title={row?.ageMs == null ? "Never reported" : `Last reading ${formatAge(row.ageMs)} ago`}
      >
        <span aria-hidden className={`inline-block size-2 ${STATUS_DOT[status]}`} />
        {row?.reading ? `${formatNumber(row.reading.activePowerKw, 1)} kW` : "no reading"}
      </span>
    </li>
  );
}
