/**
 * A broker on loopback, replaying the step-2 fixtures at the real rate.
 *
 * This is how the ingester is verified without the customer's broker, and it is
 * as close to the real thing as the protocol allows: the payloads are built by
 * `toStationPayload`, the decoder's exact inverse, so what arrives on the wire
 * is byte-shaped like a station message and decodes back to the readings that
 * produced it. Nine topics, one message a second, each station therefore every
 * nine seconds — the plan's 60 messages a minute.
 *
 *     npm run replay -w @power-meter/ingester -- --minutes 5
 *     npm run replay -w @power-meter/ingester -- --minutes 10 --drop-at 60 --drop-for 45
 *
 * `--drop-at` and `--drop-for` take the broker down mid-run and bring it back,
 * which is the reconnect case. Messages published while it is down are gone —
 * this harness has no queue, where HiveMQ has one bounded at 1000 messages —
 * so what it proves is that the subscriber comes back and resumes, not that
 * nothing was lost.
 *
 * It refuses to bind anything but loopback, because the ingester's startup gate
 * lets the unconfirmed scale factors through only for a broker on loopback
 * writing nowhere durable, and a harness that could be pointed at a LAN address
 * would be a way around that gate.
 */
import { createServer, type Server, type Socket } from "node:net";
import process from "node:process";
import { Aedes, type Client, type Subscription } from "aedes";
import { MeterRegistry, type Reading } from "@power-meter/domain";
import { generateFixtures, toStationPayload } from "@power-meter/infrastructure";

function flag(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isFinite(value)) throw new Error(`--${name} needs a number`);
  return value;
}

const PORT = flag("port", 1883);
const MINUTES = flag("minutes", 5);
const DROP_AT_S = flag("drop-at", 0);
const DROP_FOR_S = flag("drop-for", 30);
/** One message a second across nine stations: 60 a minute, each station every 9 s. */
const MESSAGE_INTERVAL_MS = 1_000;

const registry = MeterRegistry.fromWorkbook();
const topics = registry.topics();
const start = new Date();
const fixtures = generateFixtures({
  registry,
  from: start,
  to: new Date(start.getTime() + MINUTES * 60_000 + 60_000),
  intervalMs: topics.length * MESSAGE_INTERVAL_MS,
});

/** Readings grouped by the instant the generator put them at, then by station. */
const byMeter = new Map<string, Reading[]>();
for (const reading of fixtures.readings) {
  const meter = registry.find(reading.meterId);
  if (meter === undefined) continue;
  const bucket = byMeter.get(meter.topic);
  if (bucket === undefined) byMeter.set(meter.topic, [reading]);
  else bucket.push(reading);
}

// `createBroker`, not `new Aedes()`: the constructor leaves persistence unset
// and the first publish then throws inside aedes rather than here.
const aedes = await Aedes.createBroker();
let server: Server | undefined;
/** Open connections, so a simulated outage can cut them rather than wait them out. */
const sockets = new Set<Socket>();

function listen(): Promise<void> {
  return new Promise((resolve) => {
    const next = createServer(aedes.handle);
    next.on("connection", (socket: Socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
    });
    // Loopback only — see the note at the top of this file.
    next.listen(PORT, "127.0.0.1", () => {
      server = next;
      log(`broker listening on mqtt://127.0.0.1:${PORT}`);
      resolve();
    });
  });
}

function log(message: string): void {
  process.stdout.write(`${new Date().toISOString()} [replay] ${message}\n`);
}

aedes.on("client", (client: Client) => log(`client connected: ${client.id}`));
aedes.on("clientDisconnect", (client: Client) =>
  log(`client disconnected: ${client.id}`),
);
aedes.on("subscribe", (subscriptions: Subscription[], client: Client) =>
  log(`${client.id} subscribed to ${subscriptions.length} topic(s)`),
);

await listen();

let tick = 0;
let published = 0;
const endsAt = Date.now() + MINUTES * 60_000;

const timer = setInterval(() => {
  if (Date.now() >= endsAt) {
    clearInterval(timer);
    log(`done: published ${published} message(s)`);
    aedes.close(() => server?.close(() => process.exit(0)));
    return;
  }

  const topic = topics[tick % topics.length];
  tick += 1;
  if (topic === undefined) return;

  // The reading nearest now for each of this station's meters: the generator's
  // load curve is a function of absolute time, so what is published at 10:04 is
  // what the fleet was doing at 10:04 whichever window it was generated from.
  const now = Date.now();
  const readings = nearest(byMeter.get(topic) ?? [], now);
  if (readings.length === 0) return;

  aedes.publish(
    {
      cmd: "publish",
      topic,
      payload: Buffer.from(
        JSON.stringify(toStationPayload(readings, { registry })),
      ),
      qos: 1,
      retain: false,
      dup: false,
    },
    () => {},
  );
  published += 1;
}, MESSAGE_INTERVAL_MS);

if (DROP_AT_S > 0) {
  setTimeout(() => {
    log(`taking the broker down for ${DROP_FOR_S}s`);
    server?.close();
    // Closing the listener leaves established connections up, and a subscriber
    // that never notices the outage does not exercise a reconnect.
    for (const socket of sockets) socket.destroy();
    sockets.clear();
    setTimeout(() => {
      void listen().then(() => log("broker back up"));
    }, DROP_FOR_S * 1_000);
  }, DROP_AT_S * 1_000);
}

/** The reading closest to `at` for each meter in the list. */
function nearest(readings: readonly Reading[], at: number): Reading[] {
  const best = new Map<string, Reading>();
  for (const reading of readings) {
    const current = best.get(reading.meterId);
    if (
      current === undefined ||
      Math.abs(reading.at.getTime() - at) < Math.abs(current.at.getTime() - at)
    ) {
      best.set(reading.meterId, reading);
    }
  }
  return [...best.values()];
}
