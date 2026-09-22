# Power Meter — MQTT protocol, as extracted

Source: `reference doc/Smart Factory - Server and MQTT Rev01.xlsx`, sheet **MQTT Protocol**, rows
6–109 (the power-meter block). Rev. 01, updated 22/9/2025. Sheet **Sample data** supplies the one
documented scaling conversion.

Regenerate `meters.json` with `python3 tools/extract-meters.py` rather than editing it by hand.

## Shape

9 stations. One MQTT topic per station, named `PMeterStation01` … `PMeterStation09`. The sheet states
it directly: *"1 Station( Topic ) ประกอบด้วย P meter จำนวน 8 ชุด ID 1-8"* — **one topic carries 8
power meters, IDs 1–8.**

Each payload is flat JSON, 72 keys, prefixed by the meter's slot number. No timestamp, no station
identifier, no meter identity — **identity is positional**: which topic it arrived on, and which
`M<n>` prefix the key carries.

| Field | Key | Unit per sheet |
| --- | --- | --- |
| Voltage L1 / L2 / L3 | `M<n>VL1` `M<n>VL2` `M<n>VL3` | V |
| Current L1 / L2 / L3 | `M<n>CL1` `M<n>CL2` `M<n>CL3` | A |
| Active Power | `M<n>P` | kW |
| Power Factor | `M<n>PF` | — |
| Energy | `M<n>E` | kWh |

## The sample payload, verbatim

This is the whole thing as the workbook gives it. `PMeterStation02` is listed too and is
byte-identical.

```json
Topic: PMeterStation01
{
  "M1VL1":2321,"M1VL2":2321,"M1VL3":2321,"M1CL1":1522,"M1CL2":1522,"M1CL3":1522,"M1P":4995,"M1PF":095,"M1E":2324,
  "M2VL1":2321,"M2VL2":2321,"M2VL3":2321,"M2CL1":1522,"M2CL2":1522,"M2CL3":1522,"M2P":4995,"M2PF":095,"M2E":2324,
  "M3VL1":2321,"M3VL2":2321,"M3VL3":2321,"M3CL1":1522,"M3CL2":1522,"M3CL3":1522,"M3P":4995,"M3PF":095,"M3E":2324,
  "M4VL1":2321,"M4VL2":2321,"M4VL3":2321,"M4CL1":1522,"M4CL2":1522,"M4CL3":1522,"M4P":4995,"M4PF":095,"M4E":2324,
  "M5VL1":2321,"M5VL2":2321,"M5VL3":2321,"M5CL1":1522,"M5CL2":1522,"M5CL3":1522,"M5P":4995,"M5PF":095,"M5E":2324,
  "M6VL1":2321,"M6VL2":2321,"M6VL3":2321,"M6CL1":1522,"M6CL2":1522,"M6CL3":1522,"M6P":4995,"M6PF":095,"M6E":2324,
  "M7VL1":2321,"M7VL2":2321,"M7VL3":2321,"M7CL1":1522,"M7CL2":1522,"M7CL3":1522,"M7P":4995,"M7PF":095,"M7E":2324,
  "M8VL1":2321,"M8VL2":2321,"M8VL3":2321,"M8CL1":1522,"M8CL2":1522,"M8CL3":1522,"M8P":4995,"M8PF":095,"M8E":2324
}
```

**This is filler, not a capture.** Every one of the 8 slots carries identical values, and the same
`2321/1522/4995/095` quartet reappears on the Function Test and Field Test topics. Treat it as a
key-layout reference only — see *Scaling* below.

Note `"M1PF":095` is **not valid JSON**: a leading zero on a number is illegal, and `095` would be
rejected by a strict parser. **Settled by the 2026-09-22 capture below: the device sends `50`**, so
the sheet was being loose with notation. The decoder tolerates both either way.

## The first real capture, 2026-09-22

One message off `PMeterStation05`, read from the live broker with
`apps/ingester/tools/capture.ts` (the address and credentials arrived that day in
`reference doc/mqtt`). Verbatim:

```json
{"M1VL1":2240,"M1VL2":2240,"M1VL3":2240,"M1CL1":1877,"M1CL2":1877,"M1CL3":1877,"M1P":5350,"M1PF":50,"M1E":2679, ... M7 ...}
```

Three things it settles, and one it does not.

**The payload is ordinary JSON, and `PF` is not zero-padded.** It arrives as `"M1PF":50`, not
`095`. So the workbook's `095` was the sheet being loose with notation, not the device emitting
illegal JSON. The decoder tolerates both and needs no change; the open question is closed.

**Positional identity holds, and uncommissioned slots are absent rather than renumbered.** Station
05 published `M1`–`M7`. The registry has exactly seven commissioned slots there and the eighth,
`M8`, is the uncommissioned one — so the publisher omits the empty tail rather than shifting the
remaining meters down into it. Had it renumbered, every meter on that station would have been
mislabelled by one, silently. Worth re-checking on a station whose gap is in the middle.

**The broker, the topics and the credentials all work.** Nine messages, nine stations, one a second.

**It does not settle the scaling, because it is not a measurement.** All seven slots carry
*identical* values — the same signature as the workbook's filler, with a different constant. And
the numbers do not cohere with each other:

| | |
| --- | --- |
| V = 2240 / 10 | 224.0 V |
| PF = 50 / 100 | 0.50 |
| I = 1877 / 10 | 187.7 A |
| 3 x V x I x PF | **63.07 kW** |
| P = 5350 / 100 | **53.50 kW** |

Off by a factor of 1.179. No power of ten reconciles it from either side: the divisor `M<n>P`
would need is **84.83**. Scaling `I` by 100 instead moves both sides together and leaves the same
ratio. The workbook's filler failed the same test by a factor of 2.016, so the two fakes are not
even the same fake.

**What is still wanted:** a capture taken while real machines are running, in which the meters on
one station *differ from each other*, plus one of those meters' own display reading at the same
moment. The first settles active power arithmetically; the second is the only thing that can settle
energy, which has nothing in the payload to check against. Worth asking the customer in the same
breath whether these topics are being fed by the meters yet or by a test publisher.

## Scaling

**Documented (1 of 9 fields).** Sheet `Sample data`: `FT01VL1` = `2325` → `232.5 V`. So voltage is
`data / 10`.

**Not documented (8 of 9).** Current, active power, power factor and energy have no stated
conversion anywhere in the workbook. What can be inferred:

- **Current is almost certainly `data / 10`.** With voltage at `data/10` (232.1 V line-neutral) and
  PF 0.95, three-phase power is `3 × V × I × PF`. At `I = data/10` → 152.2 A that gives **100.7 kW**,
  right for a 300–500 ton press. At `data/100` → 15.22 A it gives 10.07 kW, too low for the named
  machines. The physics picks `/10`.
- **Power factor is probably `data / 100`** — `095` → 0.95, consistent with the fixed-width
  zero-padding.
- **Active power is in kW** (customer-confirmed; the header row also says kW). The **divisor is still
  unknown**: 4995 raw would be ~5 MW, which is not credible, so it is scaled. But no sane divisor
  reconciles 4995 with the 100.7 kW that V, I and PF imply — the value would need dividing by 49.6.
  The sample simply does not cohere, which is the clearest evidence it was never measured.
- **Energy** (`M<n>E` = 2324) has no documented scaling and no way to infer one. Assumed a cumulative
  kWh counter, to be confirmed by observation.

**One real captured payload from a running meter, plus that meter's own display reading at the same
moment, settles all of it.** The 2026-09-22 capture was real traffic but not a running meter — see
above: identical values across every slot, and a power figure 1.179x away from what its own V, I and
PF imply. Until a coherent one arrives the decoder keeps every factor in one constants table with
the unconfirmed ones marked, and each has a test asserting the assumption so changing it is loud.

## Errata in the source

Two typos in the mapping table's Current L2 column. The sample payload has the correct keys, so
follow the payload:

| Sheet row | Says | Should be |
| --- | --- | --- |
| 23 | `M6CL6` | `M6CL2` |
| 25 | `M8CL8` | `M8CL2` |

## Identity and labelling

Identity is positional, so it has to be assigned. `meters.json` gives every slot a stable key:

```
meterId = s<station:02d>m<slot>      e.g. s01m1, s09m4
```

Chosen because it is derivable from (topic, key prefix) with no lookup, stable if a machine is
renamed or moved, and readable in a URL and a log line. Department and machine name are **display
attributes hanging off it**, never identity — the same physical machine keeps its `meterId` if the
customer relabels it, and a re-used slot is a new machine on the same id, which is worth a note in
the registry if it ever happens.

**72 slots exist; 55 are commissioned.** Payloads always carry all 8 slots per station, so the
remaining 17 arrive as data for machines that do not exist. They are `commissioned: false` in the
registry and must be dropped at decode time, not rendered as meters reading zero.

| Station | Commissioned | Station | Commissioned |
| --- | --- | --- | --- |
| PMeterStation01 | 5/8 | PMeterStation06 | 6/8 |
| PMeterStation02 | 5/8 | PMeterStation07 | 7/8 |
| PMeterStation03 | 8/8 | PMeterStation08 | 6/8 |
| PMeterStation04 | 7/8 | PMeterStation09 | 4/8 |
| PMeterStation05 | 7/8 | | |

Five departments: ผลิต โลหะ (metal), ผลิต คอยล์ (coil), ผลิต พลาสติก (plastic), ตู้ไฟฟ้าเมน (main
electrical panels), ส่วนกลาง (central/shared). These are the History screen's filter values.

**Standby power level is 0.1 kW for every commissioned meter** — the threshold above which a machine
counts as running, for the History screen's running-hours column. It is per-meter in the sheet, so
keep it per-meter in the registry even though all 55 currently agree.

## Credentials

The workbook's `MQTT Server` tab contains the HiveMQ broker username and password in plaintext.
They belong in Secret Manager and should be rotated before go-live. They are deliberately not
reproduced here.
