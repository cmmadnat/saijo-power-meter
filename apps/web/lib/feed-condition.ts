/**
 * What state the incoming feed is in, in one sentence a person on the factory
 * floor can act on.
 *
 * The Incoming view shows real data, including when the real data is bad.
 * Without this, every failure looks the same — 55 offline meters — whether
 * the observer's VM is down, it cannot reach the broker, it is connected and
 * nobody is publishing, or the feed went quiet an hour ago. Those need
 * different people to do different things, so they are told apart here, first
 * match wins, in the order a fault upstream hides one downstream:
 *
 * 1. no snapshot at all — the observer has never run;
 * 2. a snapshot older than three of the observer's own write intervals — the
 *    observer has stopped (the VM, or a crash loop);
 * 3. not connected — the observer is up and cannot reach the broker;
 * 4. connected, zero messages since it started — nobody is publishing;
 * 5. the last message older than the stale threshold — the feed stopped;
 * 6. receiving.
 *
 * Decode errors are orthogonal: a feed can be arriving and malformed, so they
 * are reported beside whichever of the six applies, never instead of it.
 */
import type { FeedStatus } from "./data-source.ts";
import { formatAge, formatClock } from "./format.ts";

export type FeedConditionKind =
  | "no-observer"
  | "observer-stopped"
  | "broker-unreachable"
  | "nothing-published"
  | "feed-silent"
  | "receiving";

export interface FeedCondition {
  readonly kind: FeedConditionKind;
  readonly tone: "bad" | "warn" | "ok";
  readonly title: string;
  readonly detail: string;
}

/** The observer writes every 30 s; three missed writes is not a hiccup. */
export const OBSERVER_STALE_MS = 3 * 30_000;

export function feedCondition(feed: FeedStatus, now: Date): FeedCondition {
  const { observedAt, health } = feed;

  if (observedAt === null) {
    return {
      kind: "no-observer",
      tone: "bad",
      title: "No observer",
      detail:
        "The observer has never written its snapshot, so nothing about the feed is known. " +
        "It may not be deployed, or may be failing at startup.",
    };
  }

  const snapshotAge = now.getTime() - observedAt.getTime();
  if (snapshotAge > OBSERVER_STALE_MS) {
    return {
      kind: "observer-stopped",
      tone: "bad",
      title: `Observer not reporting since ${formatClock(observedAt)}`,
      detail:
        `Its last snapshot is ${formatAge(snapshotAge)} old; it writes one every 30 s. ` +
        "Everything below is as it was then. The VM may be down or restarting.",
    };
  }

  // A snapshot from an observer that predates the health section: all that is
  // known is that it is up.
  if (health === undefined) {
    return {
      kind: "receiving",
      tone: "ok",
      title: `Observer up · as of ${formatClock(observedAt)}`,
      detail: "This observer does not report its connection or errors.",
    };
  }

  if (!health.connected) {
    const problem = health.lastBrokerProblem;
    return {
      kind: "broker-unreachable",
      tone: "bad",
      title: "Observer cannot reach the broker",
      detail:
        (problem === null
          ? "It is not connected and has not said why."
          : `Last reported at ${formatClock(problem.at)}: ${problem.message}.`) +
        " It keeps retrying; readings below are the last ones it received.",
    };
  }

  const since = health.connectedSince ?? health.startedAt;
  if (health.messages === 0) {
    return {
      kind: "nothing-published",
      tone: "warn",
      title: "No power-meter data received yet",
      detail:
        `The observer has been connected to the broker since ${formatClock(since)} and is ` +
        "subscribed to PMeterStation01–09, but nothing has been published on those topics. " +
        "The meters below are the planned installation from the customer's workbook; " +
        "none of them is reporting.",
    };
  }

  const lastAt = health.lastMessageAt;
  const silentFor = lastAt === null ? null : now.getTime() - lastAt.getTime();
  if (lastAt !== null && silentFor !== null && silentFor > feed.thresholds.staleWithinMs) {
    return {
      kind: "feed-silent",
      tone: "warn",
      title: `Feed silent since ${formatClock(lastAt)}`,
      detail:
        `Connected, but no message for ${formatAge(silentFor)} after ${health.messages} ` +
        `received since ${formatClock(health.startedAt)}. The publisher has stopped, or its topics changed.`,
    };
  }

  return {
    kind: "receiving",
    tone: "ok",
    title: "Receiving",
    detail:
      `${health.messages} message${health.messages === 1 ? "" : "s"} since ${formatClock(health.startedAt)}` +
      (lastAt === null ? "" : `, the last at ${formatClock(lastAt)}`) +
      (feed.publishIntervalMs === null ? "" : `, about one every ${formatAge(feed.publishIntervalMs)} per station`) +
      ".",
  };
}
