/**
 * Getting a station payload into an object, given that the documented sample is
 * not valid JSON.
 *
 * The workbook's sample carries `"M1PF":095`. A leading zero on a number is
 * illegal JSON and `JSON.parse` rejects the whole payload over it. Whether the
 * device really emits that, or the sheet is being loose with notation, is one of
 * the things to confirm with the customer - so until then the parser tolerates
 * both that and the quoted form `"095"`, rather than dropping a station's worth
 * of readings on a notation question.
 *
 * Tolerance stops there: anything else malformed still throws, because a payload
 * we cannot read is worth an error and a payload we misread is not.
 */

/**
 * Strips leading zeros from numbers in value position.
 *
 * Only a sequence that directly follows a quoted key and a colon is touched, so
 * a zero inside a key or a quoted value is left alone. The payloads are flat and
 * numeric, which is what makes a repair this narrow sufficient.
 */
const ZERO_PADDED_VALUE = /("(?:[^"\\]|\\.)*"\s*:\s*)(-?)0+(\d)/g;

export function parseStationPayload(
  payload: string | Uint8Array,
): Record<string, unknown> {
  const text =
    typeof payload === "string"
      ? payload
      : new TextDecoder("utf-8", { fatal: false }).decode(payload);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = JSON.parse(text.replace(ZERO_PADDED_VALUE, "$1$2$3"));
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError(
      `station payload must be a JSON object, got ${Array.isArray(parsed) ? "an array" : typeof parsed}`,
    );
  }
  return parsed as Record<string, unknown>;
}

/**
 * A payload field as a number, or null if it is absent or not numeric.
 *
 * Accepts the quoted form too: if the device turns out to send `"095"` rather
 * than `095`, that is the same reading and not an error.
 */
export function numericField(
  payload: Record<string, unknown>,
  key: string,
): number | null {
  const raw = payload[key];
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}
