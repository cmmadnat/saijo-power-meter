#!/usr/bin/env python3
"""Derive the power-meter registry from the customer MQTT workbook.

Reads the 'MQTT Protocol' sheet's power-meter block (rows 18-89) and emits the
station/slot registry as JSON. Re-run this instead of hand-editing meters.json
when the customer issues a new revision of the workbook.
"""
import json, pathlib, sys
import openpyxl

WORKBOOK = pathlib.Path("reference doc/Smart Factory - Server and MQTT Rev01.xlsx")
OUT = pathlib.Path("packages/domain/src/meters.generated.json")
FIRST_ROW, LAST_ROW, SLOTS = 18, 89, 8


def cell(ws, col, row):
    v = ws[f"{col}{row}"].value
    if v is None:
        return None
    v = str(v).strip()
    return None if v in ("", "-") else v


def main():
    ws = openpyxl.load_workbook(WORKBOOK, data_only=True)["MQTT Protocol"]
    meters, station, topic = [], None, None
    for row in range(FIRST_ROW, LAST_ROW + 1):
        if cell(ws, "B", row):
            station, topic = int(cell(ws, "B", row)), cell(ws, "C", row)
        slot_raw = cell(ws, "G", row)
        if station is None or slot_raw is None:
            continue
        slot = int(slot_raw)
        name = cell(ws, "F", row)
        standby = cell(ws, "E", row)
        meters.append({
            "meterId": f"s{station:02d}m{slot}",
            "station": station,
            "topic": topic,
            "slot": slot,
            "keyPrefix": f"M{slot}",
            "department": cell(ws, "D", row),
            "machineName": name,
            "standbyPowerKw": float(standby) if standby else None,
            "commissioned": name is not None,
        })

    if len(meters) != 9 * SLOTS:
        sys.exit(f"expected {9 * SLOTS} slots, got {len(meters)}")

    live = [m for m in meters if m["commissioned"]]
    doc = {
        "source": str(WORKBOOK),
        "sourceRevision": "Rev. 01, updated 22/9/2025",
        "fieldKeys": {
            "voltageL1": "M{slot}VL1", "voltageL2": "M{slot}VL2", "voltageL3": "M{slot}VL3",
            "currentL1": "M{slot}CL1", "currentL2": "M{slot}CL2", "currentL3": "M{slot}CL3",
            "activePower": "M{slot}P", "powerFactor": "M{slot}PF", "energy": "M{slot}E",
        },
        "slotsPerStation": SLOTS,
        "stationCount": 9,
        "commissionedCount": len(live),
        "departments": sorted({m["department"] for m in live}),
        "meters": meters,
    }
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n")
    print(f"{len(meters)} slots, {len(live)} commissioned, {len(doc['departments'])} departments -> {OUT}")


if __name__ == "__main__":
    main()
