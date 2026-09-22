/**
 * Boot-time checks. Next calls `register` once, before the server takes its
 * first request.
 *
 * The one check is the data mode's: `DATA_MODE=live` while a scale divisor is
 * still a guess is a startup failure, not a warning in a log and not an error
 * page on first request. The process exits non-zero with the reason on stderr,
 * so a Cloud Run revision configured that way fails its startup probe and never
 * takes traffic — the same shape as the ingester's gate.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { dataMode, provenance } = await import("./lib/data-mode.ts");
  try {
    const mode = dataMode();
    console.log(`data mode: ${mode.mode} — ${provenance().line}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
