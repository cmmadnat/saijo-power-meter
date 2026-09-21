import { PendingScreen } from "@/components/pending-screen";

export default function HistoryPage() {
  return (
    <PendingScreen
      source="Specification page 4 · History"
      title="History"
      step="Step 5"
      summary="Total energy and running hours per meter over a chosen period, filtered by department."
      contents={[
        {
          heading: "Filters",
          items: [
            "Department (แผนก)",
            "Start date and time",
            "End date and time",
            "All boundaries in Asia/Bangkok",
          ],
        },
        {
          heading: "Table",
          items: [
            "Meter no, department, machine no, machine name",
            "Total energy (kWh) over the period",
            "Running hours (Hr:min), counted above the 0.1 kW standby level",
          ],
        },
      ]}
    />
  );
}
