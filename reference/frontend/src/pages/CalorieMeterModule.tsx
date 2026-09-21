import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Calculator, Download, RotateCcw, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { ApiService } from '@/services/ApiService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';

interface ACDetails {
  model_name: string;
  serial_number: string;
  ac_type: string;
  cooling_capacity_btu_h: string;
  efficiency: string;
  compressor_type: string;
  compressor_rpm: string;
  refrigerant_type: string;
  refrigerant_volume_g: string;
}

interface TestResults {
  indoor_room_temp_dry_bulb_c: string;
  outdoor_room_temp_dry_bulb_c: string;
  indoor_room_temp_wet_bulb_c: string;
  outdoor_room_temp_wet_bulb_c: string;
  total_capacity_btu_h: string;
  sensible_heat_capacity_btu_h: string;
  latent_heat_capacity_btu_h: string;
  unit_power_input_w: string;
  efficiency_eer: string;
  evaporator_inlet_temp_c: string;
  evaporator_outlet_temp_c: string;
  compressor_suction_temp_c: string;
  compressor_discharge_temp_c: string;
  compressor_suction_pressure_psi: string;
  compressor_discharge_pressure_psi: string;
}

export default function CalorieMeterModule() {
  const { toast } = useToast();
  const [acDetails, setAcDetails] = useState<ACDetails>({
    model_name: '',
    serial_number: '',
    ac_type: 'Inverter',
    cooling_capacity_btu_h: '',
    efficiency: '',
    compressor_type: 'Inverter',
    compressor_rpm: '',
    refrigerant_type: 'R-410A',
    refrigerant_volume_g: ''
  });

  const [testResults, setTestResults] = useState<TestResults>({
    indoor_room_temp_dry_bulb_c: '',
    outdoor_room_temp_dry_bulb_c: '',
    indoor_room_temp_wet_bulb_c: '',
    outdoor_room_temp_wet_bulb_c: '',
    total_capacity_btu_h: '',
    sensible_heat_capacity_btu_h: '',
    latent_heat_capacity_btu_h: '',
    unit_power_input_w: '',
    efficiency_eer: '',
    evaporator_inlet_temp_c: '',
    evaporator_outlet_temp_c: '',
    compressor_suction_temp_c: '',
    compressor_discharge_temp_c: '',
    compressor_suction_pressure_psi: '',
    compressor_discharge_pressure_psi: ''
  });

  const [analysisResults, setAnalysisResults] = useState<string | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  const analysisMutation = useMutation({
    mutationFn: async () => {
      const requestData = {
        air_conditioner_details: {
          ...acDetails,
          cooling_capacity_btu_h: Number(acDetails.cooling_capacity_btu_h),
          efficiency: Number(acDetails.efficiency),
          compressor_rpm: Number(acDetails.compressor_rpm) || 3600,
          refrigerant_volume_g: Number(acDetails.refrigerant_volume_g) || 1200
        },
        test_results: {
          ...Object.fromEntries(
            Object.entries(testResults).map(([key, value]) => [key, Number(value) || 0])
          )
        }
      };

      return ApiService.getCalorieMeterSuggestion(requestData);
    },
    onSuccess: (data) => {
      setAnalysisResults(data.response_area);
      toast({
        title: "Analysis Complete",
        description: "HVAC system analysis has been completed successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Analysis Failed",
        description: `Failed to analyze HVAC system: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleACDetailsChange = (field: keyof ACDetails, value: string) => {
    setAcDetails(prev => ({ ...prev, [field]: value }));
  };

  const handleTestResultsChange = (field: keyof TestResults, value: string) => {
    setTestResults(prev => ({ ...prev, [field]: value }));
  };

  const handleAnalysis = () => {
    // Basic validation
    if (!acDetails.model_name || !acDetails.serial_number || !acDetails.cooling_capacity_btu_h || !acDetails.efficiency) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required AC details fields.",
        variant: "destructive",
      });
      return;
    }

    if (!testResults.indoor_room_temp_dry_bulb_c || !testResults.outdoor_room_temp_dry_bulb_c ||
        !testResults.total_capacity_btu_h || !testResults.unit_power_input_w) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required test measurement fields.",
        variant: "destructive",
      });
      return;
    }

    analysisMutation.mutate();
  };

  const handleClearAll = () => {
    setAcDetails({
      model_name: '',
      serial_number: '',
      ac_type: 'Inverter',
      cooling_capacity_btu_h: '',
      efficiency: '',
      compressor_type: 'Inverter',
      compressor_rpm: '',
      refrigerant_type: 'R-410A',
      refrigerant_volume_g: ''
    });
    setTestResults({
      indoor_room_temp_dry_bulb_c: '',
      outdoor_room_temp_dry_bulb_c: '',
      indoor_room_temp_wet_bulb_c: '',
      outdoor_room_temp_wet_bulb_c: '',
      total_capacity_btu_h: '',
      sensible_heat_capacity_btu_h: '',
      latent_heat_capacity_btu_h: '',
      unit_power_input_w: '',
      efficiency_eer: '',
      evaporator_inlet_temp_c: '',
      evaporator_outlet_temp_c: '',
      compressor_suction_temp_c: '',
      compressor_discharge_temp_c: '',
      compressor_suction_pressure_psi: '',
      compressor_discharge_pressure_psi: ''
    });
    setAnalysisResults(null);
    toast({
      title: "Form Cleared",
      description: "All form data has been cleared.",
    });
  };

  const handleLoadSampleData = () => {
    setAcDetails({
      model_name: "Sample AC Model XYZ-2000",
      serial_number: "SN123456789",
      ac_type: "Inverter",
      cooling_capacity_btu_h: "12000",
      efficiency: "3.5",
      compressor_type: "Inverter",
      compressor_rpm: "3600",
      refrigerant_type: "R-410A",
      refrigerant_volume_g: "1200"
    });

    setTestResults({
      indoor_room_temp_dry_bulb_c: "25.0",
      outdoor_room_temp_dry_bulb_c: "35.0",
      indoor_room_temp_wet_bulb_c: "18.0",
      outdoor_room_temp_wet_bulb_c: "24.0",
      total_capacity_btu_h: "11500",
      sensible_heat_capacity_btu_h: "8500",
      latent_heat_capacity_btu_h: "3000",
      unit_power_input_w: "3500",
      efficiency_eer: "3.29",
      evaporator_inlet_temp_c: "12.0",
      evaporator_outlet_temp_c: "8.0",
      compressor_suction_temp_c: "15.0",
      compressor_discharge_temp_c: "85.0",
      compressor_suction_pressure_psi: "120",
      compressor_discharge_pressure_psi: "350"
    });

    toast({
      title: "Sample Data Loaded",
      description: "Sample data has been loaded for testing.",
    });
  };

  const handleExport = () => {
    if (!analysisResults) return;

    const exportData = {
      timestamp: new Date().toISOString(),
      air_conditioner_details: acDetails,
      test_results: testResults,
      analysis_results: analysisResults
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hvac-analysis-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setExportDialogOpen(false);
    toast({
      title: "Export Complete",
      description: "Analysis results have been exported successfully.",
    });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-accent/10 to-transparent blur-3xl -z-10" />
        <h1 className="mb-2 bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
          Calorie Meter Room Analysis
        </h1>
        <p className="text-muted-foreground">
          Professional HVAC system analysis and performance evaluation
        </p>
      </div>

      {/* Action Buttons */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 justify-center">
            <Button
              onClick={handleAnalysis}
              disabled={analysisMutation.isPending}
              size="lg"
              className="min-w-[200px]"
            >
              {analysisMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Calculator className="w-4 h-4 mr-2" />
                  Analyze HVAC System
                </>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={handleClearAll}
              disabled={analysisMutation.isPending}
              size="lg"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Clear All
            </Button>

            <Button
              variant="ghost"
              onClick={handleLoadSampleData}
              disabled={analysisMutation.isPending}
              size="lg"
            >
              <FileText className="w-4 h-4 mr-2" />
              Load Sample Data
            </Button>

            {analysisResults && (
              <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="secondary" size="lg">
                    <Download className="w-4 h-4 mr-2" />
                    Export Results
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Export Analysis Results</DialogTitle>
                    <DialogDescription>
                      This will download a JSON file containing your complete HVAC analysis.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>Complete HVAC system parameters</li>
                      <li>Test measurement data</li>
                      <li>Professional analysis results</li>
                      <li>Timestamp and metadata</li>
                    </ul>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleExport}>
                      <Download className="w-4 h-4 mr-2" />
                      Download Report
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Air Conditioner Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="w-5 h-5" />
              Air Conditioner Details
            </CardTitle>
            <CardDescription>
              Enter the specifications of the air conditioning unit
            </CardDescription>
            <Badge variant="default">Required</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="model-name">Model Name *</Label>
                <Input
                  id="model-name"
                  value={acDetails.model_name}
                  onChange={(e) => handleACDetailsChange('model_name', e.target.value)}
                  placeholder="e.g., XYZ-2000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="serial-number">Serial Number *</Label>
                <Input
                  id="serial-number"
                  value={acDetails.serial_number}
                  onChange={(e) => handleACDetailsChange('serial_number', e.target.value)}
                  placeholder="e.g., SN123456789"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ac-type">AC Type</Label>
                <Select value={acDetails.ac_type} onValueChange={(value) => handleACDetailsChange('ac_type', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Inverter">Inverter</SelectItem>
                    <SelectItem value="Fixed Speed">Fixed Speed</SelectItem>
                    <SelectItem value="Variable Speed">Variable Speed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cooling-capacity">Cooling Capacity (BTU/h) *</Label>
                <Input
                  id="cooling-capacity"
                  type="number"
                  value={acDetails.cooling_capacity_btu_h}
                  onChange={(e) => handleACDetailsChange('cooling_capacity_btu_h', e.target.value)}
                  placeholder="12000"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="efficiency">Energy Efficiency Ratio (EER) *</Label>
                <Input
                  id="efficiency"
                  type="number"
                  step="0.1"
                  value={acDetails.efficiency}
                  onChange={(e) => handleACDetailsChange('efficiency', e.target.value)}
                  placeholder="3.5"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="compressor-type">Compressor Type</Label>
                <Select value={acDetails.compressor_type} onValueChange={(value) => handleACDetailsChange('compressor_type', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Inverter">Inverter</SelectItem>
                    <SelectItem value="Rotary">Rotary</SelectItem>
                    <SelectItem value="Scroll">Scroll</SelectItem>
                    <SelectItem value="Reciprocating">Reciprocating</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="compressor-rpm">Compressor RPM</Label>
                <Input
                  id="compressor-rpm"
                  type="number"
                  value={acDetails.compressor_rpm}
                  onChange={(e) => handleACDetailsChange('compressor_rpm', e.target.value)}
                  placeholder="3600"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="refrigerant-type">Refrigerant Type</Label>
                <Select value={acDetails.refrigerant_type} onValueChange={(value) => handleACDetailsChange('refrigerant_type', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="R-410A">R-410A</SelectItem>
                    <SelectItem value="R-32">R-32</SelectItem>
                    <SelectItem value="R-22">R-22</SelectItem>
                    <SelectItem value="R-134a">R-134a</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="refrigerant-volume">Refrigerant Volume (g)</Label>
              <Input
                id="refrigerant-volume"
                type="number"
                value={acDetails.refrigerant_volume_g}
                onChange={(e) => handleACDetailsChange('refrigerant_volume_g', e.target.value)}
                placeholder="1200"
              />
            </div>
          </CardContent>
        </Card>

        {/* Test Results */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Test Measurements
            </CardTitle>
            <CardDescription>
              Enter the measured test data from the calorimeter
            </CardDescription>
            <Badge variant="default">Required</Badge>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Temperature Measurements */}
            <div>
              <h4 className="text-sm font-medium mb-3">Temperature Measurements (°C)</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="indoor-dry-bulb">Indoor Dry Bulb Temp *</Label>
                  <Input
                    id="indoor-dry-bulb"
                    type="number"
                    step="0.1"
                    value={testResults.indoor_room_temp_dry_bulb_c}
                    onChange={(e) => handleTestResultsChange('indoor_room_temp_dry_bulb_c', e.target.value)}
                    placeholder="25.0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="outdoor-dry-bulb">Outdoor Dry Bulb Temp *</Label>
                  <Input
                    id="outdoor-dry-bulb"
                    type="number"
                    step="0.1"
                    value={testResults.outdoor_room_temp_dry_bulb_c}
                    onChange={(e) => handleTestResultsChange('outdoor_room_temp_dry_bulb_c', e.target.value)}
                    placeholder="35.0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="indoor-wet-bulb">Indoor Wet Bulb Temp</Label>
                  <Input
                    id="indoor-wet-bulb"
                    type="number"
                    step="0.1"
                    value={testResults.indoor_room_temp_wet_bulb_c}
                    onChange={(e) => handleTestResultsChange('indoor_room_temp_wet_bulb_c', e.target.value)}
                    placeholder="18.0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="outdoor-wet-bulb">Outdoor Wet Bulb Temp</Label>
                  <Input
                    id="outdoor-wet-bulb"
                    type="number"
                    step="0.1"
                    value={testResults.outdoor_room_temp_wet_bulb_c}
                    onChange={(e) => handleTestResultsChange('outdoor_room_temp_wet_bulb_c', e.target.value)}
                    placeholder="24.0"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Capacity & Power Measurements */}
            <div>
              <h4 className="text-sm font-medium mb-3">Capacity & Power Measurements</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="total-capacity">Total Capacity (BTU/h) *</Label>
                  <Input
                    id="total-capacity"
                    type="number"
                    value={testResults.total_capacity_btu_h}
                    onChange={(e) => handleTestResultsChange('total_capacity_btu_h', e.target.value)}
                    placeholder="11500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="power-input">Unit Power Input (W) *</Label>
                  <Input
                    id="power-input"
                    type="number"
                    value={testResults.unit_power_input_w}
                    onChange={(e) => handleTestResultsChange('unit_power_input_w', e.target.value)}
                    placeholder="3500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sensible-heat">Sensible Heat Capacity (BTU/h)</Label>
                  <Input
                    id="sensible-heat"
                    type="number"
                    value={testResults.sensible_heat_capacity_btu_h}
                    onChange={(e) => handleTestResultsChange('sensible_heat_capacity_btu_h', e.target.value)}
                    placeholder="8500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="latent-heat">Latent Heat Capacity (BTU/h)</Label>
                  <Input
                    id="latent-heat"
                    type="number"
                    value={testResults.latent_heat_capacity_btu_h}
                    onChange={(e) => handleTestResultsChange('latent_heat_capacity_btu_h', e.target.value)}
                    placeholder="3000"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* System Parameters */}
            <div>
              <h4 className="text-sm font-medium mb-3">System Parameters</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="evap-inlet">Evaporator Inlet Temp (°C)</Label>
                  <Input
                    id="evap-inlet"
                    type="number"
                    step="0.1"
                    value={testResults.evaporator_inlet_temp_c}
                    onChange={(e) => handleTestResultsChange('evaporator_inlet_temp_c', e.target.value)}
                    placeholder="12.0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="evap-outlet">Evaporator Outlet Temp (°C)</Label>
                  <Input
                    id="evap-outlet"
                    type="number"
                    step="0.1"
                    value={testResults.evaporator_outlet_temp_c}
                    onChange={(e) => handleTestResultsChange('evaporator_outlet_temp_c', e.target.value)}
                    placeholder="8.0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="suction-pressure">Compressor Suction Pressure (PSI)</Label>
                  <Input
                    id="suction-pressure"
                    type="number"
                    value={testResults.compressor_suction_pressure_psi}
                    onChange={(e) => handleTestResultsChange('compressor_suction_pressure_psi', e.target.value)}
                    placeholder="120"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="discharge-pressure">Compressor Discharge Pressure (PSI)</Label>
                  <Input
                    id="discharge-pressure"
                    type="number"
                    value={testResults.compressor_discharge_pressure_psi}
                    onChange={(e) => handleTestResultsChange('compressor_discharge_pressure_psi', e.target.value)}
                    placeholder="350"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Analysis Results */}
      {analysisResults && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Professional HVAC Analysis Results
            </CardTitle>
            <CardDescription>
              Comprehensive analysis and recommendations for your HVAC system
            </CardDescription>
            <Badge variant="secondary">
              Analyzed {new Date().toLocaleTimeString()}
            </Badge>
          </CardHeader>
          <CardContent>
            <Textarea
              value={analysisResults}
              readOnly
              className="min-h-[300px] font-mono text-sm leading-relaxed bg-muted"
            />
            <div className="mt-4 text-sm text-muted-foreground">
              <p>• Analysis completed on {new Date().toLocaleString()}</p>
              <p>• Input validation passed • Professional assessment generated</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}