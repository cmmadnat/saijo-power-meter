import { useQuery } from '@tanstack/react-query';
import { Activity, Zap, TrendingUp, Bell } from 'lucide-react';
import { DashboardSummaryCard } from '@/components/DashboardSummaryCard';
import { PowerMeterCard } from '@/components/PowerMeterCard';
import RealTimeKWChart from '@/components/RealTimeKWChart';
import { UptimeTracker } from '@/components/UptimeTracker';
import { ApiService } from '@/services/ApiService';
import { Skeleton } from '@/components/ui/skeleton';

export default function PowerMeterDashboard() {
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['dashboardMetrics'],
    queryFn: ApiService.getDashboardMetrics,
  });

  const { data: meterReadings, isLoading: metersLoading } = useQuery({
    queryKey: ['powerMeterReadings'],
    queryFn: ApiService.getPowerMeterReadings,
  });

  // Mock electricity rate for demonstration
  const electricityRate = 0.12; // $0.12 per kWh

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-accent/10 to-transparent blur-3xl -z-10" />
        <h1 className="mb-2 bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
          Power Meter Dashboard
        </h1>
        <p className="text-muted-foreground">
          Real-time monitoring and analytics of power consumption systems
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardSummaryCard
          title="Active Meters"
          value={metrics?.activeMeters ?? 0}
          icon={<Activity className="w-6 h-6" />}
          loading={metricsLoading}
          variant="primary"
        />
        <DashboardSummaryCard
          title="Total Power Consumption"
          value={`${metrics?.totalPowerConsumption.toFixed(1) ?? 0} kW`}
          icon={<Zap className="w-6 h-6" />}
          loading={metricsLoading}
          variant="accent"
        />
        <DashboardSummaryCard
          title="Average Efficiency"
          value={metrics?.averageEfficiency.toFixed(2) ?? 0}
          icon={<TrendingUp className="w-6 h-6" />}
          loading={metricsLoading}
          variant="success"
        />
        <DashboardSummaryCard
          title="Active Alerts"
          value={metrics?.alertCount ?? 0}
          icon={<Bell className="w-6 h-6" />}
          loading={metricsLoading}
          variant="warning"
        />
      </div>

      {/* Real-time Power Chart */}
      <RealTimeKWChart
        height={400}
        refreshInterval={60}
        title="Real-time Power Consumption (3-Phase)"
        showControls={true}
      />

      {/* Uptime Tracker */}
      <UptimeTracker />

      {/* Power Meter Cards */}
      <div>
        <h2 className="mb-4">Power Meters</h2>
        {metersLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {meterReadings?.map(reading => (
              <PowerMeterCard
                key={reading.meterId}
                reading={reading}
                electricityRate={electricityRate}
                showCost={true}
                clickable={true}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}