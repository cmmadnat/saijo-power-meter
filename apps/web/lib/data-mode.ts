/**
 * The data mode: the one switch, read in the one place.
 *
 * `DATA_MODE` is `live` or `demo`, and unset means `demo` — so a deployment
 * that forgot to say degrades to numbers that are obviously fake and badged as
 * such, rather than to a blank screen or to a half-configured live one. Any
 * other value is refused: a typo in the switch is a misconfiguration, and the
 * badge is not a substitute for saying so.
 *
 * This module is the only thing in the web app that reads the variable. The
 * three source files ask it for a `DataSource` and hand the ports it returns to
 * the use cases; the layout and the page headers ask it for a label to print.
 * There is no per-source override — a half-live app whose table is real and
 * whose History is synthetic is a bug generator, and one switch read once
 * makes that state unrepresentable.
 *
 * **Live mode refuses to start while any scale divisor is a guess.** This is
 * the second gate built on `unconfirmedScales()` — the ingester's is the first,
 * and the scale table's own tests pin what it returns — and it refuses for the
 * same reason: a number decoded through a guessed divisor reads as a
 * measurement and is not. The exemption is the ingester's, applied to the
 * other end of the same wire — an ingester on loopback *and* a file warehouse,
 * which is the replay harness and cannot be showing anything measured. Both
 * halves are required.
 *
 * Each adapter set is loaded by dynamic import, so the mode that is not in use
 * is never evaluated — and the live set's import graph, which
 * `scripts/check-boundaries.mjs` walks, never reaches the fixture generator.
 */
import { isLoopbackUrl, unconfirmedScales } from "@power-meter/infrastructure";
import type { DataSource } from "./data-source.ts";

export type DataMode = "demo" | "live";

export interface LiveConfig {
  readonly mode: "live";
  /** Where the ingester's `/latest` is served. */
  readonly ingesterUrl: string;
  /** `bigquery` in any deployment; `file` only for the replay harness. */
  readonly warehouse: "bigquery" | "file";
  readonly warehouseDir: string;
  readonly projectId: string | undefined;
  readonly dataset: string;
  readonly location: string;
  /** True for the replay harness: live code paths, fixture numbers. */
  readonly replay: boolean;
}

export type DataModeConfig = { readonly mode: "demo" } | LiveConfig;

export function readDataMode(env: Record<string, string | undefined> = process.env): DataModeConfig {
  const raw = env["DATA_MODE"];
  if (raw === undefined || raw === "" || raw === "demo") return { mode: "demo" };
  if (raw !== "live") {
    throw new Error(`DATA_MODE must be "live" or "demo" (or unset, which is demo), not ${JSON.stringify(raw)}.`);
  }

  const ingesterUrl = env["INGESTER_URL"];
  if (ingesterUrl === undefined || ingesterUrl === "") {
    throw new Error("DATA_MODE=live needs INGESTER_URL: the real-time table is the ingester's hot state.");
  }
  const warehouse = env["WAREHOUSE"] || "bigquery";
  if (warehouse !== "bigquery" && warehouse !== "file") {
    throw new Error(`WAREHOUSE must be "bigquery" or "file", not ${JSON.stringify(warehouse)}.`);
  }

  return {
    mode: "live",
    ingesterUrl,
    warehouse,
    warehouseDir: env["WAREHOUSE_DIR"] || ".ingester",
    projectId: env["GOOGLE_PROJECT"] || undefined,
    dataset: env["WAREHOUSE_DATASET"] || "power_meter",
    location: env["WAREHOUSE_LOCATION"] || "asia-southeast1",
    replay: isLoopbackUrl(ingesterUrl) && warehouse === "file",
  };
}

/**
 * The gate. Throws, naming every unconfirmed field, when live mode would show
 * numbers decoded through a guessed divisor.
 */
export function assertSafeToServe(
  config: DataModeConfig,
  unconfirmed: readonly string[] = unconfirmedScales(),
): void {
  if (config.mode === "demo" || unconfirmed.length === 0 || config.replay) return;
  throw new Error(
    `Refusing to start in DATA_MODE=live: the scale factors for ${unconfirmed.join(", ")} ` +
      "are still assumed, not confirmed.\n" +
      "Every kW and kWh on these screens is decoded through them, and a guessed divisor\n" +
      "produces numbers that read as measurements and are not. The ingester refuses to\n" +
      "write them for the same reason; see packages/infrastructure/src/mqtt/scaling.ts and\n" +
      "docs/requirements/power-meter-mqtt.md. Until they are settled, run DATA_MODE=demo —\n" +
      "or, to exercise the live path locally, an ingester on loopback with WAREHOUSE=file.",
  );
}

let resolved: DataModeConfig | undefined;

/** The process's mode, read and checked once. */
export function dataMode(): DataModeConfig {
  if (resolved === undefined) {
    const config = readDataMode();
    assertSafeToServe(config);
    resolved = config;
  }
  return resolved;
}

let source: Promise<DataSource> | undefined;

/** The adapter set for this process's mode. The only thing the source files call. */
export function dataSource(): Promise<DataSource> {
  if (source === undefined) {
    const config = dataMode();
    source =
      config.mode === "live"
        ? import("./live-adapters.ts").then((m) => m.createLiveSource(config))
        : import("./demo-adapters.ts").then((m) => m.createDemoSource());
    // A failed construction is not cached: the next request tries again.
    source.catch(() => {
      source = undefined;
    });
  }
  return source;
}

/**
 * What the shell and the page headers print about where the numbers come from.
 *
 * `badge` is null in live mode and nowhere else: a screenshot of demo mode —
 * or of the replay harness, which runs live code over fixture numbers — has to
 * be unmistakable as not-measurement months later and out of context.
 */
export interface Provenance {
  readonly badge: string | null;
  readonly line: string;
}

export function provenanceOf(config: DataModeConfig): Provenance {
  if (config.mode === "demo") {
    return {
      badge: "Demo data",
      line: "Demo data · synthetic readings, no meter is connected",
    };
  }
  if (config.replay) {
    return {
      badge: "Local replay",
      line: "Live code path · replayed fixtures from a loopback broker, not measurement",
    };
  }
  return { badge: null, line: "Live · meters via the ingester, history from the warehouse" };
}

export function provenance(): Provenance {
  return provenanceOf(dataMode());
}
