/**
 * Whether a URL names this machine.
 *
 * It is the whole exemption both startup gates grant — the ingester's, for a
 * broker, and the web app's, for an ingester — so it has one definition.
 * Hostnames are compared rather than resolved, because a name that resolves to
 * 127.0.0.1 today is a DNS record someone else controls tomorrow.
 */
export function isLoopbackUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]"
  );
}
