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

/**
 * What a person has told the system about one meter. Every field is optional;
 * a meter with every field empty has no label at all.
 */
export interface MeterLabel {
  readonly name: string | null;
  /** แผนก. Null falls back to the topic in `labelledRegistry`. */
  readonly department: string | null;
  /** สถานที่ — typed, and not used for grouping. */
  readonly location: string | null;
  /** หมายเลขเครื่อง — typed, never parsed out of the name. */
  readonly machineNumber: string | null;
}

/** A label as typed or as an old document had it: a bare string is a name. */
export type MeterLabelInput =
  | string
  | { readonly name?: string | null; readonly department?: string | null; readonly location?: string | null; readonly machineNumber?: string | null };

/** Where labels are kept. Read whole; written a station's worth at a time. */
export interface MeterLabelStore {
  labels(): Promise<ReadonlyMap<MeterId, MeterLabel>>;
  /**
   * Apply these changes and leave every other label as it was. A null label,
   * or one with every field empty, removes it. A string is a name only.
   */
  setLabels(changes: ReadonlyMap<MeterId, MeterLabelInput | null>): Promise<void>;
}

/** A machine number is a code, so it gets less room than a name. */
export const MAX_MACHINE_NUMBER_LENGTH = 30;

/** Long enough for a machine name and its code; short enough for a table cell. */
export const MAX_LABEL_LENGTH = 60;

/**
 * A label as typed, made storable: whitespace collapsed, control characters
 * dropped, cut to `MAX_LABEL_LENGTH`. Null when nothing is left, which means
 * "no label".
 */
export function normalizeLabel(
  raw: string | null | undefined,
  maxLength: number = MAX_LABEL_LENGTH,
): string | null {
  if (raw === null || raw === undefined) return null;
  const cleaned = [...raw.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim()]
    .slice(0, maxLength)
    .join("")
    .trim();
  return cleaned === "" ? null : cleaned;
}

/**
 * A whole label, made storable field by field. Null when every field is empty.
 * A bare string is a name — the shape every document had before departments
 * and machine numbers existed.
 */
export function normalizeMeterLabel(raw: MeterLabelInput | null | undefined): MeterLabel | null {
  if (raw === null || raw === undefined) return null;
  const input = typeof raw === "string" ? { name: raw } : raw;
  const label: MeterLabel = {
    name: normalizeLabel(input.name),
    department: normalizeLabel(input.department),
    location: normalizeLabel(input.location),
    machineNumber: normalizeLabel(input.machineNumber, MAX_MACHINE_NUMBER_LENGTH),
  };
  return label.name === null &&
    label.department === null &&
    label.location === null &&
    label.machineNumber === null
    ? null
    : label;
}

/**
 * The registry as the real feed knows it: the same meters in the same slots,
 * grouped by the topic they arrive on and named only by label — everything
 * printed as the payload sends it or as a person typed it.
 *
 * `department` is the one a person typed, because it is what every screen
 * groups and filters by — the table's bands, the chart picker, the strip's
 * busiest group. Where nobody typed one it falls back to the topic, the
 * grouping the feed actually has, so no meter is ever without a group.
 * `verbatim` makes the meter's number its key prefix (`M6`) and keeps the name
 * whole; the machine number is the typed one, never split from the name. An
 * unlabelled meter has no name, and the screens say so.
 */
export function labelledRegistry(
  registry: MeterRegistry,
  labels: ReadonlyMap<MeterId, MeterLabel>,
): MeterRegistry {
  return MeterRegistry.of(
    registry.all().map((meter): Meter => {
      const label = labels.get(meter.meterId);
      return {
        ...meter,
        department: label?.department ?? meter.topic,
        location: label?.location ?? null,
        machineName: label?.name ?? null,
        machineNumber: label?.machineNumber ?? null,
        verbatim: true,
      };
    }),
  );
}
