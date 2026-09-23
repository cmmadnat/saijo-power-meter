/**
 * The Incoming view's account of its own feed: one line saying what state it is
 * in, and the recent errors in what arrived.
 *
 * Server-rendered, and handed plain strings: the condition is decided in
 * `lib/feed-condition.ts`, where it is tested, and this only draws it. The
 * tones reuse the freshness roles — offline, stale, live — because they mean
 * the same thing here at the level of the whole feed.
 */
import type { FeedCondition } from "@/lib/feed-condition";

export interface FeedIssueRow {
  readonly at: string;
  readonly topic: string;
  /** The meter it was about — number and label, or the topic when no slot is named. */
  readonly meter: string;
  readonly kind: string;
  readonly where: string | null;
  readonly detail: string;
}

const TONE: Record<FeedCondition["tone"], { border: string; dot: string; label: string }> = {
  bad: { border: "border-status-offline", dot: "bg-status-offline", label: "Fault" },
  warn: { border: "border-status-stale", dot: "bg-status-stale", label: "Attention" },
  ok: { border: "border-status-live", dot: "bg-status-live", label: "OK" },
};

export function FeedBanner({
  condition,
  issues,
  issueCounts,
}: {
  condition: FeedCondition;
  /** Newest first. */
  issues: readonly FeedIssueRow[];
  issueCounts: Readonly<Record<string, number>>;
}) {
  const tone = TONE[condition.tone];
  const total = Object.values(issueCounts).reduce((sum, n) => sum + n, 0);

  return (
    <section
      aria-label="Incoming feed status"
      data-testid="feed-banner"
      data-condition={condition.kind}
      className={`flex flex-col gap-3 border-s-4 border ${tone.border} bg-card p-4`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="flex items-center gap-2 font-mono text-2xs uppercase tracking-wider text-muted-foreground">
          <span aria-hidden className={`inline-block size-2 ${tone.dot}`} />
          Feed · {tone.label}
        </span>
        <h2 className="text-base font-semibold">{condition.title}</h2>
      </div>
      <p className="max-w-[100ch] text-sm text-muted-foreground">{condition.detail}</p>

      {total > 0 && (
        <details className="group">
          <summary className="cursor-pointer font-mono text-2xs uppercase tracking-wider text-foreground">
            {total} problem{total === 1 ? "" : "s"} in received payloads ·{" "}
            {Object.entries(issueCounts)
              .map(([kind, count]) => `${count} ${kind}`)
              .join(" · ")}
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-175 border-collapse text-xs">
              <caption className="sr-only">The most recent problems in received payloads</caption>
              <thead>
                <tr className="border-b border-border text-left font-mono text-3xs uppercase tracking-wider text-muted-foreground">
                  <th scope="col" className="py-1 pe-3 font-normal">Time</th>
                  <th scope="col" className="py-1 pe-3 font-normal">Meter</th>
                  <th scope="col" className="py-1 pe-3 font-normal">Problem</th>
                  <th scope="col" className="py-1 pe-3 font-normal">Key</th>
                  <th scope="col" className="py-1 font-normal">Detail</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue, index) => (
                  <tr key={index} className="border-b border-border/50 last:border-b-0">
                    <td className="py-1 pe-3 font-mono whitespace-nowrap">{issue.at}</td>
                    <td className="py-1 pe-3 whitespace-nowrap" title={issue.topic}>
                      {issue.meter}
                    </td>
                    <td className="py-1 pe-3 font-mono whitespace-nowrap">{issue.kind}</td>
                    <td className="py-1 pe-3 font-mono whitespace-nowrap">{issue.where ?? "—"}</td>
                    <td className="py-1">{issue.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-2xs text-muted-foreground">
              The last {issues.length} shown. A meter whose payload had a problem is skipped for
              that message and keeps its previous reading; the rest of the station still decodes.
            </p>
          </div>
        </details>
      )}
    </section>
  );
}
