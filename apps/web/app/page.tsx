import { PendingScreen } from "@/components/pending-screen";

export default function RealTimePage() {
  return (
    <PendingScreen
      source="Specification page 1–3 · Real time"
      title="Real time"
      step="Steps 3 & 4"
      summary="Live readings for every commissioned meter, with power and energy plotted over time."
      contents={[
        {
          heading: "Table — specification page 1",
          items: [
            "Meter no, department (แผนก), machine no, machine name",
            "Voltage L1 / L2 / L3",
            "Current L1 / L2 / L3",
            "Power factor, Active power (kW), Energy (kWh)",
            "Department filter, sorting, offline indicator",
          ],
        },
        {
          heading: "Charts — specification pages 2 & 3",
          items: [
            "Active power (kW) over time, one series per selected meter",
            "Energy (kWh) over time, same selector",
            "Multi-meter selector and time-window control",
          ],
        },
      ]}
    />
  );
}
