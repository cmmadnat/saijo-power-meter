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
 *
 * ## Views, since step 10
 *
 * `DATA_MODE` keeps its meaning: it is the deployment's mode and the default
 * view. A deployment that also sets `INCOMING` offers a second view, the
 * observer's snapshot (`incoming-adapters.ts`), and the viewer picks between
 * the two with the header toggle, remembered in a cookie. The choice is always
 * for **the whole app at once** — every source file is handed the one source
 * for the one view — so "no half-live app" still holds; it has become the
 * viewer's choice instead of the deployment's. Incoming is not a weaker live
 * mode and does not go through the gate above: nothing it shows is stored, and
 * it is badged on every route as unconfirmed.
 */
import {
  DEFAULT_OBSERVER_DOCUMENT,
  isLoopbackUrl,
  unconfirmedScales,
} from "@power-meter/infrastructure";
import type { DataSource } from "./data-source.ts";
import type { IncomingConfig } from "./incoming-adapters.ts";

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

/** What a viewer can be looking at: the deployment's mode, or the observer's feed. */
export type ViewId = DataMode | "incoming";

/**
 * The Incoming view's configuration, or null when this deployment offers none.
 *
 * `INCOMING=firestore` reads the observer's document from the project's
 * `(default)` database; `INCOMING=file` reads it from `WAREHOUSE_DIR`, which is
 * where an observer on the local replay writes it.
 */
export function readIncoming(
  env: Record<string, string | undefined> = process.env,
): IncomingConfig | null {
  const raw = env["INCOMING"];
  if (raw === undefined || raw === "") return null;
  if (raw !== "firestore" && raw !== "file") {
    throw new Error(`INCOMING must be "firestore" or "file" (or unset), not ${JSON.stringify(raw)}.`);
  }
  return {
    store: raw,
    projectId: env["GOOGLE_PROJECT"] || undefined,
    databaseId: env["FIRESTORE_DATABASE"] || "(default)",
    document: env["OBSERVER_DOCUMENT"] || DEFAULT_OBSERVER_DOCUMENT,
    dir: env["WAREHOUSE_DIR"] || ".ingester",
  };
}

let incoming: IncomingConfig | null | undefined;

function incomingConfig(): IncomingConfig | null {
  if (incoming === undefined) incoming = readIncoming();
  return incoming;
}

/** The views this deployment offers, its own mode first. */
export function viewsOf(config: DataModeConfig, offersIncoming: boolean): readonly ViewId[] {
  return offersIncoming ? [config.mode, "incoming"] : [config.mode];
}

export function availableViews(): readonly ViewId[] {
  return viewsOf(dataMode(), incomingConfig() !== null);
}

/**
 * The view a request is for: the cookie's, if this deployment offers it, else
 * the deployment's own mode. An unknown or stale cookie — Incoming remembered
 * from a deployment that has since stopped offering it — is ignored, not an
 * error.
 */
export function resolveView(requested: string | undefined, offered: readonly ViewId[]): ViewId {
  const match = offered.find((view) => view === requested);
  return match ?? offered[0] ?? "demo";
}

const sources = new Map<ViewId, Promise<DataSource>>();

/**
 * The adapter set for a view — the deployment's own mode when none is named.
 * Every source file is handed exactly one of these per request.
 */
export function dataSource(view?: ViewId): Promise<DataSource> {
  const config = dataMode();
  const wanted = view ?? config.mode;
  let source = sources.get(wanted);
  if (source === undefined) {
    if (wanted === "incoming") {
      const settings = incomingConfig();
      if (settings === null) {
        return Promise.reject(new Error("This deployment offers no Incoming view: INCOMING is unset."));
      }
      source = import("./incoming-adapters.ts").then((m) => m.createIncomingSource(settings));
    } else if (wanted === "live") {
      if (config.mode !== "live") {
        return Promise.reject(new Error("The live view needs DATA_MODE=live."));
      }
      source = import("./live-adapters.ts").then((m) => m.createLiveSource(config));
    } else {
      source = import("./demo-adapters.ts").then((m) => m.createDemoSource());
    }
    sources.set(wanted, source);
    // A failed construction is not cached: the next request tries again.
    const settled = source;
    settled.catch(() => {
      if (sources.get(wanted) === settled) sources.delete(wanted);
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

export function provenanceOf(config: DataModeConfig, view: ViewId = config.mode): Provenance {
  if (view === "incoming") {
    return {
      badge: "Incoming · unconfirmed",
      line: "Incoming · the customer's test publisher, via the observer · scaling unconfirmed · nothing stored",
    };
  }
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

export function provenance(view?: ViewId): Provenance {
  return provenanceOf(dataMode(), view);
}

/** What the header toggle calls each view. */
export const VIEW_LABELS: Record<ViewId, string> = {
  demo: "Demo",
  live: "Live",
  incoming: "Incoming",
};
