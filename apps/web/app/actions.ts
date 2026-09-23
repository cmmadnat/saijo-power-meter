"use server";

/**
 * The header toggle's one action: remember the chosen view.
 *
 * A server action rather than a client-set cookie so the toggle is a plain
 * form and works before hydration. Setting the cookie is what re-renders the
 * route — every screen reads the view per request — so there is nothing to
 * revalidate by hand.
 */
import { cookies } from "next/headers";
import { availableViews } from "@/lib/data-mode";
import { VIEW_COOKIE, VIEW_COOKIE_MAX_AGE } from "@/lib/view";

export async function chooseView(form: FormData): Promise<void> {
  const view = form.get("view");
  // Only a view this deployment offers; anything else is ignored, which leaves
  // the viewer where they were.
  if (typeof view !== "string" || !availableViews().some((offered) => offered === view)) return;
  (await cookies()).set(VIEW_COOKIE, view, {
    path: "/",
    maxAge: VIEW_COOKIE_MAX_AGE,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}
