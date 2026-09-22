/**
 * Prove the takeover guard against the real broker.
 *
 * The plan asks for one thing that a local broker cannot answer: *force a
 * second instance and confirm duplicate ingestion is impossible, not merely
 * unlikely*. The ingester's answer has three parts — one Cloud Run instance, a
 * fixed client id so the broker evicts the older session, and an evicted
 * instance that exits instead of reconnecting — and the third reads MQTT 5's
 * disconnect reason code `0x8E`, *session taken over*. The replay harness
 * (aedes) speaks 3.1.1 only, where that code does not exist, so it can show the
 * eviction and not the signal. HiveMQ Cloud speaks 5.
 *
 * This connects twice with the same client id and reports what the first
 * connection is told. It is read-only: it subscribes to nothing, publishes
 * nothing, and writes nothing.
 *
 *     npm run takeover -w @power-meter/ingester
 *
 * **The id is random and shared between the two connections, never the
 * ingester's.** `power-meter-ingester` is exactly the id that would evict a
 * running ingester, and a probe that can take production's subscription away is
 * not a probe worth having.
 *
 * Run it from somewhere with outbound TCP; a Claude cloud session cannot reach
 * this broker at all (see docs/architecture/ingester.md).
 */
import process from "node:process";
import mqtt, { type MqttClient } from "mqtt";
import { brokerConfig } from "./broker-config.ts";

const SESSION_TAKEN_OVER = 0x8e;

const { url, username, password } = await brokerConfig();

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

// One id, used twice. Random so that nothing else on the broker — least of all
// the ingester — is disturbed by this.
const clientId = `power-meter-takeover-${Math.random().toString(16).slice(2, 10)}`;

function connect(label: string): Promise<MqttClient> {
  const client = mqtt.connect(url, {
    clientId,
    clean: true,
    protocolVersion: 5,
    connectTimeout: 20_000,
    // Neither connection reconnects: a probe that raced itself would prove
    // nothing but that both can flap, which is the failure being guarded
    // against rather than the guard.
    reconnectPeriod: 0,
    ...(username === undefined ? {} : { username }),
    ...(password === undefined ? {} : { password }),
  });
  return new Promise((resolve, reject) => {
    client.once("connect", () => {
      log(`${label}: connected as ${clientId}`);
      resolve(client);
    });
    client.once("error", reject);
  });
}

async function connectOrExplain(label: string): Promise<MqttClient> {
  try {
    return await connect(label);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`${label}: could not connect — ${message}`);
    if (/protocol version/i.test(message)) {
      log(
        "This probe is about an MQTT 5 reason code, so it needs an MQTT 5 broker. " +
          "The local replay harness (aedes) speaks 3.1.1 only; point it at HiveMQ.",
      );
    }
    process.exit(1);
  }
}

const first = await connectOrExplain("first ");

let verdict = "the first connection was never told anything; it is still open";
const settled = new Promise<void>((resolve) => {
  first.on("disconnect", (packet) => {
    const code = packet.reasonCode;
    verdict =
      code === SESSION_TAKEN_OVER
        ? `DISCONNECT, reason code ${code} (session taken over) — the guard has its signal`
        : `DISCONNECT, reason code ${String(code)} — NOT 142, so the ingester would read this as an ordinary drop and reconnect`;
    resolve();
  });
  first.on("close", () => {
    // A 3.1.1-style eviction: the socket simply goes. The eviction happened,
    // but nothing says why, and an ingester cannot tell it from a network
    // blip — which is the case that makes two instances flap.
    if (verdict.startsWith("the first")) {
      verdict = "the socket closed with no DISCONNECT packet — the eviction is unattributable";
    }
    resolve();
  });
  setTimeout(() => resolve(), 15_000).unref?.();
});

log("second: connecting with the same id");
const second = await connectOrExplain("second");

await settled;

log("");
log(`verdict: ${verdict}`);

first.end(true);
second.end(true);
process.exitCode = verdict.includes("session taken over") ? 0 : 1;
