/**
 * Listen to the real broker, print what arrives, and settle the scaling
 * question.
 *
 * This is not the ingester and deliberately shares nothing with it but the
 * registry. It writes no warehouse rows, decodes nothing into engineering
 * units, and holds no state — it subscribes, prints the raw integers verbatim,
 * and saves them. That is why it is allowed to point at the real broker while
 * `apps/ingester` is not: there is nothing here for a wrong divisor to corrupt.
 *
 *     MQTT_URL='mqtts://<cluster>.s1.eu.hivemq.cloud:8883' \
 *     MQTT_USERNAME='...' MQTT_PASSWORD='...' \
 *     npm run capture -w @power-meter/ingester -- --messages 9 --out capture.jsonl
 *
 * **Run it from somewhere with plain outbound TCP.** A Claude cloud session has
 * no egress on 1883 or 8883 — only HTTPS through an agent proxy — so this will
 * time out there and needs a laptop, Cloud Shell or the factory network.
 *
 * Two safety properties, both deliberate:
 *
 * - **A random client id**, never the ingester's fixed one. Connecting with
 *   `power-meter-ingester` would make the broker evict a running ingester, and
 *   a diagnostic must not take production's subscription away.
 * - **A clean session, QoS 0.** Nothing is queued for this client while it is
 *   away, so a capture left half-finished does not accumulate a backlog on the
 *   broker or compete with the ingester's own persistent session.
 *
 * ## What it answers
 *
 * The workbook documents one divisor of nine. Voltage is stated (`data / 10`),
 * current and power factor are pinned by physics, and **active power and energy
 * are guesses** — see `docs/requirements/power-meter-mqtt.md`. So for every
 * meter that reports, this prints:
 *
 * - the raw integers exactly as they arrived;
 * - three-phase apparent-times-PF power computed from V, I and PF, which is
 *   what `M<n>P` has to agree with;
 * - what `M<n>P` would read at each candidate divisor, with the one that
 *   matches marked.
 *
 * On a *running* meter that is enough to settle active power arithmetically.
 * Energy still needs one meter's own display reading at a known moment, because
 * a counter cannot be cross-checked against anything else in the payload.
 */
import { appendFile } from "node:fs/promises";
import process from "node:process";
import mqtt from "mqtt";
import { MeterRegistry } from "@power-meter/domain";
import { numericField, parseStationPayload, SCALES } from "@power-meter/infrastructure";

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

const url = process.env["MQTT_URL"];
if (url === undefined || url === "") {
  throw new Error(
    "MQTT_URL is required — the HiveMQ cluster address, which the customer's " +
      "workbook does not contain. Ask for it alongside the credentials.",
  );
}

const wanted = Number(arg("messages", "9"));
const out = arg("out", "");
const registry = MeterRegistry.fromWorkbook();
const topics = registry.topics();

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

const client = mqtt.connect(url, {
  // Random, never the ingester's fixed id: an id collision evicts whoever
  // holds it, and a diagnostic must not take production's subscription away.
  clientId: `power-meter-capture-${Math.random().toString(16).slice(2, 10)}`,
  clean: true,
  // 5 against HiveMQ. `MQTT_PROTOCOL_VERSION=4` is for pointing this at the
  // local replay broker, which speaks 3.1.1 only — useful for checking the
  // tool itself, never for reading a real meter.
  protocolVersion: process.env["MQTT_PROTOCOL_VERSION"] === "4" ? 4 : 5,
  connectTimeout: 20_000,
  reconnectPeriod: 0,
  ...(process.env["MQTT_USERNAME"] === undefined
    ? {}
    : { username: process.env["MQTT_USERNAME"] }),
  ...(process.env["MQTT_PASSWORD"] === undefined
    ? {}
    : { password: process.env["MQTT_PASSWORD"] }),
});

let seen = 0;

client.on("connect", () => {
  log(`connected; subscribing to ${topics.length} topic(s), waiting for ${wanted} message(s)`);
  client.subscribe([...topics], { qos: 0 }, (error) => {
    if (error) {
      log(`subscribe failed: ${error.message}`);
      client.end(true);
      process.exitCode = 1;
    }
  });
});

client.on("error", (error) => {
  log(`broker error: ${error.message}`);
  client.end(true);
  process.exitCode = 1;
});

client.on("message", (topic, payload) => {
  seen += 1;
  const at = new Date().toISOString();
  const text = payload.toString("utf8");

  log("");
  log(`--- ${at}  ${topic}`);
  // Verbatim, before anything parses it: whether the device really sends
  // `"M1PF":095` — which is not valid JSON — is one of the open questions, and
  // a pretty-printed reparse would hide the answer.
  log(text);

  if (out !== "") {
    void appendFile(out, `${JSON.stringify({ at, topic, payload: text })}\n`);
  }

  try {
    report(topic, text);
  } catch (error) {
    log(`could not parse: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (seen >= wanted) {
    log("");
    log(`captured ${seen} message(s)${out === "" ? "" : ` to ${out}`}`);
    client.end(false);
  }
});

/** What the payload implies, meter by meter. */
function report(topic: string, text: string): void {
  const fields = parseStationPayload(text);

  for (const meter of registry.forTopic(topic)) {
    const p = meter.keyPrefix;
    const raw = (key: string): number | null => numericField(fields, key);

    const vl = [raw(`${p}VL1`), raw(`${p}VL2`), raw(`${p}VL3`)];
    const cl = [raw(`${p}CL1`), raw(`${p}CL2`), raw(`${p}CL3`)];
    const rawP = raw(`${p}P`);
    const rawPf = raw(`${p}PF`);
    const rawE = raw(`${p}E`);
    if (vl.some((v) => v === null) || cl.some((c) => c === null) || rawP === null) continue;

    const volts = vl.map((v) => (v as number) / SCALES.voltage.divisor);
    const amps = cl.map((c) => (c as number) / SCALES.current.divisor);
    const pf = rawPf === null ? null : rawPf / SCALES.powerFactor.divisor;

    // Sum over phases rather than 3 x one of them: the phases are not required
    // to be balanced and on a real machine they will not be.
    const impliedKw =
      pf === null
        ? null
        : volts.reduce((sum, v, i) => sum + v * (amps[i] ?? 0) * pf, 0) / 1000;

    const label = `${meter.meterId}${meter.commissioned ? "" : " (uncommissioned)"}`;
    log(
      `  ${label}  V ${volts.map((v) => v.toFixed(1)).join("/")}  ` +
        `I ${amps.map((a) => a.toFixed(1)).join("/")}  PF ${pf?.toFixed(2) ?? "?"}`,
    );
    if (impliedKw !== null) {
      log(`    V x I x PF over three phases = ${impliedKw.toFixed(2)} kW`);
    }
    log(
      `    M${meter.slot}P raw ${rawP} -> ` +
        [1, 10, 100, 1000]
          .map((divisor) => {
            const value = rawP / divisor;
            const near =
              impliedKw !== null &&
              impliedKw > 0.1 &&
              Math.abs(value - impliedKw) / impliedKw < 0.15;
            return `/${divisor} = ${value.toFixed(2)}${near ? " kW  <== matches" : ""}`;
          })
          .join("   "),
    );
    if (rawE !== null) {
      log(
        `    M${meter.slot}E raw ${rawE} -> ` +
          [1, 10, 100].map((d) => `/${d} = ${(rawE / d).toFixed(2)}`).join("   ") +
          "   (needs the meter's own display to settle)",
      );
    }
  }
}
