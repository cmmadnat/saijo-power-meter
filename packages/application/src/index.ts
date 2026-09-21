export type {
  Clock,
  LatestReadingStore,
  ReadingRepository,
  TimeRange,
} from "./ports.ts";
export { systemClock } from "./ports.ts";
export type {
  FreshnessThresholds,
  MeterStatus,
  RealtimeRow,
  RealtimeTable,
  RealtimeTableInput,
} from "./realtime.ts";
export { DEFAULT_FRESHNESS, realtimeTable, statusFor } from "./realtime.ts";
