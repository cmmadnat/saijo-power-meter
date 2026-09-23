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
import { normalizeLabel, type MeterLabelStore } from "@power-meter/application";
import type { MeterId } from "@power-meter/domain";
import type { DocumentStore } from "../firestore/latest-store.ts";

export const DEFAULT_LABELS_DOCUMENT = "labels/meters";

/** The document, as it is stored. */
export interface LabelsDocument {
  readonly updated_at: string;
  /** Meter id → label. A meter with no label is absent. */
  readonly labels: Readonly<Record<string, string>>;
}

/** Labels out of a document. Tolerant of an absent one: nothing labelled yet. */
export function fromLabelsDocument(
  document: Record<string, unknown> | undefined,
): ReadonlyMap<MeterId, string> {
  const raw = document?.["labels"];
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return new Map();
  const labels = new Map<MeterId, string>();
  for (const [meterId, value] of Object.entries(raw)) {
    const label = typeof value === "string" ? normalizeLabel(value) : null;
    if (label !== null) labels.set(meterId as MeterId, label);
  }
  return labels;
}

export function toLabelsDocument(
  labels: ReadonlyMap<MeterId, string>,
  updatedAt: Date,
): LabelsDocument {
  return {
    updated_at: updatedAt.toISOString(),
    labels: Object.fromEntries([...labels].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
  };
}

export class DocumentMeterLabelStore implements MeterLabelStore {
  readonly #documents: DocumentStore;
  readonly #path: string;

  constructor(documents: DocumentStore, path: string = DEFAULT_LABELS_DOCUMENT) {
    this.#documents = documents;
    this.#path = path;
  }

  async labels(): Promise<ReadonlyMap<MeterId, string>> {
    return fromLabelsDocument(await this.#documents.get(this.#path));
  }

  async setLabels(changes: ReadonlyMap<MeterId, string | null>): Promise<void> {
    if (changes.size === 0) return;
    const next = new Map(await this.labels());
    for (const [meterId, raw] of changes) {
      const label = normalizeLabel(raw);
      if (label === null) next.delete(meterId);
      else next.set(meterId, label);
    }
    await this.#documents.set(
      this.#path,
      toLabelsDocument(next, new Date()) as unknown as Record<string, unknown>,
    );
  }
}
