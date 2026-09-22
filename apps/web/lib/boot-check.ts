/**
 * The data-mode gate, run once at boot by `instrumentation.ts`.
 *
 * It exits the process non-zero with the reason on stderr, so a Cloud Run
 * revision configured with `DATA_MODE=live` and a guessed divisor fails its
 * startup probe and never takes traffic — the same shape as the ingester's
 * gate. Node-only, which is why it is its own module.
 */
import { dataMode, provenance } from "./data-mode.ts";

export function checkDataModeAtBoot(): void {
  try {
    const mode = dataMode();
    console.log(`data mode: ${mode.mode} — ${provenance().line}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
