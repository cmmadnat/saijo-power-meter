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
