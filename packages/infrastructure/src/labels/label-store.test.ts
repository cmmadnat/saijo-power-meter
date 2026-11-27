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
    [
      ["s01m1", { name: "Compressor", department: null, location: null, machineNumber: null }],
      ["s08m6", { name: "Press line 2", department: null, location: null, machineNumber: null }],
    ],
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
  assert.equal((await again.labels()).get(id("s03m4"))?.name, "ปั้มเหล็ก 300 Ton : STL003");
});

test("an old document of plain strings still reads, as names", () => {
  const labels = fromLabelsDocument({ labels: { s01m1: "Compressor", s02m1: "  " } });
  assert.deepEqual([...labels], [["s01m1", { name: "Compressor", department: null, location: null, machineNumber: null }]]);
});

test("object labels read and write, and empty fields are left out", async () => {
  const documents = memory();
  const store = new DocumentMeterLabelStore(documents);
  await store.setLabels(
    new Map([
      [id("s01m1"), { name: "Compressor", department: "แผนกลม", location: "อาคาร A", machineNumber: "CP-01" }],
      [id("s02m1"), { name: null, department: "  ", machineNumber: "A1" }],
    ]),
  );
  const stored = documents.docs.get(DEFAULT_LABELS_DOCUMENT)?.["labels"];
  assert.deepEqual(stored, {
    s01m1: { name: "Compressor", department: "แผนกลม", location: "อาคาร A", machine_number: "CP-01" },
    s02m1: { machine_number: "A1" },
  });
  assert.deepEqual((await store.labels()).get(id("s01m1")), {
    name: "Compressor",
    department: "แผนกลม",
    location: "อาคาร A",
    machineNumber: "CP-01",
  });
});

test("an old string and a new object coexist, and a save touches only what it names", async () => {
  const documents = memory();
  documents.docs.set(DEFAULT_LABELS_DOCUMENT, { updated_at: "x", labels: { s01m1: "Compressor" } });
  const store = new DocumentMeterLabelStore(documents);
  await store.setLabels(new Map([[id("s02m1"), { department: "D" }]]));
  const labels = await store.labels();
  assert.equal(labels.get(id("s01m1"))?.name, "Compressor");
  assert.equal(labels.get(id("s02m1"))?.department, "D");
  // Clearing every field removes the meter.
  await store.setLabels(new Map([[id("s02m1"), { name: "", department: "", location: "", machineNumber: "" }]]));
  assert.equal((await store.labels()).has(id("s02m1")), false);
});
