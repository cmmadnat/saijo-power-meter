"use server";

/**
 * The server actions: the header toggle's, and the Meters page's.
 *
 * Both are plain forms posting here, so they work before hydration. Setting
 * the view cookie is what re-renders the route — every screen reads the view
 * per request — so the toggle has nothing to revalidate by hand; a label save
 * revalidates, because labels are cached per instance.
 */
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MeterRegistry, type MeterId } from "@power-meter/domain";
import { availableViews, labelStore } from "@/lib/data-mode";
import { LABEL_FIELD } from "@/lib/registry-source";
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

/**
 * Save one station's labels from the Meters page.
 *
 * Only meters on the station the form was for, and only commissioned ones: the
 * form is an untrusted request, and a field naming anything else is ignored
 * rather than stored. An empty field removes that meter's label. `fill=workbook`
 * puts the workbook's machine name into every field left empty — a starting
 * point, stored as a label like any other, so it can be corrected.
 */
export async function saveStationLabels(form: FormData): Promise<void> {
  const store = await labelStore();
  if (store === null) return;

  const workbook = MeterRegistry.fromWorkbook();
  const topic = form.get("topic");
  if (typeof topic !== "string") return;
  const meters = workbook.forTopic(topic).filter((meter) => meter.commissioned);
  if (meters.length === 0) return;
  const fill = form.get("fill") === "workbook";

  const changes = new Map<MeterId, string | null>();
  for (const meter of meters) {
    const raw = form.get(`${LABEL_FIELD}${meter.meterId}`);
    if (typeof raw !== "string") continue;
    const typed = raw.trim();
    changes.set(meter.meterId, typed === "" && fill ? meter.machineName : typed);
  }
  await store.setLabels(changes);

  revalidatePath("/", "layout");
  redirect(`/meters?saved=${encodeURIComponent(topic)}#${encodeURIComponent(topic)}`);
}
