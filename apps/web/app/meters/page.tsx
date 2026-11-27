/**
 * Meters: name the feed's meters.
 *
 * The feed identifies a meter by the topic it arrives on and the prefix its
 * keys carry, and nothing more — both printed here exactly as sent. This is
 * where a meter gets a label people recognise. One form per topic, posting to a server action, so it works without
 * JavaScript and two people labelling different topics do not overwrite
 * each other. Beside each field: the slot's wire key and what it is reading
 * now — switch a machine on and watch which meter moves.
 *
 * Nothing from the workbook or the demo is shown or offered here: a name on
 * this page is one a person gave the meter, and nothing else.
 */
import { MeterRegistry, type Meter } from "@power-meter/domain";
import { saveStationLabels } from "@/app/actions";
import { dataSource, labelStore } from "@/lib/data-mode";
import { formatAge, formatNumber } from "@/lib/format";
import { MAX_LABEL_LENGTH, MAX_MACHINE_NUMBER_LENGTH, type MeterLabel } from "@power-meter/application";
import { DEPARTMENT_FIELD, LABEL_FIELD, LOCATION_FIELD, MACHINE_NUMBER_FIELD } from "@/lib/registry-source";
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
  // Only which slots exist on which topic — the same slots the feed publishes.
  // Nothing else of the workbook reaches this page.
  const slots = MeterRegistry.fromWorkbook();

  const header = (
    <header className="flex flex-col gap-1 border-b border-border pb-4">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        Incoming feed · meter labels
      </p>
      <h1 className="text-2xl font-semibold tracking-wide">Meters</h1>
      <p className="max-w-[80ch] text-sm text-muted-foreground">
        The feed names a meter only by the topic it arrives on and the prefix its keys carry,
        shown here exactly as sent. Add a label to give it context: the Incoming view shows it on
        every screen, and a meter without one says Unlabeled. Department (แผนก) and location
        (สถานที่) can be set here beside the name. Department groups the meter on every screen —
        left empty, the meter is grouped by its topic. Location is a place you type; it does not
        change grouping. Machine number (หมายเลขเครื่อง) is a code typed here, never read out of
        the name. Clear every field to remove a label.
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

  const stations = slots.topics().map((topic) => ({
    topic,
    meters: slots.forTopic(topic).filter((meter) => meter.commissioned),
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
          return (
            <form
              key={topic}
              id={topic}
              action={saveStationLabels}
              className="flex scroll-mt-4 flex-col border border-border bg-card"
            >
              <input type="hidden" name="topic" value={topic} />
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
                <h2 className="font-mono text-base font-semibold">{topic}</h2>
                <span className="font-mono text-2xs tracking-wider text-muted-foreground">
                  {meters.length} meters
                </span>
              </div>

              <ul>
                {meters.map((meter) => (
                  <MeterField
                    key={meter.meterId}
                    meter={meter}
                    label={labels.get(meter.meterId)}
                    row={rowFor.get(meter.meterId)}
                  />
                ))}
              </ul>

              <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
                <button
                  type="submit"
                  className="border border-primary bg-primary px-3 py-1.5 font-mono text-xs tracking-wider text-primary-foreground"
                >
                  Save {topic}
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
  label: MeterLabel | undefined;
  row: Awaited<ReturnType<typeof realtimeSnapshot>>["rows"][number] | undefined;
}) {
  const inputId = `${LABEL_FIELD}${meter.meterId}`;
  const departmentId = `${DEPARTMENT_FIELD}${meter.meterId}`;
  const locationId = `${LOCATION_FIELD}${meter.meterId}`;
  const numberId = `${MACHINE_NUMBER_FIELD}${meter.meterId}`;
  const input =
    "w-full border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:border-accent-strong focus-visible:ring-1 focus-visible:ring-accent-strong";
  const caption = "font-mono text-3xs uppercase tracking-wider text-muted-foreground";
  const status = row?.status ?? "offline";
  return (
    <li
      id={meter.meterId}
      className="flex scroll-mt-4 flex-wrap items-start gap-x-3 gap-y-1 border-b border-border/60 px-4 py-2 last:border-b-0 target:bg-muted/60 sm:flex-nowrap"
    >
      <span className="flex w-14 shrink-0 flex-col pt-5 font-mono text-xs">
        {meter.keyPrefix}
      </span>
      <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-2 gap-y-1">
        <div className="col-span-2 flex flex-col gap-0.5">
          <label htmlFor={inputId} className={caption}>
            Name
          </label>
          <input
            id={inputId}
            name={inputId}
            defaultValue={label?.name ?? ""}
            maxLength={MAX_LABEL_LENGTH}
            placeholder="Unlabeled"
            autoComplete="off"
            className={input}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <label htmlFor={departmentId} className={caption}>
            แผนก · Department
          </label>
          <input
            id={departmentId}
            name={departmentId}
            defaultValue={label?.department ?? ""}
            maxLength={MAX_LABEL_LENGTH}
            placeholder={meter.topic}
            autoComplete="off"
            className={input}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <label htmlFor={locationId} className={caption}>
            สถานที่ · Location
          </label>
          <input
            id={locationId}
            name={locationId}
            defaultValue={label?.location ?? ""}
            maxLength={MAX_LABEL_LENGTH}
            autoComplete="off"
            className={input}
          />
        </div>
        <div className="col-span-2 flex flex-col gap-0.5">
          <label htmlFor={numberId} className={caption}>
            หมายเลขเครื่อง · Machine no.
          </label>
          <input
            id={numberId}
            name={numberId}
            defaultValue={label?.machineNumber ?? ""}
            maxLength={MAX_MACHINE_NUMBER_LENGTH}
            autoComplete="off"
            className={input}
          />
        </div>
      </div>
      <span
        className="ms-17 flex items-center gap-2 font-mono text-2xs text-muted-foreground sm:ms-0 sm:w-28 sm:shrink-0 sm:justify-end sm:pt-5"
        title={row?.ageMs == null ? "Never reported" : `Last reading ${formatAge(row.ageMs)} ago`}
      >
        <span aria-hidden className={`inline-block size-2 ${STATUS_DOT[status]}`} />
        {row?.reading ? `${formatNumber(row.reading.activePowerKw, 1)} kW` : "no reading"}
      </span>
    </li>
  );
}
