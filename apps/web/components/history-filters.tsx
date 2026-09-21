/**
 * The History screen's filter row: department, start date/time, end date/time.
 *
 * A plain `<form method="get">` rather than a controlled React form. The
 * screen's whole state is four picker values and a department, all of which
 * belong in the URL so a range can be linked to or bookmarked; submitting a GET
 * form puts them there without a line of client JavaScript, and the screen
 * still works if none runs. The mock-up's own layout — department first, then
 * Sart (sic) and End, each as separate date and time inputs — is kept.
 */
import type { Department } from "@power-meter/domain";
import type { HistoryRange } from "@/lib/history-source";

export interface HistoryFiltersProps {
  readonly departments: readonly Department[];
  readonly department: Department | null;
  readonly range: HistoryRange;
}

const field =
  "h-9 border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";
const label =
  "font-mono text-[11px] uppercase tracking-wider text-muted-foreground";

export function HistoryFilters({
  departments,
  department,
  range,
}: HistoryFiltersProps) {
  return (
    <form
      method="get"
      className="flex flex-wrap items-end gap-x-6 gap-y-3 border border-border bg-card p-4"
    >
      <div className="flex flex-col gap-1">
        <label className={label} htmlFor="department">
          แผนก
        </label>
        <select
          id="department"
          name="department"
          defaultValue={department ?? ""}
          className={`${field} min-w-56`}
        >
          <option value="">ทั้งหมด</option>
          {departments.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-1 border-0 p-0">
        <legend className={label}>Start · วันที่ / เวลา</legend>
        <div className="flex gap-2">
          <input
            type="date"
            name="fromDate"
            aria-label="Start date"
            defaultValue={range.fromDate}
            className={`${field} font-mono`}
          />
          <input
            type="time"
            name="fromTime"
            aria-label="Start time"
            defaultValue={range.fromTime}
            className={`${field} font-mono`}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-1 border-0 p-0">
        <legend className={label}>End · ถึงวันที่ / เวลา</legend>
        <div className="flex gap-2">
          <input
            type="date"
            name="toDate"
            aria-label="End date"
            defaultValue={range.toDate}
            className={`${field} font-mono`}
          />
          <input
            type="time"
            name="toTime"
            aria-label="End time"
            defaultValue={range.toTime}
            className={`${field} font-mono`}
          />
        </div>
      </fieldset>

      <button
        type="submit"
        className="h-9 border border-primary bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        แสดง
      </button>

      <p className="ms-auto max-w-[36ch] font-mono text-[11px] text-muted-foreground">
        Asia/Bangkok. The end is exclusive: a reading at exactly the end time
        belongs to the next window.
      </p>
    </form>
  );
}
