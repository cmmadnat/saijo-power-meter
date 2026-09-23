/**
 * The viewer's choice of view, read from the request.
 *
 * Its own module because it is the one place that needs `next/headers`, which
 * only resolves inside Next: the source files and `data-mode.ts` stay plain
 * functions the Node test runner can import, and the pages pass the source
 * this returns into them.
 */
import { cookies } from "next/headers";
import { availableViews, resolveView, type ViewId } from "./data-mode.ts";

/** The cookie the header toggle sets. A year; it is a preference, not a session. */
export const VIEW_COOKIE = "pm-view";
export const VIEW_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export async function currentView(): Promise<ViewId> {
  const requested = (await cookies()).get(VIEW_COOKIE)?.value;
  return resolveView(requested, availableViews());
}
