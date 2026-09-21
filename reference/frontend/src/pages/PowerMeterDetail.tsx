import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Activity, Zap, TrendingUp, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PowerMeterCard } from '@/components/PowerMeterCard';
import { UptimeTracker } from '@/components/UptimeTracker';
import { ApiService } from '@/services/ApiService';
import { Skeleton } from '@/components/ui/skeleton';

export default function PowerMeterDetail() {
  const { meterId } = useParams<{ meterId: string }>();
  const navigate = useNavigate();

  const { data: meterData, isLoading } = useQuery({
    queryKey: ['comprehensiveMeterData', meterId],
    queryFn: () => meterId ? ApiService.getComprehensiveMeterData(meterId) : null,
    enabled: !!meterId,
  });

  const electricityRate = 0.12; // $0.12 per kWh

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-64" />
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-96" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </div>
    );
  }

  if (!meterData) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold mb-4">Meter Not Found</h2>
        <p className="text-muted-foreground mb-6">The requested power meter could not be found.</p>
        <Button onClick={() => navigate('/power-meters')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  // Ensure all required data is present
  if (!meterData.meter || !meterData.currentReading || !meterData.uptime ||
      !meterData.performance || !meterData.powerQuality || !meterData.energyEfficiency) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold mb-4">Incomplete Data</h2>
        <p className="text-muted-foreground mb-6">The meter data is incomplete or corrupted.</p>
        <Button onClick={() => navigate('/power-meters')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const { meter, currentReading, uptime, performance, powerQuality, energyEfficiency } = meterData;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/power-meters')}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            {meter.name} ({meter.id})
          </h1>
          <p className="text-muted-foreground">
            {meter.location} • {meter.department.name}
          </p>
        </div>
      </div>

      {/* Current Reading Card */}
      <PowerMeterCard
        reading={currentReading}
        electricityRate={electricityRate}
        showCost={true}
        clickable={false}
      />

      {/* Detailed Analytics Tabs */}
      <Tabs defaultValue="comprehensive" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="comprehensive">Comprehensive Analysis</TabsTrigger>
          <TabsTrigger value="historical">Historical Data</TabsTrigger>
        </TabsList>

        <TabsContent value="comprehensive" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Performance Metrics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  Performance Metrics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Average Power Factor</span>
                  <Badge variant="outline">{performance.averagePowerFactor.toFixed(3)}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Max Power Recorded</span>
                  <Badge variant="outline">{(performance.maxPowerRecorded / 1000).toFixed(1)} kW</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Efficiency</span>
                  <Badge variant="outline">{(performance.efficiency * 100).toFixed(1)}%</Badge>
                </div>
              </CardContent>
            </Card>

            {/* Power Quality */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" />
                  Power Quality
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Phase Balance</span>
                  <Badge variant="outline">{powerQuality.phaseBalance.toFixed(1)}%</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Max Deviation</span>
                  <Badge variant="outline">{powerQuality.maxDeviation.toFixed(1)}%</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">THD</span>
                  <Badge variant="outline">{powerQuality.totalHarmonicDistortion.toFixed(1)}%</Badge>
                </div>
              </CardContent>
            </Card>

            {/* Energy Efficiency */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary" />
                  Energy Efficiency
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Daily Consumption</span>
                  <Badge variant="outline">{energyEfficiency.dailyConsumption.toFixed(1)} kWh</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Weekly Consumption</span>
                  <Badge variant="outline">{energyEfficiency.weeklyConsumption.toFixed(1)} kWh</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Monthly Consumption</span>
                  <Badge variant="outline">{energyEfficiency.monthlyConsumption.toFixed(1)} kWh</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Peak Hours</span>
                  <Badge variant="outline">{energyEfficiency.peakHours}h</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Off-Peak Hours</span>
                  <Badge variant="outline">{energyEfficiency.offPeakHours}h</Badge>
                </div>
              </CardContent>
            </Card>

            {/* Peak Usage */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-primary" />
                  Peak Usage Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">Daily Peak</p>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Power</span>
                    <Badge variant="outline">{(energyEfficiency.peakUsage.daily.value / 1000).toFixed(1)} kW</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Time</span>
                    <Badge variant="outline">{energyEfficiency.peakUsage.daily.timestamp.toLocaleString()}</Badge>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Weekly Peak</p>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Power</span>
                    <Badge variant="outline">{(energyEfficiency.peakUsage.weekly.value / 1000).toFixed(1)} kW</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Time</span>
                    <Badge variant="outline">{energyEfficiency.peakUsage.weekly.timestamp.toLocaleString()}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Uptime Tracker */}
          <UptimeTracker meterId={meterId} />
        </TabsContent>

        <TabsContent value="historical">
          <Card>
            <CardHeader>
              <CardTitle>Historical Data</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Historical data visualization will be implemented in a future update.
                This will include time-series charts for power consumption, voltage, current, and power factor over selected time periods.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}