import assert from "node:assert/strict";
import { test } from "node:test";
import { MeterRegistry } from "@power-meter/domain";
import { generateFixtures } from "../fixtures/generate.ts";
import { isLoopbackUrl } from "../net.ts";
import { IngesterLatestReadingStore, metadataIdToken } from "./client.ts";
import { readingsFromLatest, toLatestDto, type LatestResponse } from "./dto.ts";

const registry = MeterRegistry.fromWorkbook();
const fixtures = generateFixtures({
  registry,
  from: new Date("2025-09-21T01:00:00Z"),
  to: new Date("2025-09-21T01:05:00Z"),
  intervalMs: 9_000,
});

function respond(body: unknown, status = 200): typeof fetch {
  return (async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(_url), headers: (init?.headers ?? {}) as Record<string, string> });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
}
let calls: { url: string; headers: Record<string, string> }[] = [];

test("a reading survives the trip through /latest and back", async () => {
  calls = [];
  const body: LatestResponse = {
    asOf: new Date().toISOString(),
    readings: JSON.parse(JSON.stringify(fixtures.readings.slice(-55).map(toLatestDto))),
  };
  const store = new IngesterLatestReadingStore({
    url: "https://power-meter-ingester.example.run.app",
    fetch: respond(body),
    token: async () => "id-token",
  });
  const latest = await store.latest();
  const original = fixtures.readings.slice(-55);
  assert.equal(latest.size, new Set(original.map((r) => r.meterId)).size);
  for (const reading of original) {
    const back = latest.get(reading.meterId);
    assert.ok(back);
  }
  const last = original[original.length - 1];
  assert.ok(last);
  assert.deepEqual(latest.get(last.meterId), last);
  assert.equal(calls[0]?.url, "https://power-meter-ingester.example.run.app/latest");
  assert.equal(calls[0]?.headers["authorization"], "Bearer id-token");
});

test("a refused request says what the likely cause is", async () => {
  const store = new IngesterLatestReadingStore({
    url: "https://ingester.example",
    fetch: respond({ error: "forbidden" }, 403),
  });
  await assert.rejects(store.latest(), /403.*run\.invoker/);
});

test("a malformed body fails naming the field, rather than rendering NaN", () => {
  assert.throws(() => readingsFromLatest({}), /no readings array/);
  const good = JSON.parse(JSON.stringify(toLatestDto(fixtures.readings[0]!)));
  assert.throws(
    () => readingsFromLatest({ readings: [{ ...good, activePowerKw: "12" }] }),
    /readings\[0\]\.activePowerKw/,
  );
  assert.throws(
    () => readingsFromLatest({ readings: [{ ...good, voltage: { l1: 1, l2: 2 } }] }),
    /readings\[0\]\.voltage\.l3/,
  );
});

test("an ID token is minted for the ingester's audience and reused until near expiry", async () => {
  let minted = 0;
  const requested: string[] = [];
  let now = 1_000_000_000_000;
  const exp = Math.floor(now / 1000) + 3600;
  const jwt = `x.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.y`;
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    minted += 1;
    requested.push(String(url));
    assert.equal((init?.headers as Record<string, string>)["Metadata-Flavor"], "Google");
    return new Response(jwt);
  }) as typeof fetch;

  const token = metadataIdToken("https://ingester.example", fetcher, () => now);
  assert.equal(await token(), jwt);
  now += 50 * 60_000;
  assert.equal(await token(), jwt);
  assert.equal(minted, 1);
  now += 6 * 60_000; // inside the last five minutes
  await token();
  assert.equal(minted, 2);
  assert.match(requested[0] ?? "", /audience=https%3A%2F%2Fingester\.example$/);
});

test("loopback means this machine, by name, and nothing that merely resolves to it", () => {
  assert.equal(isLoopbackUrl("http://127.0.0.1:8099"), true);
  assert.equal(isLoopbackUrl("http://localhost:8099"), true);
  assert.equal(isLoopbackUrl("http://[::1]:8099"), true);
  assert.equal(isLoopbackUrl("http://localhost.example.com"), false);
  assert.equal(isLoopbackUrl("https://power-meter-ingester-x.a.run.app"), false);
  assert.equal(isLoopbackUrl("not a url"), false);
});
