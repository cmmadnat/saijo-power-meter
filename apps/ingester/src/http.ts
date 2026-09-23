/**
 * The HTTP surface: five routes, all read-only.
 *
 * `GET /latest` is the point of the whole service being always-on — the newest
 * reading for every commissioned meter, out of memory, costing nothing per
 * read. The web app's live mode reads it (`IngesterLatestReadingStore`, composed
 * in `apps/web/lib/live-adapters.ts`), which is why the payload is shaped as
 * readings rather than as table rows: the use case in
 * `packages/application` builds the table, here and on the web side alike, so
 * the two can never disagree about what "offline" means.
 *
 * The wire shape — `LatestResponse`, and `toLatestDto` that produces it — lives
 * in `@power-meter/infrastructure`, beside the web app's client that parses it
 * back, so the two deployables share one definition of it the way they share
 * the decoder. It is re-exported here for this app's own tests.
 *
 * `GET /recent` is the rolling in-memory hour, added at step 9 so a kW chart
 * has something to draw from an observer that stores nothing.
 * `?meters=a,b` narrows it and `?minutes=n` shortens it; unnarrowed it is every
 * meter's hour, which at the spec's rate is ~22 000 readings and worth not
 * asking for every ten seconds.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { MeterId } from "@power-meter/domain";
import {
  toLatestDto,
  type LatestResponse,
  type RecentResponse,
} from "@power-meter/infrastructure";
import type { Ingester, IngesterStats } from "./ingester.ts";

export type {
  LatestReadingDto,
  LatestResponse,
  RecentResponse,
} from "@power-meter/infrastructure";

export interface HealthState {
  /** True once the broker connection is up and the hot state has been read back. */
  ready(): boolean;
  /** Anything worth showing beside the readiness flag. */
  detail(): Record<string, unknown>;
}

export function handle(
  url: string,
  ingester: Ingester,
  health: HealthState,
): { status: number; body: unknown } {
  const [path = "/", search = ""] = url.split("?");
  const query = new URLSearchParams(search);
  switch (path) {
    case "/healthz":
      // Liveness, not readiness. A broker outage must not make Cloud Run
      // restart the container: the process is fine, and restarting it would
      // throw away the buffer and the hot state on top of the outage.
      return { status: 200, body: { status: "alive" } };

    case "/readyz":
      return health.ready()
        ? { status: 200, body: { status: "ready", ...health.detail() } }
        : { status: 503, body: { status: "not-ready", ...health.detail() } };

    case "/latest": {
      const body: LatestResponse = {
        asOf: new Date().toISOString(),
        recording: ingester.recording,
        publishIntervalMs: ingester.publishIntervalMs(),
        readings: ingester.snapshot().map(toLatestDto),
      };
      return { status: 200, body };
    }

    case "/recent": {
      const meters = query.get("meters");
      const minutes = query.get("minutes");
      let withinMs: number | undefined;
      if (minutes !== null) {
        const parsed = Number(minutes);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          return { status: 400, body: { error: "minutes must be a positive number" } };
        }
        withinMs = parsed * 60_000;
      }
      const readings = ingester.recent({
        ...(meters === null || meters === ""
          ? {}
          : { meters: meters.split(",").filter((id) => id !== "") as MeterId[] }),
        ...(withinMs === undefined ? {} : { withinMs }),
      });
      const body: RecentResponse = {
        asOf: new Date().toISOString(),
        windowMs: Math.min(withinMs ?? ingester.recentWindowMs, ingester.recentWindowMs),
        readings: readings.map(toLatestDto),
      };
      return { status: 200, body };
    }

    case "/stats": {
      const body: IngesterStats & { memory: NodeJS.MemoryUsage } = {
        ...ingester.stats(),
        memory: process.memoryUsage(),
      };
      return { status: 200, body };
    }

    default:
      return { status: 404, body: { error: "not found" } };
  }
}

export function createHttpServer(ingester: Ingester, health: HealthState): Server {
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    const { status, body } = handle(request.url ?? "/", ingester, health);
    const json = JSON.stringify(body);
    response.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      // The hot state is a few seconds old by construction and must never be
      // served from a cache: a stale copy is exactly the failure the freshness
      // column on the real-time screen exists to make visible.
      "cache-control": "no-store",
    });
    response.end(json);
  });
}
