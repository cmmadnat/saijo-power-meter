### 4. Data Models

#### 4.1. AirConditionerDetails

**Purpose:** This model stores the detailed specifications of an air conditioner unit being tested in the Calorie Meter Room.

**TypeScript Interface:**

```typescript
interface AirConditionerDetails {
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
```

**Relationships:**

* This model is used in conjunction with the `TestResults` model for the Calorie Meter Room suggestion API.

#### 4.2. TestResults

**Purpose:** This model stores the results of a test performed in the Calorie Meter Room.

**TypeScript Interface:**

```typescript
interface TestResults {
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
```

**Relationships:**

* This model is used in conjunction with the `AirConditionerDetails` model for the Calorie Meter Room suggestion API.

#### 4.3. EMCDetails

**Purpose:** This model stores the details of the EMC (Electromagnetic Compatibility) configuration for a tested unit.

**TypeScript Interface:**

```typescript
interface EmiFilter {
  l1_uh: number;
  cx1_uf: number;
  cx2_uf: number;
  cy1_uf: number;
  cy2_uf: number;
}

interface FerriteCorePosition {
  name: string;
  material: string;
  diameter: number;
  thickness: number;
  length: number;
  number_of_turns: number;
}

interface EMCDetails {
  indoor_emi_filter: EmiFilter;
  outdoor_emi_filter: EmiFilter;
  ferrite_core_positions: FerriteCorePosition[];
}
```

**Relationships:**

* This model is used in conjunction with the `EMCTestResult` model for the EMC suggestion API.

#### 4.4. EMCTestResult

**Purpose:** This model stores the results of an EMC (Electromagnetic Compatibility) test.

**TypeScript Interface:**

```typescript
interface EMCTestResult {
  test_standard: string;
  measuring_point: string;
  phase: string;
  test_result_file: string; // URL to the test result file
}
```

**Relationships:**

* This model is used in conjunction with the `EMCDetails` model for the EMC suggestion API.

#### 4.5. IndoorUnitData

**Purpose:** This model stores the test data collected from an indoor unit in the Function Test module.

**TypeScript Interface:**

```typescript
interface IndoorUnitData {
  tester_no: string;
  serial_number: string;
  item: string;
  model: string;
  timestamp: string; // ISO 8601 format
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
```

**Relationships:**

* This model is used for various API endpoints in the Function Test module. It can be associated with an `IndoorUnitStd` model for comparison.

#### 4.6. OutdoorUnitData

**Purpose:** This model stores the test data collected from an outdoor unit in the Function Test module.

**TypeScript Interface:**

```typescript
interface OutdoorUnitData {
  tester_no: string;
  serial_number: string;
  item: string;
  model: string;
  timestamp: string; // ISO 8601 format
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
```

**Relationships:**

* This model is used for various API endpoints in the Function Test module. It can be associated with an `OutdoorUnitStd` model for comparison.
