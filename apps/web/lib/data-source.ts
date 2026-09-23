/**
 * What a data mode has to supply: the ports the screens' use cases read, each
 * asked for with the window the screen wants.
 *
 * The three source files — realtime, series, history — ask the composition
 * module (`data-mode.ts`) for one of these and pass what it hands back to a use
 * case in `packages/application`. They never learn which mode produced it. That
 * is the whole of step 8b's "nothing above them learns which mode it is in":
 * the mode decides *which object* comes back, and the object is a port.
 *
 * Each method is window-shaped rather than returning a bare repository because
 * the two modes disagree about windows in ways that are theirs to decide. Demo
 * generates readings per request and samples a long window coarsely, which
 * obliges it to widen History's gap cap; live reads stored minutes, which
 * obliges it to align a chart's window to the minute. Neither concern belongs
 * in a source file, so both travel back with the port.
 */
import type {
  FreshnessThresholds,
  LatestReadingStore,
  MeterLabelStore,
  ReadingRepository,
  RollupRepository,
  TimeRange,
} from "@power-meter/application";
import type { MeterId, MeterRegistry } from "@power-meter/domain";
import type { FeedHealth } from "@power-meter/infrastructure";

export interface SeriesRequest {
  readonly registry: MeterRegistry;
  readonly meterIds: readonly MeterId[];
  readonly spanMs: number;
  readonly now: Date;
}

export interface TrendRequest {
  readonly registry: MeterRegistry;
  /** 00:00 Asia/Bangkok today. */
  readonly dayStart: Date;
  readonly sparkMs: number;
  readonly now: Date;
}

export interface WindowedPort<Port> {
  readonly range: TimeRange;
  readonly repository: Port;
}

export interface HistoryPort {
  readonly repository: ReadingRepository;
  /** Set only where the readings are sampled coarser than the real rate. */
  readonly maxRunGapMs?: number;
}

/** What a source knows about how often its readings arrive. */
export interface FeedStatus {
  /** The interval the feed was measured at; null before it has been seen. */
  readonly publishIntervalMs: number | null;
  /** When the source last heard from its producer; null if never. */
  readonly observedAt: Date | null;
  readonly thresholds: FreshnessThresholds;
  /** The producer's own account of the feed — connection, messages, errors. Incoming only. */
  readonly health?: FeedHealth;
}

export interface DataSource {
  /**
   * False where nothing is stored — the Incoming view. History and every
   * energy figure then say "not recorded yet" rather than draw from a window
   * the source does not have, and never fall back to fixtures to fill it.
   */
  readonly records: boolean;
  /**
   * Where the viewers' names for meters are kept, when this source identifies
   * meters by the feed rather than by the workbook. Present, the screens group
   * by station and name a meter only by its label, or its id until it has one
   * (`lib/registry-source.ts`). Incoming only.
   */
  readonly labels?: MeterLabelStore;
  /** The widest chart window this source can fill. Omitted means any. */
  readonly maxSeriesMs?: number;
  /**
   * The feed's own rate and the thresholds derived from it. Omitted means the
   * specification's ~9 s and `DEFAULT_FRESHNESS`.
   */
  feed?(): Promise<FeedStatus>;
  /** The newest reading per meter, as of now. */
  latest(registry: MeterRegistry, now: Date): LatestReadingStore;
  /** A chart window ending about now, and where to read it. */
  series(request: SeriesRequest): WindowedPort<ReadingRepository | RollupRepository>;
  /** Raw readings for History. Never the rollup: running hours are read off the gaps. */
  history(registry: MeterRegistry, range: TimeRange): HistoryPort;
  /** The strip's two windows: since the day started, and the last hour. */
  trend(request: TrendRequest): WindowedPort<ReadingRepository | RollupRepository>;
}
