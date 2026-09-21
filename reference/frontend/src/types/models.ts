// TypeScript interfaces for API data models

export interface AirConditionerDetails {
  model_name: string;
  serial_number: string;
  ac_type: 'Fix' | 'Inverter';
  cooling_capacity_btu_h: number;
  efficiency: number;
  fin_type: string;
  fin_option: string;
  fin_count: number;
  fin_material: string;
  refrigerant_pipe_material: string;
  refrigerant_pipe_size: string;
  evaporator_rows: number;
  evaporator_cross_section_area: number;
  fan_motor_type: string;
  fan_rpm: number;
  fan_cfm: number;
  refrigerant_type: string;
  refrigerant_volume_g: number;
  captube_inner_diameter_mm: number;
  captube_length_inch: number;
  exv_size_mm: number;
  exv_position: number;
  exv_model: string;
  txv_size_mm: number;
  txv_position: number;
  compressor_type: 'Fix' | 'Inverter';
  compressor_rpm: number;
  compressor_model: string;
  condenser_fin_type: string;
  condenser_fin_count: number;
  condenser_fin_material: string;
  condenser_refrigerant_pipe_material: string;
  condenser_refrigerant_pipe_size: string;
  condenser_rows: number;
  condenser_cross_section_area: number;
}

export interface TestResults {
  indoor_room_temp_dry_bulb_c: number;
  indoor_room_temp_wet_bulb_c: number;
  outdoor_room_temp_dry_bulb_c: number;
  outdoor_room_temp_wet_bulb_c: number;
  total_capacity_btu_h: number;
  sensible_heat_capacity_btu_h: number;
  latent_heat_capacity_btu_h: number;
  unit_power_input_w: number;
  unit_supply_voltage_v: number;
  unit_current_a: number;
  unit_power_factor: number;
  efficiency_eer: number;
  evaporator_inlet_temp_c: number;
  evaporator_outlet_temp_c: number;
  compressor_suction_temp_c: number;
  compressor_shell_temp_c: number;
  compressor_discharge_temp_c: number;
  condenser_mid_temp_c: number;
  condenser_outlet_temp_c: number;
  liquid_low_temp_c: number;
  compressor_suction_pressure_psi: number;
  compressor_discharge_pressure_psi: number;
  indoor_air_supply_temp_c: number;
  outdoor_air_supply_temp_c: number;
}

export interface IndoorUnitData {
  tester_no: string;
  serial_number: string;
  item: string;
  model: string;
  timestamp: string;
  voltage_l1_v: number;
  voltage_l2_v: number;
  voltage_l3_v: number;
  current_l1_a: number;
  current_l2_a: number;
  current_l3_a: number;
  power_kw: number;
  power_factor: number;
  error_code: string;
  room_temp_c: number;
  evap_inlet_temp_c: number;
  evap_outlet_temp_c: number;
  room_humidity_percent: number;
  pm25_ug_m3: number;
  co2_ppm: number;
  wifi_status: 'Connected' | 'Loss';
}

export interface OutdoorUnitData {
  tester_no: string;
  serial_number: string;
  item: string;
  model: string;
  timestamp: string;
  voltage_l1_v: number;
  voltage_l2_v: number;
  voltage_l3_v: number;
  current_l1_a: number;
  current_l2_a: number;
  current_l3_a: number;
  power_kw: number;
  power_factor: number;
  error_code: string;
  pressure_1_psi: number;
  pressure_2_psi: number;
  temp_1_c: number;
  temp_2_c: number;
  temp_3_c: number;
  temp_4_c: number;
  operation_mode: string;
  running_percent: number;
  compressor_speed_rps: number;
  voltage_dc_v: number;
  discharge_temp_c: number;
  condenser_temp_c: number;
  suction_temp_c: number;
  ambient_temp_c: number;
  outdoor_fan_speed_rpm: number;
  fresh_air_supply_temp_c: number;
  fresh_air_supply_humidity_percent: number;
  ec_fan_speed_hz: number;
  fresh_air_evap_inlet_temp_c: number;
}

export interface EmiFilter {
  l1_uh: number;
  cx1_uf: number;
  cx2_uf: number;
  cy1_uf: number;
  cy2_uf: number;
}

export interface FerriteCorePosition {
  name: string;
  material: string;
  diameter: number;
  thickness: number;
  length: number;
  number_of_turns: number;
}

export interface EMCDetails {
  indoor_emi_filter: EmiFilter;
  outdoor_emi_filter: EmiFilter;
  ferrite_core_positions: FerriteCorePosition[];
}

export interface EMCTestResult {
  test_standard: string;
  measuring_point: string;
  phase: string;
  test_result_file: string;
}

export interface DashboardMetrics {
  activeMeters: number;
  totalPowerConsumption: number;
  averageEfficiency: number;
  alertCount: number;
}

export interface PowerMeterStatus {
  meterId: string;
  modelName: string;
  status: 'active' | 'offline' | 'error';
  currentPower: number;
  lastUpdated: string;
}

export interface HistoricalDataPoint {
  timestamp: string;
  power_kw: number;
  voltage_v: number;
  current_a: number;
  power_factor: number;
}

// Power Meter Module Types (enhanced from ref-frontend)
export interface PowerReading {
  meterId: string;
  timestamp: Date;
  power: {
    p1: number; // Phase 1 power in watts
    p2: number; // Phase 2 power in watts
    p3: number; // Phase 3 power in watts
    total: number; // Total power in watts
  };
  voltage: {
    p1: number; // Phase 1 voltage
    p2: number; // Phase 2 voltage
    p3: number; // Phase 3 voltage
  };
  amperage: {
    p1: number; // Phase 1 current
    p2: number; // Phase 2 current
    p3: number; // Phase 3 current
  };
  powerFactor: {
    p1: number; // Phase 1 power factor
    p2: number; // Phase 2 power factor
    p3: number; // Phase 3 power factor
  };
}

export interface TimeSeriesDataPoint {
  timestamp: Date;
  power: {
    p1: number;
    p2: number;
    p3: number;
    total: number;
  };
}

export interface UptimeMetrics {
  isOnline: boolean;
  lastSeen: Date;
  currentSessionUptime: number; // in milliseconds
  dailyRuntime: number; // in milliseconds
}

export interface ElectricityRate {
  rate: number; // Rate per kWh
  currency: string;
  effectiveFrom: Date;
  effectiveTo?: Date;
}

export interface Meter {
  id: string;
  name: string;
  department: Department;
  location: string;
  installationDate: Date;
  model: string;
  serialNumber: string;
}

export interface Department {
  id: string;
  name: string;
  location: string;
}

export interface ComprehensiveMeterResponse {
  meter: Meter;
  currentReading: PowerReading;
  uptime: UptimeMetrics;
  performance: {
    averagePowerFactor: number;
    maxPowerRecorded: number;
    efficiency: number;
  };
  powerQuality: {
    phaseBalance: number; // percentage
    maxDeviation: number; // percentage
    totalHarmonicDistortion: number; // percentage
  };
  energyEfficiency: {
    dailyConsumption: number; // kWh
    weeklyConsumption: number; // kWh
    monthlyConsumption: number; // kWh
    peakUsage: {
      daily: { value: number; timestamp: Date };
      weekly: { value: number; timestamp: Date };
      monthly: { value: number; timestamp: Date };
    };
    offPeakHours: number;
    peakHours: number;
  };
}

export interface RealtimeSeriesResponse {
  dataPoints: TimeSeriesDataPoint[];
  metersCount: number;
  interval: string;
}
