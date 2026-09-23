/**
 * Each state the feed can be in, and the order they are tested in: a fault
 * upstream must not be reported as the fault it causes downstream.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { freshnessForInterval } from "@power-meter/application";
import type { FeedHealth } from "@power-meter/infrastructure";
import type { FeedStatus } from "./data-source.ts";
import { feedCondition } from "./feed-condition.ts";

const now = new Date("2026-09-23T08:40:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const MINUTE = 60_000;

function health(overrides: Partial<FeedHealth> = {}): FeedHealth {
  return {
    startedAt: ago(60 * MINUTE),
    connected: true,
    connectedSince: ago(60 * MINUTE),
    lastBrokerProblem: null,
    messages: 540,
    lastMessageAt: ago(20_000),
    issueCounts: {},
    recentIssues: [],
    ...overrides,
  };
}

/** `null` for an observer that reported no health; omitted for a healthy one. */
function feed(overrides: Partial<FeedStatus> = {}, h: FeedHealth | null = health()): FeedStatus {
  return {
    publishIntervalMs: MINUTE,
    observedAt: ago(10_000),
    thresholds: freshnessForInterval(MINUTE),
    ...(h === null ? {} : { health: h }),
    ...overrides,
  };
}

test("a feed arriving on schedule is receiving", () => {
  const condition = feedCondition(feed(), now);
  assert.equal(condition.kind, "receiving");
  assert.equal(condition.tone, "ok");
  assert.match(condition.detail, /540 messages/);
});

test("no snapshot at all is no observer", () => {
  assert.equal(feedCondition(feed({ observedAt: null }, null), now).kind, "no-observer");
});

test("an old snapshot is a stopped observer, whatever it last said", () => {
  // It last said "connected and receiving": that is exactly what must not be believed.
  const condition = feedCondition(feed({ observedAt: ago(5 * MINUTE) }), now);
  assert.equal(condition.kind, "observer-stopped");
  assert.equal(condition.tone, "bad");
});

test("disconnected is the broker, and names what the broker said", () => {
  const condition = feedCondition(
    feed({}, health({ connected: false, connectedSince: null, lastBrokerProblem: { at: ago(MINUTE), message: "Not authorized" } })),
    now,
  );
  assert.equal(condition.kind, "broker-unreachable");
  assert.match(condition.detail, /Not authorized/);
});

test("connected and nothing ever published is today's situation, said plainly", () => {
  const condition = feedCondition(feed({ publishIntervalMs: null }, health({ messages: 0, lastMessageAt: null })), now);
  assert.equal(condition.kind, "nothing-published");
  assert.equal(condition.tone, "warn");
  assert.match(condition.title, /No power-meter data received yet/);
  assert.match(condition.detail, /planned installation/);
});

test("a feed that stopped is silent, measured against its own rate", () => {
  // Twenty missed publishes at a minute each; ten minutes would still be stale, not silent.
  assert.equal(feedCondition(feed({}, health({ lastMessageAt: ago(25 * MINUTE) })), now).kind, "feed-silent");
  assert.equal(feedCondition(feed({}, health({ lastMessageAt: ago(10 * MINUTE) })), now).kind, "receiving");
});

test("an observer too old to report its health is only known to be up", () => {
  const condition = feedCondition(feed({}, null), now);
  assert.equal(condition.kind, "receiving");
  assert.match(condition.detail, /does not report/);
});
