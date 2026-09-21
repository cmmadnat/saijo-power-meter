import React, { useState, useEffect, useCallback, memo } from 'react';
import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Zap, RefreshCw, Clock, AlertCircle } from 'lucide-react';
import { ApiService } from '@/services/ApiService';
import type { TimeSeriesDataPoint } from '@/types/models';

interface RealTimeKWChartProps {
  height?: number;
  refreshInterval?: number; // in seconds, default 60
  title?: string;
  showControls?: boolean;
}

interface ChartState {
  data: TimeSeriesDataPoint[];
  loading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  metersCount: number;
  interval: string;
}

interface ChartDataPoint {
  timestamp: number;
  timestampFormatted: string;
  p1: number;
  p2: number;
  p3: number;
  total: number;
}

const RealTimeKWChart: React.FC<RealTimeKWChartProps> = ({
  height = 400,
  refreshInterval = 60,
  title = "Real-time Power Consumption (3-Phase)",
  showControls = true,
}) => {
  const [state, setState] = useState<ChartState>({
    data: [],
    loading: true,
    error: null,
    lastUpdate: null,
    metersCount: 0,
    interval: '5m',
  });

  const fetchRealtimeData = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));

      // Fetch 24 hours of data with 5-minute intervals
      const response = await ApiService.getRealtimeSeries(24, '5m');

      setState(prev => ({
        ...prev,
        data: response.dataPoints,
        loading: false,
        error: null,
        lastUpdate: new Date(),
        metersCount: response.metersCount,
        interval: response.interval,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch real-time data';
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage,
      }));
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    fetchRealtimeData();
  }, [fetchRealtimeData]);

  // Auto-refresh every specified interval
  useEffect(() => {
    const interval = setInterval(() => {
      if (!state.loading) {
        fetchRealtimeData();
      }
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [fetchRealtimeData, state.loading, refreshInterval]);

  const transformDataForChart = (data: TimeSeriesDataPoint[]): ChartDataPoint[] => {
    if (!data || data.length === 0) {
      return [];
    }

    return data
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      .filter((point) => point && point.power) // Filter out invalid points
      .map((point) => ({
        timestamp: point.timestamp.getTime(),
        timestampFormatted: new Date(point.timestamp).toLocaleTimeString(),
        p1: point.power.p1 / 1000, // Convert W to kW
        p2: point.power.p2 / 1000,
        p3: point.power.p3 / 1000,
        total: point.power.total / 1000,
      }));
  };

  const chartData = React.useMemo(() => transformDataForChart(state.data), [state.data]);

  interface TooltipProps {
    active?: boolean;
    payload?: Array<{
      payload: {
        timestamp: string;
        p1: number;
        p2: number;
        p3: number;
        total: number;
      };
    }>;
  }

  const CustomTooltip = useCallback<React.FC<TooltipProps>>(({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;

      return (
        <Card className="p-3 shadow-lg border">
          <div className="mb-2">
            <p className="font-semibold text-sm">{new Date(data.timestamp).toLocaleString()}</p>
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded"></div>
              <span>Total Power: <strong>{data.total.toFixed(2)} kW</strong></span>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div>Phase 1: {data.p1.toFixed(2)} kW</div>
              <div>Phase 2: {data.p2.toFixed(2)} kW</div>
              <div>Phase 3: {data.p3.toFixed(2)} kW</div>
            </div>
          </div>
        </Card>
      );
    }

    return null;
  }, []);

  const formatXAxisTick = (tickItem: number) => {
    return new Date(tickItem).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatYAxisTick = (value: number) => {
    return `${value.toFixed(1)}`;
  };

  const handleManualRefresh = () => {
    fetchRealtimeData();
  };

  if (state.loading && state.data.length === 0) {
    return (
      <Card className="flex items-center justify-center" style={{ height }}>
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading real-time data...</p>
        </div>
      </Card>
    );
  }

  if (state.error) {
    return (
      <Card className="flex items-center justify-center" style={{ height }}>
        <div className="text-center">
          <AlertCircle className="w-8 h-8 mx-auto mb-4 text-destructive" />
          <CardTitle className="mb-2">Chart Error</CardTitle>
          <p className="text-muted-foreground mb-4">{state.error}</p>
          <Button onClick={handleManualRefresh} variant="outline">
            Try Again
          </Button>
        </div>
      </Card>
    );
  }

  if (!state.data.length) {
    return (
      <Card className="flex items-center justify-center" style={{ height }}>
        <div className="text-center">
          <AlertCircle className="w-8 h-8 mx-auto mb-4 text-muted-foreground" />
          <CardTitle className="mb-2">No Data Available</CardTitle>
          <p className="text-muted-foreground mb-4">
            No real-time power readings found. Check that meters are connected and sending data.
          </p>
          <Button onClick={handleManualRefresh} variant="outline">
            Refresh
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="glass-effect overflow-hidden relative group">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity" />
      <CardHeader className="relative z-10">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            {title}
          </CardTitle>
          {showControls && (
            <div className="flex items-center gap-2">
              {state.lastUpdate && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Updated: {state.lastUpdate.toLocaleTimeString()}
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleManualRefresh}
                disabled={state.loading}
                className="flex items-center gap-1"
              >
                <RefreshCw className={`w-4 h-4 ${state.loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="relative z-10">
        <ResponsiveContainer width="100%" height={height}>
          <RechartsLineChart
            data={chartData}
            margin={{
              top: 5,
              right: 30,
              left: 20,
              bottom: 20,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatXAxisTick}
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
            />
            <YAxis
              tickFormatter={formatYAxisTick}
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              label={{ value: 'Power (kW)', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line
              type="monotone"
              dataKey="total"
              stroke="hsl(var(--primary))"
              strokeWidth={3}
              dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, stroke: 'hsl(var(--primary))', strokeWidth: 2 }}
              name="Total Power (kW)"
            />
            <Line
              type="monotone"
              dataKey="p1"
              stroke="#52c41a"
              strokeWidth={2}
              dot={false}
              strokeDasharray="5 5"
              name="Phase 1 (kW)"
            />
            <Line
              type="monotone"
              dataKey="p2"
              stroke="#fa8c16"
              strokeWidth={2}
              dot={false}
              strokeDasharray="5 5"
              name="Phase 2 (kW)"
            />
            <Line
              type="monotone"
              dataKey="p3"
              stroke="#eb2f96"
              strokeWidth={2}
              dot={false}
              strokeDasharray="5 5"
              name="Phase 3 (kW)"
            />
          </RechartsLineChart>
        </ResponsiveContainer>

        {chartData.length > 0 && (
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {chartData.length} points from {state.metersCount} meter{state.metersCount !== 1 ? 's' : ''}
            </span>
            <span>
              {new Date(chartData[0].timestamp).toLocaleTimeString()} - {new Date(chartData[chartData.length - 1].timestamp).toLocaleTimeString()} • {state.interval} • {refreshInterval}s refresh
            </span>
          </div>
        )}

        {/* Loading Overlay for Refresh */}
        {state.loading && state.data.length > 0 && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
            <RefreshCw className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default memo(RealTimeKWChart);