/**
 * The meter registry a source's screens are drawn with.
 *
 * Demo and live use the workbook's: its departments and machine names are the
 * plant as the customer specified it. A source that carries labels — Incoming —
 * identifies meters the way its feed does, by station and slot, and names each
 * one by what a viewer has called it on the Meters page, or not at all.
 *
 * Server-only, like the registry itself.
 */
import { labelledRegistry } from "@power-meter/application";
import { MeterRegistry } from "@power-meter/domain";
import { dataSource } from "./data-mode.ts";
import type { DataSource } from "./data-source.ts";

export async function registryFor(
  source: DataSource | Promise<DataSource> = dataSource(),
): Promise<MeterRegistry> {
  const workbook = MeterRegistry.fromWorkbook();
  const { labels } = await source;
  return labels === undefined ? workbook : labelledRegistry(workbook, await labels.labels());
}

/** The prefix a label input's name carries on the Meters page: `label:s08m6`. */
export const LABEL_FIELD = "label:";
