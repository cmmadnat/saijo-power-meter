/**
 * The broker connection: a port the rest of the service is written against, and
 * the MQTT.js adapter behind it.
 *
 * Splitting it this way is what makes the awkward cases testable. A reconnect,
 * a broker that disappears for an hour, and — the one that matters most — a
 * second instance taking the subscription away are all events, and the
 * ingester's response to each is asserted against a fake rather than against a
 * real socket.
 *
 * ## Why the client id is fixed, and what happens when it is used twice
 *
 * Two instances subscribed to the same nine topics would store every reading
 * twice and make every rollup count wrong. Cloud Run's `min=1, max=1` is the
 * first half of preventing that; the second half is here. The client id is a
 * constant, so an MQTT broker seeing a second connection with the same id
 * **takes the session over**: it disconnects the older one. That is what makes
 * a deploy clean, and it is also what would make two ingesters fight — the
 * evicted one reconnects, evicts its rival, and the pair flap forever, both
 * writing.
 *
 * So an evicted instance does not reconnect. MQTT 5 says why it was
 * disconnected (`0x8E`, *session taken over*), and this adapter reports that as
 * a takeover rather than as a dropped connection. `main.ts` responds by
 * shutting down, which is right in both cases it can arise: during a deploy the
 * old revision is meant to go away, and in a misconfiguration one of the two
 * has to lose, permanently. Duplicate ingestion is then impossible rather than
 * unlikely — the invariant the plan asks for.
 *
 * ## Why the session is not clean
 *
 * `clean: false` with QoS 1 asks the broker to hold messages while the
 * subscriber is away, which is what turns a thirty-second reconnect into no
 * loss at all. It is not unlimited: HiveMQ Cloud's free plan queues 1000
 * messages per client, which at 60 messages a minute is about sixteen minutes.
 * Past that the broker drops the oldest, silently. That bound is the documented
 * loss window, and it is why "a broker that goes away for an hour" loses data
 * no matter what this code does.
 */
import mqtt, { type IClientOptions, type MqttClient } from "mqtt";

export interface BrokerMessage {
  readonly topic: string;
  readonly payload: Uint8Array;
  /** Reception time. The protocol carries no timestamp, so the receiver stamps it. */
  readonly at: Date;
}

export interface BrokerHandlers {
  onMessage(message: BrokerMessage): void;
  onConnect(details: { readonly sessionPresent: boolean }): void;
  onDisconnect(reason: string): void;
  /** The session was taken over by another client holding the same id. Terminal. */
  onTakeover(reason: string): void;
  onError(error: Error): void;
}

export interface Broker {
  connect(handlers: BrokerHandlers): void;
  close(): Promise<void>;
}

export interface MqttBrokerOptions {
  readonly url: string;
  readonly clientId: string;
  readonly username?: string | undefined;
  readonly password?: string | undefined;
  readonly topics: readonly string[];
  /** 4 or 5. The takeover guard needs 5; see `config.ts`. */
  readonly protocolVersion?: 4 | 5;
  /** Milliseconds between reconnection attempts. */
  readonly reconnectPeriodMs?: number;
}

/** MQTT 5 reason code 142: another connection used this client id. */
const SESSION_TAKEN_OVER = 0x8e;

export class MqttBroker implements Broker {
  readonly #options: MqttBrokerOptions;
  #client: MqttClient | undefined;
  #takenOver = false;

  constructor(options: MqttBrokerOptions) {
    this.#options = options;
  }

  connect(handlers: BrokerHandlers): void {
    const options: IClientOptions = {
      clientId: this.#options.clientId,
      // Persistent session: see the note at the top of this file.
      clean: false,
      protocolVersion: this.#options.protocolVersion ?? 5,
      // An MQTT 5 property, and rejected outright by a 3.1.1 broker: there the
      // session's lifetime is the broker's business and there is nothing to ask
      // for.
      ...(this.#options.protocolVersion === 4
        ? {}
        : {
            properties: {
              // Keep the session — and its queue — for an hour across a
              // disconnect. Past that the queue is gone anyway.
              sessionExpiryInterval: 3600,
            },
          }),
      reconnectPeriod: this.#options.reconnectPeriodMs ?? 5_000,
      connectTimeout: 30_000,
      // Re-subscribe after a reconnect that did not restore the session. A
      // broker that dropped the session returns sessionPresent false, and a
      // subscriber that trusted it would sit connected and silent.
      resubscribe: true,
      ...(this.#options.username === undefined
        ? {}
        : { username: this.#options.username }),
      ...(this.#options.password === undefined
        ? {}
        : { password: this.#options.password }),
    };

    const client = mqtt.connect(this.#options.url, options);
    this.#client = client;

    client.on("connect", (packet) => {
      handlers.onConnect({ sessionPresent: Boolean(packet.sessionPresent) });
      client.subscribe(
        [...this.#options.topics],
        { qos: 1 },
        (error) => {
          if (error) handlers.onError(error);
        },
      );
    });

    client.on("message", (topic, payload) => {
      handlers.onMessage({ topic, payload, at: new Date() });
    });

    client.on("disconnect", (packet) => {
      const code = packet.reasonCode;
      if (code === SESSION_TAKEN_OVER) {
        this.#takenOver = true;
        // Stop trying. Reconnecting here is what would make two instances
        // evict each other in a loop, both of them ingesting.
        client.end(true);
        handlers.onTakeover(
          "the broker reported session-taken-over: another client connected with " +
            `the id ${this.#options.clientId}`,
        );
        return;
      }
      handlers.onDisconnect(`broker sent DISCONNECT (reason code ${String(code)})`);
    });

    client.on("close", () => {
      if (this.#takenOver) return;
      handlers.onDisconnect("connection closed");
    });

    client.on("error", (error) => handlers.onError(error));
  }

  async close(): Promise<void> {
    const client = this.#client;
    if (client === undefined) return;
    this.#client = undefined;
    await new Promise<void>((resolve) => client.end(false, {}, () => resolve()));
  }
}
