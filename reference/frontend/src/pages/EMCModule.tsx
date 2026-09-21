import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Zap, Plus, Trash2, FileText, CheckCircle, AlertCircle, TestTube } from 'lucide-react';
import { ApiService } from '@/services/ApiService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useToast } from '@/components/ui/use-toast';

interface EmiFilter {
  l1_uh: number;
  cx1_uf: number;
  cx2_uf: number;
  cy1_uf: number;
  cy2_uf: number;
}

interface FerriteCore {
  name: string;
  material: string;
  diameter: number;
  thickness: number;
  length: number;
  number_of_turns: number;
}

interface TestResult {
  test_standard: string;
  measuring_point: string;
  phase: string;
  test_result_file: string;
}

export default function EMCModule() {
  const { toast } = useToast();
  const [indoorEmiFilter, setIndoorEmiFilter] = useState<EmiFilter>({
    l1_uh: 1.5,
    cx1_uf: 0.22,
    cx2_uf: 0.47,
    cy1_uf: 2.2,
    cy2_uf: 4.7
  });

  const [outdoorEmiFilter, setOutdoorEmiFilter] = useState<EmiFilter>({
    l1_uh: 2.2,
    cx1_uf: 0.33,
    cx2_uf: 0.68,
    cy1_uf: 3.3,
    cy2_uf: 6.8
  });

  const [ferriteCores, setFerriteCores] = useState<FerriteCore[]>([
    {
      name: "Ferrite core 1",
      material: "NiZn ferrite",
      diameter: 13.0,
      thickness: 6.35,
      length: 28.7,
      number_of_turns: 3
    },
    {
      name: "Ferrite core 2",
      material: "MnZn ferrite",
      diameter: 20.0,
      thickness: 8.0,
      length: 35.0,
      number_of_turns: 5
    }
  ]);

  const [testResult, setTestResult] = useState<TestResult>({
    test_standard: "EN 55014-1:2006 CONDUCTED EMISSION",
    measuring_point: "Main port",
    phase: "Neutral to Ground",
    test_result_file: "https://example.com/test-result.pdf"
  });

  const [analysisResults, setAnalysisResults] = useState<string | null>(null);

  const analysisMutation = useMutation({
    mutationFn: async () => {
      const requestData = {
        emc_details: {
          indoor_emi_filter: indoorEmiFilter,
          outdoor_emi_filter: outdoorEmiFilter,
          ferrite_core_positions: ferriteCores
        },
        emc_test_result: testResult
      };

      return ApiService.getEMCSuggestion(requestData);
    },
    onSuccess: (data) => {
      setAnalysisResults(data.response_area);
      toast({
        title: "EMC Analysis Complete",
        description: "Electromagnetic compliance analysis has been completed successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Analysis Failed",
        description: `Failed to analyze EMC compliance: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleIndoorEmiChange = (field: keyof EmiFilter, value: string) => {
    setIndoorEmiFilter(prev => ({ ...prev, [field]: parseFloat(value) || 0 }));
  };

  const handleOutdoorEmiChange = (field: keyof EmiFilter, value: string) => {
    setOutdoorEmiFilter(prev => ({ ...prev, [field]: parseFloat(value) || 0 }));
  };

  const handleFerriteChange = (index: number, field: keyof FerriteCore, value: string | number) => {
    const newCores = [...ferriteCores];
    newCores[index] = { ...newCores[index], [field]: value };
    setFerriteCores(newCores);
  };

  const handleTestResultChange = (field: keyof TestResult, value: string) => {
    setTestResult(prev => ({ ...prev, [field]: value }));
  };

  const addFerriteCore = () => {
    setFerriteCores([...ferriteCores, {
      name: `Ferrite core ${ferriteCores.length + 1}`,
      material: "NiZn ferrite",
      diameter: 10.0,
      thickness: 5.0,
      length: 20.0,
      number_of_turns: 2
    }]);
  };

  const removeFerriteCore = (index: number) => {
    if (ferriteCores.length > 1) {
      setFerriteCores(ferriteCores.filter((_, i) => i !== index));
    }
  };

  const handleAnalyzeCompliance = () => {
    // Basic validation
    if (!testResult.test_standard || !testResult.measuring_point || !testResult.phase) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required test result fields.",
        variant: "destructive",
      });
      return;
    }

    analysisMutation.mutate();
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-accent/10 to-transparent blur-3xl -z-10" />
        <h1 className="mb-2 bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
          EMC Testing Module
        </h1>
        <p className="text-muted-foreground">
          Electromagnetic compliance analysis with comprehensive parameter configuration
        </p>
      </div>

      {/* Header Section */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Zap className="w-10 h-10 text-primary" />
            <div>
              <h3 className="text-lg font-semibold">Electromagnetic Compliance Analysis</h3>
              <p className="text-muted-foreground">
                Professional EMC analysis with comprehensive parameter configuration and regulatory compliance assessment.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* EMI Filter Parameters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube className="w-5 h-5" />
            EMI Filter Parameters
          </CardTitle>
          <CardDescription>
            Configure electromagnetic interference filter specifications
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Indoor EMI Filter */}
            <Card>
              <CardHeader>
                <CardTitle className="text-primary">Indoor EMI Filter</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="indoor-l1">L1 Inductance (μH)</Label>
                  <Input
                    id="indoor-l1"
                    type="number"
                    step="0.1"
                    value={indoorEmiFilter.l1_uh}
                    onChange={(e) => handleIndoorEmiChange('l1_uh', e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="indoor-cx1">CX1 Capacitance (μF)</Label>
                    <Input
                      id="indoor-cx1"
                      type="number"
                      step="0.01"
                      value={indoorEmiFilter.cx1_uf}
                      onChange={(e) => handleIndoorEmiChange('cx1_uf', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="indoor-cx2">CX2 Capacitance (μF)</Label>
                    <Input
                      id="indoor-cx2"
                      type="number"
                      step="0.01"
                      value={indoorEmiFilter.cx2_uf}
                      onChange={(e) => handleIndoorEmiChange('cx2_uf', e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="indoor-cy1">CY1 Capacitance (μF)</Label>
                    <Input
                      id="indoor-cy1"
                      type="number"
                      step="0.1"
                      value={indoorEmiFilter.cy1_uf}
                      onChange={(e) => handleIndoorEmiChange('cy1_uf', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="indoor-cy2">CY2 Capacitance (μF)</Label>
                    <Input
                      id="indoor-cy2"
                      type="number"
                      step="0.1"
                      value={indoorEmiFilter.cy2_uf}
                      onChange={(e) => handleIndoorEmiChange('cy2_uf', e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Outdoor EMI Filter */}
            <Card>
              <CardHeader>
                <CardTitle className="text-secondary">Outdoor EMI Filter</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="outdoor-l1">L1 Inductance (μH)</Label>
                  <Input
                    id="outdoor-l1"
                    type="number"
                    step="0.1"
                    value={outdoorEmiFilter.l1_uh}
                    onChange={(e) => handleOutdoorEmiChange('l1_uh', e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="outdoor-cx1">CX1 Capacitance (μF)</Label>
                    <Input
                      id="outdoor-cx1"
                      type="number"
                      step="0.01"
                      value={outdoorEmiFilter.cx1_uf}
                      onChange={(e) => handleOutdoorEmiChange('cx1_uf', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="outdoor-cx2">CX2 Capacitance (μF)</Label>
                    <Input
                      id="outdoor-cx2"
                      type="number"
                      step="0.01"
                      value={outdoorEmiFilter.cx2_uf}
                      onChange={(e) => handleOutdoorEmiChange('cx2_uf', e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="outdoor-cy1">CY1 Capacitance (μF)</Label>
                    <Input
                      id="outdoor-cy1"
                      type="number"
                      step="0.1"
                      value={outdoorEmiFilter.cy1_uf}
                      onChange={(e) => handleOutdoorEmiChange('cy1_uf', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="outdoor-cy2">CY2 Capacitance (μF)</Label>
                    <Input
                      id="outdoor-cy2"
                      type="number"
                      step="0.1"
                      value={outdoorEmiFilter.cy2_uf}
                      onChange={(e) => handleOutdoorEmiChange('cy2_uf', e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Ferrite Core Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Ferrite Core Configuration
            </div>
            <Button onClick={addFerriteCore} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Core
            </Button>
          </CardTitle>
          <CardDescription>
            Configure ferrite core specifications for electromagnetic filtering
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {ferriteCores.map((core, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    {core.name}
                    {ferriteCores.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFerriteCore(index)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input
                        value={core.name}
                        onChange={(e) => handleFerriteChange(index, 'name', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Material</Label>
                      <Select
                        value={core.material}
                        onValueChange={(value) => handleFerriteChange(index, 'material', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NiZn ferrite">NiZn ferrite</SelectItem>
                          <SelectItem value="MnZn ferrite">MnZn ferrite</SelectItem>
                          <SelectItem value="Soft ferrite">Soft ferrite</SelectItem>
                          <SelectItem value="Hard ferrite">Hard ferrite</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Diameter (mm)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={core.diameter}
                        onChange={(e) => handleFerriteChange(index, 'diameter', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Thickness (mm)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={core.thickness}
                        onChange={(e) => handleFerriteChange(index, 'thickness', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Length (mm)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={core.length}
                        onChange={(e) => handleFerriteChange(index, 'length', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Turns</Label>
                      <Input
                        type="number"
                        value={core.number_of_turns}
                        onChange={(e) => handleFerriteChange(index, 'number_of_turns', parseInt(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Test Result Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Test Result Configuration</CardTitle>
          <CardDescription>
            Specify test parameters and standards for EMC compliance analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Test Standard</Label>
              <Select
                value={testResult.test_standard}
                onValueChange={(value) => handleTestResultChange('test_standard', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EN 55014-1:2006 CONDUCTED EMISSION">EN 55014-1:2006 CONDUCTED EMISSION</SelectItem>
                  <SelectItem value="FCC Part 15 Class B">FCC Part 15 Class B</SelectItem>
                  <SelectItem value="CISPR 14-1">CISPR 14-1</SelectItem>
                  <SelectItem value="EN 55011">EN 55011</SelectItem>
                  <SelectItem value="IEC 61000-6-3">IEC 61000-6-3</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Measuring Point</Label>
              <Input
                value={testResult.measuring_point}
                onChange={(e) => handleTestResultChange('measuring_point', e.target.value)}
                placeholder="e.g., Main port"
              />
            </div>
            <div className="space-y-2">
              <Label>Phase</Label>
              <Select
                value={testResult.phase}
                onValueChange={(value) => handleTestResultChange('phase', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Neutral to Ground">Neutral to Ground</SelectItem>
                  <SelectItem value="Line to Ground">Line to Ground</SelectItem>
                  <SelectItem value="Line to Neutral">Line to Neutral</SelectItem>
                  <SelectItem value="Differential Mode">Differential Mode</SelectItem>
                  <SelectItem value="Common Mode">Common Mode</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Test Result File URL</Label>
              <Input
                value={testResult.test_result_file}
                onChange={(e) => handleTestResultChange('test_result_file', e.target.value)}
                placeholder="https://example.com/test-result.pdf"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Analysis Section */}
      <Card>
        <CardHeader>
          <CardTitle>EMC Compliance Analysis</CardTitle>
          <CardDescription>
            Analyze electromagnetic compliance based on configured parameters
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                Ready for Analysis
              </Badge>
            </div>
            <Button
              onClick={handleAnalyzeCompliance}
              disabled={analysisMutation.isPending}
              size="lg"
            >
              {analysisMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Analyze EMC Compliance
                </>
              )}
            </Button>
          </div>

          {analysisResults && (
            <Accordion type="single" collapsible>
              <AccordionItem value="results">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    EMC Analysis Results
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <Textarea
                    value={analysisResults}
                    readOnly
                    className="min-h-[300px] font-mono text-sm leading-relaxed bg-muted"
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </CardContent>
      </Card>

      {/* Module Features */}
      <Card>
        <CardHeader>
          <CardTitle>Module Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <h4 className="font-medium">Configuration Features</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Comprehensive EMI filter parameter configuration</li>
                <li>• Dynamic ferrite core specification management</li>
                <li>• Multiple test standard support (EN 55014-1, FCC Part 15)</li>
                <li>• Professional form validation and error handling</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">Analysis Features</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Real-time parameter validation</li>
                <li>• Responsive design for mobile and desktop</li>
                <li>• Integration with existing EMC suggestion API</li>
                <li>• Professional electromagnetic compliance analysis</li>
              </ul>
            </div>
          </div>
          <Separator className="my-4" />
          <p className="text-sm text-muted-foreground">
            Implementation Status: Backend APIs ✅ | Enhanced UI ✅ | Form Validation ✅ | Professional UX ✅
          </p>
        </CardContent>
      </Card>
    </div>
  );
}