/**
 * Meter labels, in one Firestore document.
 *
 * One document for the same reasons the restart state and the observer's
 * snapshot are one each: 55 short strings are a few KB against a 1 MiB
 * limit, a screen needs all of them at once, and one read is cheaper than 55.
 * Unlike those two it is edited by people, a station at a time, so a write
 * reads the document and changes only the meters it was given — two people
 * labelling different stations do not undo each other. Two people labelling
 * the *same* meter in the same second is last-write-wins, which is as much as
 * a label is worth.
 *
 * `labels/meters`, beside `observer/latest` and `ingester/latest` in the
 * `(default)` database and never at either of their paths.
 */
import {
  normalizeMeterLabel,
  type MeterLabel,
  type MeterLabelInput,
  type MeterLabelStore,
} from "@power-meter/application";
import type { MeterId } from "@power-meter/domain";
import type { DocumentStore } from "../firestore/latest-store.ts";

export const DEFAULT_LABELS_DOCUMENT = "labels/meters";

/** The document, as it is stored. */
export interface LabelsDocument {
  readonly updated_at: string;
  /**
   * Meter id → label. A meter with no label is absent. The value is a name
   * string (every document written before departments and machine numbers) or
   * an object. Both are read; this app writes the object form, leaving out
   * the fields that are empty.
   */
  readonly labels: Readonly<Record<string, string | StoredLabel>>;
}

export interface StoredLabel {
  readonly name?: string;
  readonly department?: string;
  readonly location?: string;
  readonly machine_number?: string;
}

/** Labels out of a document. Tolerant of an absent one: nothing labelled yet. */
export function fromLabelsDocument(
  document: Record<string, unknown> | undefined,
): ReadonlyMap<MeterId, MeterLabel> {
  const raw = document?.["labels"];
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return new Map();
  const labels = new Map<MeterId, MeterLabel>();
  for (const [meterId, value] of Object.entries(raw)) {
    let input: MeterLabelInput | null = null;
    if (typeof value === "string") input = value;
    else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const field = (key: string): string | null => {
        const v = (value as Record<string, unknown>)[key];
        return typeof v === "string" ? v : null;
      };
      input = { name: field("name"), department: field("department"), location: field("location"), machineNumber: field("machine_number") };
    }
    const label = normalizeMeterLabel(input);
    if (label !== null) labels.set(meterId as MeterId, label);
  }
  return labels;
}

export function toLabelsDocument(
  labels: ReadonlyMap<MeterId, MeterLabel>,
  updatedAt: Date,
): LabelsDocument {
  return {
    updated_at: updatedAt.toISOString(),
    labels: Object.fromEntries(
      [...labels]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([meterId, label]) => [
          meterId,
          {
            ...(label.name === null ? {} : { name: label.name }),
            ...(label.department === null ? {} : { department: label.department }),
            ...(label.location === null ? {} : { location: label.location }),
            ...(label.machineNumber === null ? {} : { machine_number: label.machineNumber }),
          },
        ]),
    ),
  };
}

export class DocumentMeterLabelStore implements MeterLabelStore {
  readonly #documents: DocumentStore;
  readonly #path: string;

  constructor(documents: DocumentStore, path: string = DEFAULT_LABELS_DOCUMENT) {
    this.#documents = documents;
    this.#path = path;
  }

  async labels(): Promise<ReadonlyMap<MeterId, MeterLabel>> {
    return fromLabelsDocument(await this.#documents.get(this.#path));
  }

  async setLabels(changes: ReadonlyMap<MeterId, MeterLabelInput | null>): Promise<void> {
    if (changes.size === 0) return;
    const next = new Map(await this.labels());
    for (const [meterId, raw] of changes) {
      const label = normalizeMeterLabel(raw);
      if (label === null) next.delete(meterId);
      else next.set(meterId, label);
    }
    await this.#documents.set(
      this.#path,
      toLabelsDocument(next, new Date()) as unknown as Record<string, unknown>,
    );
  }
}
