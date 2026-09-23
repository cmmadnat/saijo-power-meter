/**
 * The service: a broker, an ingester and an HTTP server, and the rules about
 * how they react to each other.
 *
 * It is separate from `main.ts` so that the three events with consequences —
 * connect, disconnect and takeover — can be driven by a fake broker in a test.
 * The takeover one is the reason: "duplicate ingestion is impossible rather
 * than unlikely" is a claim about what this code does when the broker says the
 * session moved, and the only way to assert it without two Cloud Run instances
 * and a real broker is to send the event.
 */
import type { LatestReadingStore, ReadingWriter } from "@power-meter/application";
import type { Broker } from "./broker.ts";
import type { Config } from "./config.ts";
import { createHttpServer } from "./http.ts";
import { Ingester } from "./ingester.ts";

export interface ServiceOptions {
  readonly config: Config;
  readonly broker: Broker;
  /** Null is observe mode; see `Ingester`. */
  readonly writer: ReadingWriter | null;
  readonly latestStore?: LatestReadingStore | undefined;
  readonly log?: (message: string) => void;
  /** Bind a port. Off in tests, where the routes are exercised directly. */
  readonly serve?: boolean;
}

export interface Service {
  readonly ingester: Ingester;
  ready(): boolean;
  /** Resolves once the final flush has been written and the sockets are closed. */
  stop(reason: string): Promise<void>;
  /** Resolves when the service shuts itself down — a takeover, today. */
  readonly stopped: Promise<string>;
}

export async function startService(options: ServiceOptions): Promise<Service> {
  const { config, broker, writer } = options;
  const log = options.log ?? (() => {});

  const ingester = new Ingester({
    writer,
    latestStore: options.latestStore,
    flushIntervalMs: config.flushIntervalMs,
    latestFlushIntervalMs: config.latestFlushIntervalMs,
    log,
  });

  let connected = false;
  let rehydrated = false;
  let stopping: Promise<void> | undefined;
  let announceStopped: (reason: string) => void = () => {};
  const stopped = new Promise<string>((resolve) => {
    announceStopped = resolve;
  });

  const server =
    options.serve === false
      ? undefined
      : createHttpServer(ingester, {
          ready: () => connected && rehydrated,
          detail: () => ({
            connected,
            rehydrated,
            clientId: config.clientId,
            recording: ingester.recording,
          }),
        });
  server?.listen(config.port, () => log(`listening on :${config.port}`));

  // Before the subscription, so the first message is merged into a populated
  // hot state rather than racing the read.
  await ingester.rehydrate();
  rehydrated = true;

  const stop = (reason: string): Promise<void> => {
    stopping ??= (async () => {
      log(`shutting down: ${reason}`);
      await broker.close();
      // The final flush is what makes a deploy lossless: the readings received
      // since the last tick are written before the process goes.
      await ingester.stop();
      server?.close();
      announceStopped(reason);
    })();
    return stopping;
  };

  broker.connect({
    onConnect: ({ sessionPresent }) => {
      connected = true;
      log(
        `connected to the broker as ${config.clientId} ` +
          `(session ${sessionPresent ? "resumed" : "new"}), ` +
          `subscribing to ${ingester.topics().length} topic(s)`,
      );
    },
    onMessage: (message) => ingester.accept(message),
    onDisconnect: (reason) => {
      if (!connected) return;
      connected = false;
      log(`disconnected: ${reason}. Reconnecting; the buffer is kept.`);
    },
    onTakeover: (reason) => {
      // Another instance holds the subscription now. Two subscribers would
      // write every reading twice and make every rollup count wrong, so this
      // one stops for good rather than racing it back. On a deploy that is the
      // old revision standing aside.
      connected = false;
      void stop(`${reason}. Exiting so only one instance ingests.`);
    },
    onError: (error) => log(`broker error: ${error.message}`),
  });

  ingester.start();

  return {
    ingester,
    ready: () => connected && rehydrated,
    stop,
    stopped,
  };
}
