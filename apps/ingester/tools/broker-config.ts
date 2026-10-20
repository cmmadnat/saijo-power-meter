/**
 * Where the tools get the broker's address and credentials.
 *
 * Shared by `capture.ts` and `takeover.ts`, which are the two things in this
 * repository allowed to point at the customer's broker — both read-only, both
 * writing nothing. The ingester itself does not use this: its configuration is
 * environment-only, because a deployment reads its credentials from Secret
 * Manager and a file in the checkout is not a deployment artefact.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import process from "node:process";

/**
 * Resolved against the repository root, not the working directory: `npm run
 * capture -w @power-meter/ingester` runs with the workspace as its cwd, and a
 * path that only works from one of the two places is a path that will be wrong
 * half the time.
 */
export const DEFAULT_CREDS = fileURLToPath(
  new URL("../../../reference doc/mqtt", import.meta.url),
);

export interface BrokerConfig {
  readonly url: string;
  readonly username: string | undefined;
  readonly password: string | undefined;
}

/**
 * `KEY=VALUE` lines, as the customer's file carries them.
 *
 * The file carries the address and the username; the password is not in it
 * since the broker moved on 2026-10-20, and comes from `MQTT_PASSWORD`. Export
 * it with `read -rs MQTT_PASSWORD; export MQTT_PASSWORD` rather than on a
 * command line, where it lands in a shell history. The environment wins for
 * all three.
 */
async function fromFile(path: string): Promise<Record<string, string>> {
  try {
    const text = await readFile(path, "utf8");
    return Object.fromEntries(
      text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "" && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const at = line.indexOf("=");
          return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
        }),
    );
  } catch {
    return {};
  }
}

/**
 * The address as a URL with a scheme.
 *
 * The customer's file now carries a full `wss://` URL, which passes through
 * untouched. A bare host is what HiveMQ's console used to print, and still
 * means TLS on 8883: assuming plain 1883 would send credentials in the clear.
 */
export function toUrl(raw: string): string {
  if (/^[a-z]+:\/\//.test(raw)) return raw;
  return `mqtts://${raw.includes(":") ? raw : `${raw}:8883`}`;
}

export async function brokerConfig(credsPath = DEFAULT_CREDS): Promise<BrokerConfig> {
  const file = await fromFile(credsPath);
  const raw = process.env["MQTT_URL"] ?? file["TLS_MQTT_URL"] ?? file["MQTT_URL"];
  if (raw === undefined || raw === "") {
    throw new Error(
      "No broker address. Put one in MQTT_URL, or point --creds at a file with " +
        "MQTT_URL / TLS_MQTT_URL in it (the default is `reference doc/mqtt`).",
    );
  }
  return {
    url: toUrl(raw),
    username: process.env["MQTT_USERNAME"] ?? file["USERNAME"],
    password: process.env["MQTT_PASSWORD"] ?? file["PASSWORD"],
  };
}
