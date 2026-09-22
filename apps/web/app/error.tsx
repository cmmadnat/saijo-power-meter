"use client";

/**
 * What a screen shows when its data source did not answer.
 *
 * Only live mode reaches this in practice — the ingester unreachable, a
 * warehouse query refused — and the real-time route is a wall display: without
 * this, a single failed refresh would leave Next's default error page up, with
 * the table's refresh loop unmounted, until someone walked over and reloaded it.
 * So it says what happened and retries on the same ten-second rhythm the table
 * refreshes on. The server's message is not shown; in production React replaces
 * it with a digest, which is what the log line carries.
 */
import { useEffect } from "react";

const RETRY_MS = 10_000;

export default function ScreenError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    const id = setInterval(retry, RETRY_MS);
    return () => clearInterval(id);
  }, [retry]);

  return (
    <section className="flex flex-col gap-3 border border-status-offline p-6">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        No data
      </p>
      <h1 className="text-xl font-semibold">The data source did not answer</h1>
      <p className="max-w-[70ch] text-sm text-muted-foreground">
        Nothing on this screen would be current, so none of it is shown. Trying
        again every ten seconds.
        {error.digest !== undefined && (
          <span className="font-mono"> Reference {error.digest}.</span>
        )}
      </p>
      <button
        type="button"
        onClick={retry}
        className="w-fit border border-border px-3 py-1.5 font-mono text-xs uppercase tracking-wider hover:border-accent-strong"
      >
        Try now
      </button>
    </section>
  );
}
