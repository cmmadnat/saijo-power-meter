import assert from "node:assert/strict";
import { test } from "node:test";
import { numericField, parseStationPayload } from "./payload.ts";

test("parses the workbook's sample, leading zero and all", () => {
  // `095` is illegal JSON. Dropping a whole station's readings over a notation
  // question the customer has not answered yet is the wrong trade.
  const payload = parseStationPayload('{"M1VL1":2321,"M1PF":095,"M1E":2324}');
  assert.equal(payload["M1VL1"], 2321);
  assert.equal(payload["M1PF"], 95);
});

test("accepts the quoted form the device may really send", () => {
  const payload = parseStationPayload('{"M1PF":"095"}');
  assert.equal(numericField(payload, "M1PF"), 95);
});

test("leaves zeros inside strings and keys alone", () => {
  const payload = parseStationPayload('{"M01":"note 007","M1P":0}');
  assert.equal(payload["M01"], "note 007");
  assert.equal(payload["M1P"], 0);
});

test("reads a Uint8Array, which is what an MQTT client hands over", () => {
  const bytes = new TextEncoder().encode('{"M1VL1":2321}');
  assert.equal(parseStationPayload(bytes)["M1VL1"], 2321);
});

test("still throws on a payload that is genuinely unreadable", () => {
  assert.throws(() => parseStationPayload("not json at all"));
  assert.throws(() => parseStationPayload("[1,2,3]"), TypeError);
});

test("a missing or non-numeric field reads as null rather than NaN", () => {
  const payload = { M1P: "abc", M1E: null, M1PF: "" };
  assert.equal(numericField(payload, "M1P"), null);
  assert.equal(numericField(payload, "M1E"), null);
  assert.equal(numericField(payload, "M1PF"), null);
  assert.equal(numericField(payload, "absent"), null);
});
