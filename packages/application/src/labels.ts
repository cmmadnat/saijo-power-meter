/**
 * Meter labels: what the people watching the feed call each meter.
 *
 * The feed identifies a meter by position and nothing else — a topic, which is
 * a station, and an `M<n>` prefix within its payload. The workbook's machine
 * names and departments describe the plant as specified, and nothing on the
 * wire confirms that slot 6 of station 08 is the machine the workbook puts
 * there. So a view of the real feed names a meter only by what someone has
 * told it, and by its id until then.
 *
 * Labels are display attributes, never identity: a relabelled meter keeps its
 * readings, because they are keyed by `MeterId` and the label is not.
 */
import {
  MeterRegistry,
  type Meter,
  type MeterId,
} from "@power-meter/domain";

/** Where labels are kept. Read whole; written a station's worth at a time. */
export interface MeterLabelStore {
  labels(): Promise<ReadonlyMap<MeterId, string>>;
  /**
   * Apply these changes and leave every other label as it was. A null or
   * empty label removes it.
   */
  setLabels(changes: ReadonlyMap<MeterId, string | null>): Promise<void>;
}

/** Long enough for a machine name and its code; short enough for a table cell. */
export const MAX_LABEL_LENGTH = 60;

/**
 * A label as typed, made storable: whitespace collapsed, control characters
 * dropped, cut to `MAX_LABEL_LENGTH`. Null when nothing is left, which means
 * "no label".
 */
export function normalizeLabel(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const cleaned = [...raw.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim()]
    .slice(0, MAX_LABEL_LENGTH)
    .join("")
    .trim();
  return cleaned === "" ? null : cleaned;
}

/**
 * The registry as the real feed knows it: the same meters in the same slots,
 * grouped by the topic they arrive on and named only by label — everything
 * printed as the payload sends it or as a person typed it.
 *
 * `department` carries the topic, verbatim, because department is what every
 * screen groups and filters by — the table's bands, the chart picker, the
 * strip's busiest group — and the topic is the grouping the feed actually
 * has. `verbatim` makes the meter's number its key prefix (`M6`) and keeps a
 * label whole. An unlabelled meter has no name, and the screens say so.
 */
export function labelledRegistry(
  registry: MeterRegistry,
  labels: ReadonlyMap<MeterId, string>,
): MeterRegistry {
  return MeterRegistry.of(
    registry.all().map(
      (meter): Meter => ({
        ...meter,
        department: meter.topic,
        machineName: labels.get(meter.meterId) ?? null,
        verbatim: true,
      }),
    ),
  );
}
