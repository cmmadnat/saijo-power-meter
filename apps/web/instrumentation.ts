/**
 * Boot-time checks. Next calls `register` once, before the server takes its
 * first request.
 *
 * The one check is the data mode's: `DATA_MODE=live` while a scale divisor is
 * still a guess is a startup failure, not a warning in a log and not an error
 * page on first request. See `lib/boot-check.ts`. The import sits inside the
 * runtime test, in the form Next documents, so the Node-only module is never
 * compiled into the Edge build of this file.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { checkDataModeAtBoot } = await import("./lib/boot-check.ts");
    checkDataModeAtBoot();
  }
}
