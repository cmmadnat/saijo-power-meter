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
  LatestReadingStore,
  ReadingRepository,
  RollupRepository,
  TimeRange,
} from "@power-meter/application";
import type { MeterId, MeterRegistry } from "@power-meter/domain";

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

export interface DataSource {
  /** The newest reading per meter, as of now. */
  latest(registry: MeterRegistry, now: Date): LatestReadingStore;
  /** A chart window ending about now, and where to read it. */
  series(request: SeriesRequest): WindowedPort<ReadingRepository | RollupRepository>;
  /** Raw readings for History. Never the rollup: running hours are read off the gaps. */
  history(registry: MeterRegistry, range: TimeRange): HistoryPort;
  /** The strip's two windows: since the day started, and the last hour. */
  trend(request: TrendRequest): WindowedPort<ReadingRepository | RollupRepository>;
}
