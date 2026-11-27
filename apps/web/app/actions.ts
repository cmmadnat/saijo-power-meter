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
import type { MeterLabelInput } from "@power-meter/application";
import { availableViews, labelStore } from "@/lib/data-mode";
import { DEPARTMENT_FIELD, LABEL_FIELD, LOCATION_FIELD, MACHINE_NUMBER_FIELD } from "@/lib/registry-source";
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
 * rather than stored. A meter whose name, department, location and machine
 * number are all empty loses its label; a field absent from the form (an old
 * page open in a tab) leaves that meter untouched rather than clearing it.
 */
export async function saveStationLabels(form: FormData): Promise<void> {
  const store = await labelStore();
  if (store === null) return;

  const slots = MeterRegistry.fromWorkbook();
  const topic = form.get("topic");
  if (typeof topic !== "string") return;
  const meters = slots.forTopic(topic).filter((meter) => meter.commissioned);
  if (meters.length === 0) return;

  const changes = new Map<MeterId, MeterLabelInput>();
  for (const meter of meters) {
    const name = form.get(`${LABEL_FIELD}${meter.meterId}`);
    if (typeof name !== "string") continue;
    const department = form.get(`${DEPARTMENT_FIELD}${meter.meterId}`);
    const location = form.get(`${LOCATION_FIELD}${meter.meterId}`);
    const machineNumber = form.get(`${MACHINE_NUMBER_FIELD}${meter.meterId}`);
    changes.set(meter.meterId, {
      name,
      department: typeof department === "string" ? department : null,
      location: typeof location === "string" ? location : null,
      machineNumber: typeof machineNumber === "string" ? machineNumber : null,
    });
  }
  await store.setLabels(changes);

  revalidatePath("/", "layout");
  redirect(`/meters?saved=${encodeURIComponent(topic)}#${encodeURIComponent(topic)}`);
}
