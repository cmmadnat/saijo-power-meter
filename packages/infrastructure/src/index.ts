/**
 * The infrastructure layer's public entry point.
 *
 * Adapters, not rules: the MQTT payload decoder with the scale factors it
 * applies, the warehouse and the stream that writes to it, the Firestore
 * document the ingester rehydrates from, the ingester's hot state over HTTP,
 * and the file store the local replay writes. Reach in through here, never through a deep
 * path - the dependency check fails the build on one.
 *
 * **Nothing synthetic is exported from here.** The fixture generator, the
 * ports backed by it and the loader that replays it are at
 * `@power-meter/infrastructure/fixtures`, a second entry point, so that the web
 * app's live path can be shown by its import graph never to reach them.
 */
export {
  decodeStationPayload,
  StationDecoder,
  type DecodeIssue,
  type DecodeIssueKind,
  type DecodeOptions,
  type DecodeResult,
} from "./mqtt/decoder.ts";
export { numericField, parseStationPayload } from "./mqtt/payload.ts";
export {
  SCALES,
  unconfirmedScales,
  type ScaleConfidence,
  type ScaleFactor,
  type ScaleTable,
} from "./mqtt/scaling.ts";
export { bigQueryClient } from "./warehouse/client.ts";
export { storageWriteStream } from "./warehouse/stream.ts";
export type { RowStream, StorageWriteOptions } from "./warehouse/stream.ts";
export {
  DEFAULT_LATEST_DOCUMENT,
  FirestoreLatestStore,
  firestoreDocumentStore,
  fromLatestDocument,
  toLatestDocument,
  type DocumentStore,
  type FirestoreOptions,
  type LatestDocument,
} from "./firestore/latest-store.ts";
export type {
  BigQueryClientOptions,
  QueryParams,
  WarehouseClient,
} from "./warehouse/client.ts";
export {
  MIGRATIONS,
  checksum as migrationChecksum,
  render as renderMigration,
  validate as validateMigrations,
  type Migration,
} from "./warehouse/migrations.ts";
export {
  WarehouseReadingRepository,
  WarehouseRollupRepository,
  type WarehouseRepositoryOptions,
} from "./warehouse/repository.ts";
export { CachedRollupRepository, type CacheOptions } from "./warehouse/cache.ts";
export { WarehouseReadingWriter, type LatestWriter } from "./warehouse/writer.ts";
export {
  partitionSettings,
  resetWarehouse,
  runMigrations,
  type MigrationOutcome,
  type PartitionSetting,
} from "./warehouse/runner.ts";
export {
  DEFAULT_DATASET,
  RETENTION_DAYS,
  RETIRED_TABLES,
  TABLES,
  tableRef,
  type WarehouseTarget,
} from "./warehouse/schema.ts";
export {
  readingsFromLatest,
  toLatestDto,
  type LatestReadingDto,
  type LatestResponse,
} from "./hot-state/dto.ts";
export {
  IngesterLatestReadingStore,
  metadataIdToken,
  type IngesterClientOptions,
  type TokenSource,
} from "./hot-state/client.ts";
export {
  FILES as FILE_STORE_FILES,
  FileLatestReadingStore,
  FileReadingRepository,
  FileReadingWriter,
  FileRollupRepository,
} from "./file-store/file-store.ts";
export { isLoopbackUrl } from "./net.ts";
