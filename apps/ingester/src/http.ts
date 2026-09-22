/**
 * The HTTP surface: four routes, all read-only.
 *
 * `GET /latest` is the point of the whole service being always-on — the newest
 * reading for every commissioned meter, out of memory, costing nothing per
 * read. Step 8 points `apps/web/lib/realtime-source.ts` at it, which is why the
 * payload is shaped as readings rather than as table rows: the use case in
 * `packages/application` builds the table, here and on the web side alike, so
 * the two can never disagree about what "offline" means.
 *
 * Timestamps go out as ISO strings, which is what `JSON.stringify` does with a
 * Date anyway; the client parses them back. The shape is stated in
 * `LatestResponse` so that a step-8 caller has something to import rather than
 * something to guess.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Reading } from "@power-meter/domain";
import type { Ingester, IngesterStats } from "./ingester.ts";

export interface LatestReadingDto {
  readonly meterId: string;
  readonly at: string;
  readonly voltage: { readonly l1: number; readonly l2: number; readonly l3: number };
  readonly current: { readonly l1: number; readonly l2: number; readonly l3: number };
  readonly activePowerKw: number;
  readonly powerFactor: number;
  readonly energyKwh: number;
}

export interface LatestResponse {
  /** When the snapshot was taken, not when any reading was received. */
  readonly asOf: string;
  readonly readings: readonly LatestReadingDto[];
}

export interface HealthState {
  /** True once the broker connection is up and the hot state has been read back. */
  ready(): boolean;
  /** Anything worth showing beside the readiness flag. */
  detail(): Record<string, unknown>;
}

export function toDto(reading: Reading): LatestReadingDto {
  return {
    meterId: reading.meterId,
    at: reading.at.toISOString(),
    voltage: reading.voltage,
    current: reading.current,
    activePowerKw: reading.activePowerKw,
    powerFactor: reading.powerFactor,
    energyKwh: reading.energyKwh,
  };
}

export function handle(
  url: string,
  ingester: Ingester,
  health: HealthState,
): { status: number; body: unknown } {
  const path = url.split("?")[0] ?? "/";
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
        readings: ingester.snapshot().map(toDto),
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
