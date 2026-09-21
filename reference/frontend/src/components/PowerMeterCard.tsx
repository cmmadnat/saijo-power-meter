import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, AlertCircle, Power, Zap, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PowerReading, ElectricityRate } from '@/types/models';

// Utility functions for power calculations
const calculateTotalPower = (
  power: { p1: number; p2: number; p3: number },
  voltage: { p1: number; p2: number; p3: number },
  amperage: { p1: number; p2: number; p3: number },
  powerFactor: { p1: number; p2: number; p3: number }
): number => {
  // Calculate power for each phase: P = V * I * PF
  const p1 = voltage.p1 * amperage.p1 * powerFactor.p1;
  const p2 = voltage.p2 * amperage.p2 * powerFactor.p2;
  const p3 = voltage.p3 * amperage.p3 * powerFactor.p3;
  return p1 + p2 + p3;
};

const isDeviceOn = (totalPower: number): boolean => {
  return totalPower > 0.1; // Consider device on if power > 100W
};

const formatPowerInKW = (powerInWatts: number, decimals: number = 2): string => {
  return (powerInWatts / 1000).toFixed(decimals);
};

const calculateDailyEnergyConsumption = (totalPower: number): number => {
  // Estimate daily consumption based on current power (kWh)
  // This is a simple estimation - in reality would need time-series data
  return (totalPower / 1000) * 24; // Convert to kWh and multiply by 24 hours
};

const formatEnergyInKWh = (energy: number): string => {
  return `${energy.toFixed(2)} kWh`;
};

const calculateDailyCost = (reading: PowerReading, electricityRate?: number): number => {
  if (!electricityRate) return 0;
  const dailyEnergy = calculateDailyEnergyConsumption(calculateTotalPower(
    reading.power,
    reading.voltage,
    reading.amperage,
    reading.powerFactor
  ));
  return dailyEnergy * electricityRate;
};

const formatCostAsCurrency = (cost: number): string => {
  return `$${cost.toFixed(2)}`;
};

const isValidElectricityRate = (rate: number): boolean => {
  return rate > 0 && rate < 100; // Reasonable bounds for electricity rate
};

interface PowerMeterCardProps {
  reading: PowerReading;
  electricityRate?: number;
  showCost?: boolean;
  clickable?: boolean;
}

export function PowerMeterCard({
  reading,
  electricityRate,
  showCost = true,
  clickable = true
}: PowerMeterCardProps) {
  const navigate = useNavigate();

  // Handle missing reading data
  if (!reading || !reading.power || !reading.voltage || !reading.amperage || !reading.powerFactor) {
    return (
      <Card className="card-hover glass-effect border-t-4 border-t-muted overflow-hidden relative group">
        <div className="absolute inset-0 bg-gradient-to-br from-muted/5 via-transparent to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity" />
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="p-1.5 rounded-lg bg-muted/10 mb-2">
              <Power className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate total power and device status
  const totalPower = calculateTotalPower(
    reading.power,
    reading.voltage,
    reading.amperage,
    reading.powerFactor
  );
  const isOn = isDeviceOn(totalPower);

  // Calculate daily energy consumption
  const dailyEnergyKWh = calculateDailyEnergyConsumption(totalPower);
  const formattedEnergyKWh = formatEnergyInKWh(dailyEnergyKWh);

  // Format power values for display
  const formattedPower = formatPowerInKW(totalPower, 2);

  // Format timestamp for display
  const lastUpdate = reading.timestamp.toLocaleTimeString();

  // Calculate cost display
  const hasValidRate = electricityRate && isValidElectricityRate(electricityRate);
  const costDisplay = showCost && hasValidRate ? formatCostAsCurrency(calculateDailyCost(reading, electricityRate)) : null;

  // Handle card click navigation
  const handleCardClick = () => {
    if (clickable) {
      navigate(`/meters/${reading.meterId}`);
    }
  };

  const cardProps = {
    ...(clickable && {
      onClick: handleCardClick,
      style: { cursor: 'pointer' }
    }),
  };

  return (
    <Card
      className="card-hover glass-effect border-t-4 border-t-primary overflow-hidden relative group"
      {...cardProps}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity" />
      <CardHeader className="pb-3 relative z-10">
        <div className="flex items-start justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              {isOn ? (
                <Activity className="w-4 h-4 text-[hsl(var(--success))]" />
              ) : (
                <Power className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
            {reading.meterId}
          </CardTitle>
          <Badge className={cn(
            isOn ? 'bg-[hsl(var(--success))] text-white' : 'bg-muted text-muted-foreground',
            "shadow-lg"
          )}>
            {isOn ? 'On' : 'Off'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="relative z-10">
        <div className="p-4 rounded-lg bg-gradient-to-br from-muted/50 to-transparent mb-3">
          <p className="text-xs text-muted-foreground mb-1">Total Power Consumption</p>
          <p className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            {formattedPower} <span className="text-base font-normal">kW</span>
          </p>
        </div>

        {/* Phase Power Breakdown */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">P1</p>
            <p className="text-sm font-semibold">{formatPowerInKW(reading.power.p1, 1)} kW</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">P2</p>
            <p className="text-sm font-semibold">{formatPowerInKW(reading.power.p2, 1)} kW</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">P3</p>
            <p className="text-sm font-semibold">{formatPowerInKW(reading.power.p3, 1)} kW</p>
          </div>
        </div>

        {/* Energy Consumption Display */}
        <div className="flex items-center justify-center gap-2 mb-3 p-2 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
          <Zap className="w-4 h-4 text-blue-600" />
          <div className="text-center">
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">{formattedEnergyKWh}</p>
            <p className="text-xs text-muted-foreground">Est. Daily Consumption</p>
          </div>
        </div>

        {showCost && costDisplay && (
          <div className="flex items-center justify-center gap-2 mb-3 p-2 rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20">
            <DollarSign className="w-4 h-4 text-green-600" />
            <div className="text-center">
              <p className="text-sm font-semibold text-green-700 dark:text-green-300">{costDisplay}</p>
              <p className="text-xs text-muted-foreground">Est. Daily Cost</p>
            </div>
          </div>
        )}

        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            Last update: {lastUpdate}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
