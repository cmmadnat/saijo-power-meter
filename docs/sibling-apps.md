# The sibling apps

`reference doc/` specifies four systems besides the power meter. Each becomes its own repository
and its own GCP project, linked to the same billing account, sharing nothing with this one but the
way it is built and deployed. Decided 2026-09-25.

## The four

| App | Repo / GCP project | Source | Data arrives by |
| --- | --- | --- | --- |
| **Calorie Testing Room** — **next** | `saijo-calorie-room` | `BOI Calorie Testing Room Rv01.pdf` | Manual entry and file import. No MQTT |
| Function Test | `saijo-function-test` | `BOI Smart Factory - Function test Rv01.pdf`, `function test/` | MQTT, `FTIndoor01–10`, `FTOutdoor01–20` |
| Field & Reliability | `saijo-field-reliability` | `Field  Usability Tester with AIoT.pdf`, `Tablet Field and Reliability(1).pdf` | MQTT, `FieldTest01–20` |
| EMC | `saijo-emc` | `Smart Factory EMC Rv01.pdf` | Upload of an EN 55014-1 conducted-emission result |

The names are proposals until the repositories exist.

## Calorie Testing Room, from the mock-up

Three screens, under the title *Smart Lab IoT Tester and AI Software for Calorie Meter Room*:

1. **Air-conditioner details** (รายละเอียดเครื่องปรับอากาศ) — spec forms per unit: model and serial,
   Fix/Inverter, capacity (BTU/h), efficiency; evaporator and condenser (fin type, fins/inch,
   materials, tube size, rows, face area); indoor and outdoor fans (RPM, CFM); refrigerant type and
   charge (g); flow-rate device (cap tube, EXV or TXV); compressor.
2. **Test results** (รายละเอียดผลทดสอบ) — an **Import** of room conditions (indoor/outdoor dry and
   wet bulb) and 20 results: total, sensible and latent capacity, power input, V, A, PF, EER, and
   twelve temperatures and pressures around the refrigerant circuit.
3. **Adjustment advice** (ข้อแนะนำในการปรับ) — the spec screens again with a **recommended value**
   (ค่าแนะนำ) column beside each spec value.

No MQTT topic for it appears in the workbook, so it needs no ingester and no VM: forms and records
in Firestore, imported files in Cloud Storage, the web app on Cloud Run.

## Questions for the customer before building past the forms

- **What file does Import read?** The room's own software export — format, one file per test or
  per run, a sample.
- **What produces the recommended values?** `function test/AI.xlsx` and `Train AI rev.2.xlsx` are
  FM-LB-006 lab test reports (performance at 35 °C outdoor: capacity, power input, coil, fan and
  compressor configurations) and look like training data for exactly this screen, but they sit in
  the Function Test folder. Which app are they for, and is the expected output a model, a lookup
  against past tests, or engineering rules?
- **Is TIS 1155-2558** (in the same folder) the standard the results are judged against?

## Order after it

Function Test, then Field & Reliability — both reuse this repo's MQTT ingester almost as is — then
EMC. Each MQTT app inherits the power meter's gate: it refuses to record until its scaling
(`Value = Data/4`, `Value = Data - 40`, …) is confirmed from a real payload.

## Costs to know

- The free e2-micro is one per **billing account**, and the power meter's ingester already has it.
  Every further ingester VM is about US$7–8 a month. Calorie Room and EMC need none.
- The three MQTT apps read the customer's one HiveMQ broker on separate topics. Ask for a broker
  user per app; the current credentials are committed and due for rotation regardless.
