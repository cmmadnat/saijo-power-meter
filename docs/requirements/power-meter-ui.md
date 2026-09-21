# Power Meter — the four screens, as specified

Source: `reference doc/power meter/Smart Factory - Power meter.pdf`, 4 pages, 1920×1080 each. The
pages are a picture of the intended UI, not a written specification, so everything below is read off
the mock-up: text is quoted as the customer wrote it, and anything not on the page is called out as
a gap rather than filled in.

Companion documents: `power-meter-mqtt.md` (the protocol and what each field means) and
`../power-meter-rebuild-plan.md` (which step builds which screen).

## Shell, common to all four pages

Every page carries the same frame:

- A title, top left: **Smart Factory Power meter**.
- A left-hand nav with two entries, **Power meter** and **History**.
- Inside *Power meter*, a **Real time** tab headed **Power Meter**.

So there are two routes, not four. **Real time** carries screens 1–3 — page 1 shows the table with
the kW panel beginning below it, and page 2 is that same panel full-page — and **History** carries
screen 4. That is how `apps/web` is laid out: `/` and `/history`.

Labels on the mock-up are Thai, and they are reproduced verbatim in the UI. Page 1's first column
prints as `หมายเลขมิเตอร` when the PDF is extracted; that is the font's private-use encoding
of the mark on หมายเลขมิเตอร์, not a different word.

## Screen 1 — Real time, table (page 1)

One row per meter. Fifteen columns under four groups, in this order:

| # | Header on the mock-up | Meaning | Source |
| --- | --- | --- | --- |
| 1 | หมายเลขมิเตอร์ | Meter number | Registry — station and Power Meter ID |
| 2 | แผนก | Department | Registry (`department`) |
| 3 | หมายเลขเครื่องจักร | Machine number | Registry — see *Machine number* below |
| 4 | ชื่อเครื่องจักร | Machine name | Registry (`machineName`) |
| 5–7 | Voltage (V) — L1, L2, L3 | Volts, one per phase | `M<n>VL1..3` |
| 8–10 | Current (A) — L1, L2, L3 | Amperes, one per phase | `M<n>CL1..3` |
| 11 | PF | Power factor, 0–1 | `M<n>PF` |
| 12 | Power(kW) | Active power | `M<n>P` |
| 13 | Energy (kWh) | Cumulative energy counter | `M<n>E` |

Voltage and Current are drawn as a two-row header: a spanning group label with L1/L2/L3 beneath it.
The rows on the mock-up are labelled `Power Meter 1` … `Power Meter 5` — placeholders, five of them,
where the real screen shows all **55 commissioned meters**.

Nothing else is on the page: no chart per row, no status column, no actions, no per-meter link.

**What the mock-up does not say, and what we do about it:**

- *No freshness indication.* The payloads carry no timestamp and the mock-up carries no "last seen".
  A factory screen that shows a dead meter's final reading as though it were live is the failure
  mode worth preventing, so the implementation adds an age-derived status per row — **live**,
  **stale**, **offline** — and shows offline rows visibly differently. Thresholds are stated in
  `packages/application/src/realtime.ts` and derive from the 9-second publish interval. This is an
  addition to the spec, and a small one; flag it to the customer rather than assume it is wanted.
- *No sort or filter.* With 5 mock rows none is needed; with 55 both are. The implementation sorts
  by any column and filters by department — the same department values the History screen filters
  on, so the two screens agree.
- *No refresh rate.* "Real time" against a 9-second publish interval means the screen re-reads on
  that order. The implementation polls every 10 seconds and shows the time of the last refresh.

### Meter number

The mock-up prints `Power Meter 1` … `Power Meter 5`, a flat sequence. The workbook does not number
meters flat — it numbers them **per station**, `Power Meter ID` 1–8 within `Station` 1–9 — and
identity in this system is `s<station>m<slot>` for the reasons in `power-meter-mqtt.md`. A flat
1–55 numbering would be a fourth name for the same thing and would shift whenever a slot is
commissioned.

So the column shows **station and meter ID**, formatted `01-1`, which is what the workbook's own two
columns say and what a technician reading the panel can match against the hardware.
**Open question for the customer:** if the intent was a flat 1–55, it is a one-line change.

### Machine number

**There is no machine-number column in the workbook.** The MQTT sheet has one `Name` field per
slot, and in 27 of the 55 commissioned rows it carries the code inline after a colon —
`ปั้มเหล็ก 300 Ton : STL003`, `เครื่องฉีดพลาสติก : 014`, `เครื่องพับเหล็ก : 3`. Twenty-five names
have no colon and no code (`ไลน์พ่นสี`, `Leak Test Helium`, `ปั้มลม 1`), and three MDB rows have a
*department* after the colon (`ตู้ไฟฟ้า MDB3 : แผนกจัดส่ง`), not a code.

The codes are also not unique on their own — `เครื่องพับเหล็ก : 3` and `เลเซอร์ตัดเหล็ก HSG : 3`
both print `3`. The column is a label beside the machine name, never an identifier; identity stays
`s<station>m<slot>`.

The registry therefore splits the name on that colon, and takes the suffix as the machine number
**only when it looks like a code** — letters and digits containing at least one digit. Otherwise the
machine number is empty and the whole string stays in the name column. `machineNumber` and
`machineLabel` in `packages/domain/src/meter.ts` implement exactly that, with the cases above as
tests.

**Open question for the customer:** whether a real machine-number list exists that should replace
this parsing. It is a registry change, not a UI one, if it does.

## Screen 2 — Real time, power over time (page 2)

Headed **Power(kW)**. A line chart, x-axis labelled **Time**, with two series drawn (labelled `1`
and `2`) against a left-hand list of five `Power meter` entries — the meter selector. Page 1 shows
this same panel starting below the table, so on the built screen it sits under it rather than on a
separate route.

Not stated: how many meters may be selected at once, the time window, the refresh rate, the y-axis
range. Step 4 picks a multi-select with a window control, per the rebuild plan.

## Screen 3 — Real time, energy over time (page 3)

Identical to screen 2 with the y-axis labelled **Energy (kWh)**. Same selector, same shape, same
gaps. One chart component, two configurations.

Worth knowing while building it: `M<n>E` is a **cumulative counter**, so this series climbs and only
ever steps down when a meter is replaced. A chart that draws it as a rate would be wrong.

## Screen 4 — History (page 4)

Headed **History**, with a filter row and a table.

**Filters**, left to right as the mock-up lays them out:

| Label | Meaning |
| --- | --- |
| แผนก | Department |
| วันที่ / เวลา, under **Sart** *(sic — "Start")* | Start date and start time |
| ถึงวันที่ / เวลา, under **End** | End date and end time |

Date and time are separate inputs, not one datetime field. All of it is **Asia/Bangkok**; instants
are stored UTC and converted at the edges.

**Table** — six columns:

| Header | Meaning |
| --- | --- |
| หมายเลขมิเตอร์ | Meter number, as screen 1 |
| แผนก | Department |
| หมายเลขเครื่องจักร | Machine number |
| ชื่อเครื่องจักร | Machine name |
| Total Energy (kWh) | Energy consumed across the window |
| ชั่วโมงการทำงาน (Hr:min) | Running hours across the window, as hours and minutes |

Ten placeholder rows, so the real table is all meters matching the department filter.

Total Energy is the counter's rise across the window — last reading minus first — **with the
counter reset handled**, or a meter replacement reads as a large negative. Running hours is the time
the meter spent above its **Stand by Power Level** (0.1 kW for all 55 today), which is
`isRunning` in the domain. Both are specified in the rebuild plan's step 5 and computed there.

Not stated: whether the range is inclusive of the end minute, what an empty range shows, and whether
a meter with no readings in the window appears as a zero row or not at all. Step 5 decides these and
records the choice.

## Explicitly not on any page

Cost per kWh, power quality, THD, phase balance, efficiency scores, alerts, and a per-meter detail
page. Several exist in the old application (`reference/`); none appear here. They are separate
requirements if the customer wants them.
