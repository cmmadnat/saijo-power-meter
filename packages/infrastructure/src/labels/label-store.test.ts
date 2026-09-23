import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { MeterId } from "@power-meter/domain";
import type { DocumentStore } from "../firestore/latest-store.ts";
import { fileDocumentStore } from "../observer/snapshot.ts";
import {
  DEFAULT_LABELS_DOCUMENT,
  DocumentMeterLabelStore,
  fromLabelsDocument,
} from "./label-store.ts";

function memory(): DocumentStore & { docs: Map<string, Record<string, unknown>> } {
  const docs = new Map<string, Record<string, unknown>>();
  return {
    docs,
    async get(path) {
      return docs.get(path);
    },
    async set(path, data) {
      docs.set(path, JSON.parse(JSON.stringify(data)) as Record<string, unknown>);
    },
  };
}

const id = (s: string) => s as MeterId;

test("nothing stored is nothing labelled", async () => {
  assert.equal((await new DocumentMeterLabelStore(memory()).labels()).size, 0);
  assert.equal(fromLabelsDocument({ labels: "nonsense" }).size, 0);
  assert.equal(fromLabelsDocument({ labels: [1, 2] }).size, 0);
});

test("a write changes only the meters it names", async () => {
  const documents = memory();
  const store = new DocumentMeterLabelStore(documents);
  await store.setLabels(new Map([[id("s01m1"), "Compressor"], [id("s08m6"), "Press 2"]]));
  await store.setLabels(new Map([[id("s08m6"), "  Press   line 2 "], [id("s02m1"), null]]));
  assert.deepEqual(
    [...(await store.labels())],
    [["s01m1", "Compressor"], ["s08m6", "Press line 2"]],
  );
  assert.ok(documents.docs.has(DEFAULT_LABELS_DOCUMENT));
});

test("an empty label removes it", async () => {
  const store = new DocumentMeterLabelStore(memory());
  await store.setLabels(new Map([[id("s01m1"), "Compressor"]]));
  await store.setLabels(new Map([[id("s01m1"), "   "]]));
  assert.equal((await store.labels()).size, 0);
});

test("round-trips through the file store the local replay uses", async () => {
  const dir = await mkdtemp(join(tmpdir(), "labels-"));
  const store = new DocumentMeterLabelStore(fileDocumentStore(dir));
  await store.setLabels(new Map([[id("s03m4"), "ปั้มเหล็ก 300 Ton : STL003"]]));
  const again = new DocumentMeterLabelStore(fileDocumentStore(dir));
  assert.equal((await again.labels()).get(id("s03m4")), "ปั้มเหล็ก 300 Ton : STL003");
});
