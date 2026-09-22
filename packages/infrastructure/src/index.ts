/**
 * The infrastructure layer's public entry point.
 *
 * Adapters, not rules: the MQTT payload decoder with the scale factors it
 * applies, and the fixture data the screens are built against before a store
 * exists. Reach in through here, never through a deep path - the dependency
 * check fails the build on one.
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
export {
  defaultProfiles,
  generateFixtures,
  toStationPayload,
  type FixtureOptions,
  type FixtureSet,
  type MeterProfile,
} from "./fixtures/generate.ts";
export {
  FixtureLatestReadingStore,
  FixtureReadingRepository,
} from "./fixtures/repository.ts";
export { bigQueryClient } from "./warehouse/client.ts";
export type {
  BigQueryClientOptions,
  QueryParams,
  WarehouseClient,
} from "./warehouse/client.ts";
export {
  loadFixtures,
  verifyAgainstFixtures,
  type LoadFixturesOptions,
  type LoadReport,
  type Verification,
} from "./warehouse/loader.ts";
export {
  MIGRATIONS,
  checksum as migrationChecksum,
  render as renderMigration,
  validate as validateMigrations,
  type Migration,
} from "./warehouse/migrations.ts";
export {
  WarehouseLatestReadingStore,
  WarehouseReadingRepository,
} from "./warehouse/repository.ts";
export { WarehouseReadingWriter } from "./warehouse/writer.ts";
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
  TABLES,
  tableRef,
  type WarehouseTarget,
} from "./warehouse/schema.ts";
