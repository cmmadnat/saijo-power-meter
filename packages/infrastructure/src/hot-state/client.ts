/**
 * The real-time screen's port in live mode: the ingester's hot state, over HTTP.
 *
 * The ingester's Cloud Run service is private — no `allUsers` binding — and the
 * web service's account holds `run.invoker` on it. So a request carries an ID
 * token minted by the metadata server with the ingester's URL as its audience.
 * The service is not made public to save this: it is the live state of a
 * factory, and until step 9 there is no passcode in front of anything.
 */
import type { LatestReadingStore } from "@power-meter/application";
import type { MeterId, Reading } from "@power-meter/domain";
import { readingsFromLatest } from "./dto.ts";

/** Returns a bearer token for a request, or undefined to send none. */
export type TokenSource = () => Promise<string | undefined>;

export interface IngesterClientOptions {
  /** The ingester's base URL, e.g. its Cloud Run `uri` output. */
  readonly url: string;
  readonly token?: TokenSource;
  readonly fetch?: typeof fetch;
  /**
   * How long to wait. The screen refreshes every ten seconds; a request that
   * outlives that is answering a question nobody is still asking.
   */
  readonly timeoutMs?: number;
}

export class IngesterLatestReadingStore implements LatestReadingStore {
  readonly #endpoint: string;
  readonly #token: TokenSource;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;

  constructor(options: IngesterClientOptions) {
    this.#endpoint = new URL("/latest", options.url).toString();
    this.#token = options.token ?? (async () => undefined);
    this.#fetch = options.fetch ?? fetch;
    this.#timeoutMs = options.timeoutMs ?? 5_000;
  }

  async latest(): Promise<ReadonlyMap<MeterId, Reading>> {
    const token = await this.#token();
    const response = await this.#fetch(this.#endpoint, {
      headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    if (!response.ok) {
      throw new Error(
        `the ingester answered ${response.status} at ${this.#endpoint}` +
          (response.status === 401 || response.status === 403
            ? " — the web service account needs run.invoker on it, and the token's audience must be its URL"
            : ""),
      );
    }
    return new Map(
      readingsFromLatest(await response.json()).map((reading) => [reading.meterId, reading]),
    );
  }
}

const METADATA_IDENTITY =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";

/**
 * ID tokens from the Cloud Run metadata server, for one audience, cached.
 *
 * A token lives an hour; it is reused until five minutes before the `exp` it
 * carries, so a screen refreshing every ten seconds costs the metadata server
 * one call an hour rather than one per refresh.
 */
export function metadataIdToken(
  audience: string,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
): TokenSource {
  let cached: { token: string; refreshAtMs: number } | undefined;
  return async () => {
    if (cached !== undefined && now() < cached.refreshAtMs) return cached.token;
    const response = await fetcher(
      `${METADATA_IDENTITY}?audience=${encodeURIComponent(audience)}`,
      { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(3_000) },
    );
    if (!response.ok) {
      throw new Error(`the metadata server refused an ID token for ${audience}: ${response.status}`);
    }
    const token = (await response.text()).trim();
    cached = { token, refreshAtMs: expiryMs(token, now()) - 5 * 60_000 };
    return token;
  };
}

/** The token's own `exp`, or fifteen minutes from now if it cannot be read. */
function expiryMs(token: string, nowMs: number): number {
  try {
    const payload = token.split(".")[1] ?? "";
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: unknown;
    };
    if (typeof claims.exp === "number") return claims.exp * 1000;
  } catch {
    // Fall through: an unreadable token is still a token; just keep it briefly.
  }
  return nowMs + 15 * 60_000;
}
