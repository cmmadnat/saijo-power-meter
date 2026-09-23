/**
 * The ingester's configuration, and the one startup check that can stop it.
 *
 * Everything here is read from the environment exactly once, at boot, and
 * validated before a socket is opened. That is deliberate: the failure this
 * service has to avoid is not a crash but a *quiet* success — a connection to
 * the real broker whose readings are decoded with a divisor nobody has
 * confirmed, written to the warehouse in engineering units, and indistinguishable
 * afterwards from measurement. No backfill fixes that, because the raw integers
 * were never stored.
 *
 * So `assertSafeToStart` below is the gate the plan puts on step 7, and it is
 * written to be hard to talk your way past.
 */
import {
  DEFAULT_LATEST_DOCUMENT,
  isLoopbackUrl,
  unconfirmedScales,
} from "@power-meter/infrastructure";

/**
 * Where rows go.
 *
 * - `bigquery` — the go-live deployment.
 * - `none`     — observe mode, step 9: the customer's broker, and no writer at
 *                all. The hot state and a rolling hour live in memory and are
 *                served over HTTP; nothing is stored anywhere, not even the
 *                restart state.
 * - `memory`, `file` — the local replay, which has no project behind it; see
 *                `FileReadingWriter` in `@power-meter/infrastructure`.
 */
export type WarehouseMode = "bigquery" | "none" | "memory" | "file";

/**
 * The client id the writing ingester holds. The broker evicts an older session
 * that reuses it, which is what keeps the writing ingester single.
 */
export const GO_LIVE_CLIENT_ID = "power-meter-ingester";

/**
 * The client id an observing ingester holds, and it must never be the one
 * above. Sharing it would let the observer evict the writer — or be evicted by
 * it and exit — and a log line saying `power-meter-ingester` could then be
 * either of two very different processes.
 */
export const OBSERVE_CLIENT_ID = "power-meter-observer";

export interface Config {
  /** `mqtt://`, `mqtts://`, `ws://` or `wss://`. */
  readonly brokerUrl: string;
  readonly username: string | undefined;
  readonly password: string | undefined;
  /**
   * Fixed, and that is the point: across a deploy the broker sees the same
   * client id twice and evicts the older session, so two instances cannot both
   * hold the subscription. See `broker.ts`.
   */
  readonly clientId: string;
  /**
   * 5 unless something in the way cannot speak it.
   *
   * The takeover guard in `broker.ts` reads MQTT 5's disconnect reason code,
   * which is the only way a client is *told* it was evicted rather than merely
   * dropped. HiveMQ Cloud speaks 5. The local replay broker (aedes) speaks
   * 3.1.1 only, so the harness sets this to 4 and loses that one signal — it
   * still shows the eviction, from the broker's side.
   */
  readonly protocolVersion: 4 | 5;
  /** How long a batch is held before it is written. */
  readonly flushIntervalMs: number;
  /** How often the in-memory hot state is mirrored to the Firestore document. */
  readonly latestFlushIntervalMs: number;
  readonly warehouse: WarehouseMode;
  /** Where `WAREHOUSE=file` writes. Ignored by the other modes. */
  readonly warehouseDir: string;
  readonly projectId: string | undefined;
  readonly dataset: string;
  readonly location: string;
  /**
   * The Firestore database holding the restart state, since step 8c.
   *
   * `(default)`, because Firestore's free quota covers exactly one database per
   * project and that is the one — a named database is billed from its first
   * write. Pulumi declares it; see infra/index.ts.
   */
  readonly firestoreDatabase: string;
  /** `<collection>/<document>`. One document holds all 55 meters. */
  readonly latestDocument: string;
  readonly port: number;
}

const DEFAULTS = {
  /**
   * 45 s, the middle of the plan's 30–60 s. It is also the loss window on a
   * crash: readings received since the last flush are in memory and nowhere
   * else. Both directions are cheap to change, which is why this is a number
   * and not an argument — and since step 8c, shorter no longer spends a
   * per-table daily quota: the Storage Write API has none.
   */
  flushIntervalMs: 45_000,
  latestFlushIntervalMs: 30_000,
  dataset: "power_meter",
  location: "asia-southeast1",
  firestoreDatabase: "(default)",
  port: 8080,
} as const;

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const brokerUrl = env["MQTT_URL"];
  if (brokerUrl === undefined || brokerUrl === "") {
    throw new Error("MQTT_URL is required (mqtt://, mqtts://, ws:// or wss://).");
  }
  const warehouse = (env["WAREHOUSE"] ?? "bigquery") as WarehouseMode;
  if (
    warehouse !== "bigquery" &&
    warehouse !== "none" &&
    warehouse !== "memory" &&
    warehouse !== "file"
  ) {
    throw new Error(
      `WAREHOUSE must be "bigquery", "none", "memory" or "file", not ${warehouse}`,
    );
  }

  return {
    brokerUrl,
    username: env["MQTT_USERNAME"] || undefined,
    password: env["MQTT_PASSWORD"] || undefined,
    clientId:
      env["MQTT_CLIENT_ID"] ||
      (warehouse === "none" ? OBSERVE_CLIENT_ID : GO_LIVE_CLIENT_ID),
    protocolVersion: protocolVersion(env["MQTT_PROTOCOL_VERSION"]),
    flushIntervalMs: positive(env["FLUSH_INTERVAL_MS"], DEFAULTS.flushIntervalMs),
    latestFlushIntervalMs: positive(
      env["LATEST_FLUSH_INTERVAL_MS"],
      DEFAULTS.latestFlushIntervalMs,
    ),
    warehouse,
    warehouseDir: env["WAREHOUSE_DIR"] || ".ingester",
    projectId: env["GOOGLE_PROJECT"] || undefined,
    dataset: env["WAREHOUSE_DATASET"] || DEFAULTS.dataset,
    location: env["WAREHOUSE_LOCATION"] || DEFAULTS.location,
    firestoreDatabase: env["FIRESTORE_DATABASE"] || DEFAULTS.firestoreDatabase,
    latestDocument: env["LATEST_DOCUMENT"] || DEFAULT_LATEST_DOCUMENT,
    port: positive(env["PORT"], DEFAULTS.port),
  };
}

function protocolVersion(value: string | undefined): 4 | 5 {
  if (value === undefined || value === "") return 5;
  if (value === "4") return 4;
  if (value === "5") return 5;
  throw new Error(`MQTT_PROTOCOL_VERSION must be 4 or 5, not ${value}`);
}

function positive(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`expected a positive number, got ${JSON.stringify(value)}`);
  }
  return parsed;
}

/**
 * Whether this configuration points at a broker on this machine.
 *
 * It is the whole exemption: a replay against a broker on loopback is a test
 * harness, a connection to anything else is the factory. `isLoopbackUrl` is
 * shared with the web app's gate, which grants the same exemption for an
 * ingester on loopback — one definition of "this machine" for both.
 */
export function isLoopbackBroker(brokerUrl: string): boolean {
  return isLoopbackUrl(brokerUrl);
}

/**
 * The gate: refuse to run against a real broker while any scale factor is a
 * guess.
 *
 * `unconfirmedScales()` was written at step 2 for exactly this call site. Two
 * divisors — active power and energy — are marked `assumed` because the
 * customer's workbook documents neither and its sample payload does not
 * reconcile with itself. Reading a real meter through them produces numbers
 * that look like measurements and are not.
 *
 * There are two exemptions, and they rest on one argument: what is being
 * protected is the warehouse, not the broker.
 *
 * - **A broker on loopback writing somewhere that is not the warehouse** —
 *   `memory` or `file`. That is the local replay the plan asks for as
 *   verification. Both halves are required: a loopback broker with
 *   `WAREHOUSE=bigquery` is refused.
 * - **`WAREHOUSE=none`, any broker.** Observe mode, step 9. There is no writer
 *   behind it at all — not BigQuery, not the Firestore restart state — so a
 *   guessed divisor produces a guessed number on a screen that says so, and
 *   nothing that outlives the process. It is the one way the customer's broker
 *   is read by this service before the divisors are settled.
 *
 * Do not add a third. Whatever else is checked below is about client ids, and
 * holds whether or not the scales are confirmed.
 */
export function assertSafeToStart(config: Config): void {
  assertClientId(config);

  const unconfirmed = unconfirmedScales();
  if (unconfirmed.length === 0) return;
  if (config.warehouse === "none") return;

  const fields = unconfirmed.join(", ");
  if (isLoopbackBroker(config.brokerUrl) && config.warehouse !== "bigquery") {
    return;
  }

  throw new Error(
    `Refusing to start: the scale factors for ${fields} are still assumed, not confirmed.\n` +
      "Decoding a real meter through a guessed divisor writes numbers that read as\n" +
      "measurements and are not, and no backfill recovers them — the raw integers are\n" +
      "never stored. What settles it is one captured payload from a running meter plus\n" +
      "that meter's own display reading at the same moment; see\n" +
      "docs/requirements/power-meter-mqtt.md, then edit\n" +
      "packages/infrastructure/src/mqtt/scaling.ts.\n" +
      "Until then this service runs only in observe mode (WAREHOUSE=none), or against\n" +
      "a broker on loopback with WAREHOUSE=memory or WAREHOUSE=file, which is the local\n" +
      "replay harness.",
  );
}

/**
 * An observer and the writer never share a client id, in either direction.
 *
 * An observer on the writer's id would evict the writing ingester — which then
 * exits, by design — and the factory would stop being recorded with nothing
 * but an observer left running. A writer on the observer's id is the mirror
 * case: a deploy that switched observe to record without changing the id, and
 * a second writer somewhere else on `power-meter-ingester`, would both write.
 */
function assertClientId(config: Config): void {
  if (config.warehouse === "none" && config.clientId === GO_LIVE_CLIENT_ID) {
    throw new Error(
      `Refusing to start: WAREHOUSE=none with MQTT_CLIENT_ID=${GO_LIVE_CLIENT_ID}.\n` +
        "That is the writing ingester's id, and the broker would evict whichever of the\n" +
        `two connected first. Observe mode runs as ${OBSERVE_CLIENT_ID}, its default.`,
    );
  }
  if (config.warehouse === "bigquery" && config.clientId === OBSERVE_CLIENT_ID) {
    throw new Error(
      `Refusing to start: WAREHOUSE=bigquery with MQTT_CLIENT_ID=${OBSERVE_CLIENT_ID}.\n` +
        "That id is reserved for observe mode, which writes nothing. A writing ingester\n" +
        `runs as ${GO_LIVE_CLIENT_ID}, so the broker keeps it single.`,
    );
  }
}
