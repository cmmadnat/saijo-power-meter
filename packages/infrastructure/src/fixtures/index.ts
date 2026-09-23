/**
 * The fixture entry point: `@power-meter/infrastructure/fixtures`.
 *
 * Everything synthetic, and nothing else. The generator, the two ports backed
 * by it, and the loader that replays it into the warehouse live behind this
 * separate entry rather than the package's main one, so that "no fixture
 * module is reachable from a live-mode render path" is a property of the
 * import graph and not of a branch someone could get wrong. The main entry
 * never re-exports anything from here; `scripts/check-boundaries.mjs` walks the
 * web app's live path and fails the build if it reaches this directory.
 *
 * Who imports it, and why that is allowed: the web app's demo adapter set
 * (loaded only in demo mode), the ingester's replay harness and tests, and the
 * warehouse CLI's `load` and `verify`.
 */
export {
  defaultProfiles,
  generateFixtures,
  toStationPayload,
  type FixtureOptions,
  type FixtureSet,
  type MeterProfile,
} from "./generate.ts";
export {
  FixtureLatestReadingStore,
  FixtureReadingRepository,
} from "./repository.ts";
export {
  loadFixtures,
  verifyAgainstFixtures,
  type LoadFixturesOptions,
  type LoadReport,
  type Verification,
} from "../warehouse/loader.ts";
