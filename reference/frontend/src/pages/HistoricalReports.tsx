import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Download, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ApiService } from '@/services/ApiService';
import { toast } from 'sonner';

export default function HistoricalReports() {
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [shouldFetch, setShouldFetch] = useState(false);

  const { data: historicalData, isLoading, error } = useQuery({
    queryKey: ['historicalData', startDate, endDate],
    queryFn: () => ApiService.getHistoricalData(startDate, endDate),
    enabled: shouldFetch,
  });

  const handleGenerateReport = () => {
    if (!startDate || !endDate) {
      toast.error('Please select both start and end dates');
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      toast.error('End date must be after start date');
      return;
    }
    setShouldFetch(true);
    toast.success('Generating report...');
  };

  const handleExportCSV = () => {
    if (!historicalData || historicalData.length === 0) {
      toast.error('No data to export');
      return;
    }

    const headers = ['Timestamp', 'Power (kW)', 'Voltage (V)', 'Current (A)', 'Power Factor'];
    const rows = historicalData.map(d => [
      new Date(d.timestamp).toLocaleString(),
      d.power_kw.toFixed(2),
      d.voltage_v.toFixed(1),
      d.current_a.toFixed(2),
      d.power_factor.toFixed(3)
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `power-meter-report-${startDate}-to-${endDate}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Report exported successfully');
  };

  const chartData = historicalData?.map(d => ({
    time: new Date(d.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    power: Number(d.power_kw.toFixed(2)),
    voltage: Number(d.voltage_v.toFixed(1)),
  }));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-accent/10 to-transparent blur-3xl -z-10" />
        <h1 className="mb-2 bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">Historical Data & Reports</h1>
        <p className="text-muted-foreground">
          Analyze power consumption trends and generate detailed reports
        </p>
      </div>

      {/* Date Range Selection */}
      <Card className="glass-effect border-t-4 border-t-primary overflow-hidden relative group">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
        <CardHeader className="relative z-10">
          <CardTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Calendar className="w-5 h-5 text-primary" />
            </div>
            Report Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                max={new Date().toISOString().split('T')[0]}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <Button onClick={handleGenerateReport} className="w-full md:w-auto gradient-primary shadow-lg">
              <TrendingUp className="w-4 h-4 mr-2" />
              Generate Report
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Chart Display */}
      {isLoading && (
        <Card className="glass-effect">
          <CardContent className="h-96 flex items-center justify-center">
            <div className="text-muted-foreground animate-pulse">Loading data...</div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="glass-effect border-destructive/50">
          <CardContent className="h-96 flex flex-col items-center justify-center">
            <p className="text-destructive mb-4">Failed to load data. Please try again.</p>
            <Button variant="outline" onClick={handleGenerateReport}>Retry</Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && historicalData && historicalData.length === 0 && shouldFetch && (
        <Card className="glass-effect">
          <CardContent className="h-96 flex items-center justify-center">
            <p className="text-muted-foreground">No data available for selected range</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && chartData && chartData.length > 0 && (
        <>
          <Card className="glass-effect overflow-hidden relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-accent/5 to-transparent" />
            <CardHeader className="flex flex-row items-center justify-between relative z-10">
              <CardTitle className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10">
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
                Power Consumption Trends
              </CardTitle>
              <Button variant="outline" size="sm" onClick={handleExportCSV} className="hover:bg-accent/10">
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent className="relative z-10">
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={chartData}>
                  <defs>
                    <linearGradient id="powerGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.8} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id="voltageGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.8} />
                      <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis 
                    dataKey="time" 
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                  />
                  <YAxis 
                    yAxisId="left"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    label={{ value: 'Power (kW)', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    label={{ value: 'Voltage (V)', angle: 90, position: 'insideRight', fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                  <Line 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="power" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={3}
                    dot={false}
                    name="Power (kW)"
                  />
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="voltage" 
                    stroke="hsl(var(--accent))" 
                    strokeWidth={3}
                    dot={false}
                    name="Voltage (V)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Data Table */}
          <Card className="glass-effect overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-muted/20 to-transparent" />
            <CardHeader className="relative z-10">
              <CardTitle>Detailed Data</CardTitle>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead className="text-right">Power (kW)</TableHead>
                      <TableHead className="text-right">Voltage (V)</TableHead>
                      <TableHead className="text-right">Current (A)</TableHead>
                      <TableHead className="text-right">Power Factor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historicalData.map((row, idx) => (
                      <TableRow key={idx} className="hover:bg-accent/5 transition-colors">
                        <TableCell className="font-medium">
                          {new Date(row.timestamp).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">{row.power_kw.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{row.voltage_v.toFixed(1)}</TableCell>
                        <TableCell className="text-right">{row.current_a.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{row.power_factor.toFixed(3)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
