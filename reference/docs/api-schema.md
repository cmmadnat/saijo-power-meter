# API and Data Schema Definition

This document defines the API endpoints and data schemas for the Saijo Denki Smart Factory backend.

## 1. Calorie Meter Room

### 1.1. Data Schema

#### AirConditionerDetails

```json
{
  "model_name": "string",
  "serial_number": "string",
  "ac_type": "string", // Fix, Inverter
  "cooling_capacity_btu_h": "number",
  "efficiency": "number",
  "fin_type": "string",
  "fin_option": "string",
  "fin_count": "integer",
  "fin_material": "string",
  "refrigerant_pipe_material": "string",
  "refrigerant_pipe_size": "string",
  "evaporator_rows": "integer",
  "evaporator_cross_section_area": "number",
  "fan_motor_type": "string",
  "fan_rpm": "integer",
  "fan_cfm": "integer",
  "refrigerant_type": "string",
  "refrigerant_volume_g": "number",
  "captube_inner_diameter_mm": "number",
  "captube_length_inch": "number",
  "exv_size_mm": "number",
  "exv_position": "integer",
  "exv_model": "string",
  "txv_size_mm": "number",
  "txv_position": "integer",
  "compressor_type": "string", // Fix / Inverter
  "compressor_rpm": "integer",
  "compressor_model": "string",
  "condenser_fin_type": "string",
  "condenser_fin_count": "integer",
  "condenser_fin_material": "string",
  "condenser_refrigerant_pipe_material": "string",
  "condenser_refrigerant_pipe_size": "string",
  "condenser_rows": "integer",
  "condenser_cross_section_area": "number"
}
```

#### TestResults

```json
{
  "indoor_room_temp_dry_bulb_c": "number",
  "indoor_room_temp_wet_bulb_c": "number",
  "outdoor_room_temp_dry_bulb_c": "number",
  "outdoor_room_temp_wet_bulb_c": "number",
  "total_capacity_btu_h": "number",
  "sensible_heat_capacity_btu_h": "number",
  "latent_heat_capacity_btu_h": "number",
  "unit_power_input_w": "number",
  "unit_supply_voltage_v": "number",
  "unit_current_a": "number",
  "unit_power_factor": "number",
  "efficiency_eer": "number",
  "evaporator_inlet_temp_c": "number",
  "evaporator_outlet_temp_c": "number",
  "compressor_suction_temp_c": "number",
  "compressor_shell_temp_c": "number",
  "compressor_discharge_temp_c": "number",
  "condenser_mid_temp_c": "number",
  "condenser_outlet_temp_c": "number",
  "liquid_low_temp_c": "number",
  "compressor_suction_pressure_psi": "number",
  "compressor_discharge_pressure_psi": "number",
  "indoor_air_supply_temp_c": "number",
  "outdoor_air_supply_temp_c": "number"
}
```

### 1.2. API Endpoints

#### `POST /api/v1/calorie-meter/suggestion`

**Request Body:**

```json
{
  "air_conditioner_details": {
    // See AirConditionerDetails schema
  },
  "test_results": {
    // See TestResults schema
  }
}
```

**Response Body:**

```json
{
  "response_area": "string"
}
```

---

## 2. EMC

### 2.1. Data Schema

#### EMCDetails

```json
{
  "indoor_emi_filter": {
    "l1_uh": "number",
    "cx1_uf": "number",
    "cx2_uf": "number",
    "cy1_uf": "number",
    "cy2_uf": "number"
  },
  "outdoor_emi_filter": {
    "l1_uh": "number",
    "cx1_uf": "number",
    "cx2_uf": "number",
    "cy1_uf": "number",
    "cy2_uf": "number"
  },
  "ferrite_core_positions": [
    {
      "name": "string", // e.g., "Ferrite core 1"
      "material": "string",
      "diameter": "number",
      "thickness": "number",
      "length": "number",
      "number_of_turns": "integer"
    }
  ]
}
```

#### EMCTestResult

```json
{
  "test_standard": "string", // e.g., "EN 55014-1:2006 CONDUCTED EMISSION"
  "measuring_point": "string", // e.g., "Main port"
  "phase": "string", // e.g., "Neutral to Ground"
  "test_result_file": "string" // URL to the test result file
}
```

### 2.2. API Endpoints

#### `POST /api/v1/emc/suggestion`

**Request Body:**

```json
{
  "emc_details": {
    // See EMCDetails schema
  },
  "emc_test_result": {
    // See EMCTestResult schema
  }
}
```

**Response Body:**

```json
{
  "suggestion": "string"
}
```

---

## 3. Function Test

### 3.1. Data Schema

#### IndoorUnitData

```json
{
  "tester_no": "string",
  "serial_number": "string",
  "item": "string",
  "model": "string",
  "timestamp": "datetime",
  "voltage_l1_v": "number",
  "voltage_l2_v": "number",
  "voltage_l3_v": "number",
  "current_l1_a": "number",
  "current_l2_a": "number",
  "current_l3_a": "number",
  "power_kw": "number",
  "power_factor": "number",
  "error_code": "string",
  "room_temp_c": "number",
  "evap_inlet_temp_c": "number",
  "evap_outlet_temp_c": "number",
  "room_humidity_percent": "number",
  "pm25_ug_m3": "number",
  "co2_ppm": "integer",
  "wifi_status": "string" // Connected / Loss
}
```

#### OutdoorUnitData

```json
{
  "tester_no": "string",
  "serial_number": "string",
  "item": "string",
  "model": "string",
  "timestamp": "datetime",
  "voltage_l1_v": "number",
  "voltage_l2_v": "number",
  "voltage_l3_v": "number",
  "current_l1_a": "number",
  "current_l2_a": "number",
  "current_l3_a": "number",
  "power_kw": "number",
  "power_factor": "number",
  "error_code": "string",
  "pressure_1_psi": "number",
  "pressure_2_psi": "number",
  "temp_1_c": "number",
  "temp_2_c": "number",
  "temp_3_c": "number",
  "temp_4_c": "number",
  "operation_mode": "string",
  "running_percent": "number",
  "compressor_speed_rps": "number",
  "voltage_dc_v": "number",
  "discharge_temp_c": "number",
  "condenser_temp_c": "number",
  "suction_temp_c": "number",
  "ambient_temp_c": "number",
  "outdoor_fan_speed_rpm": "number",
  "fresh_air_supply_temp_c": "number",
  "fresh_air_supply_humidity_percent": "number",
  "ec_fan_speed_hz": "number",
  "fresh_air_evap_inlet_temp_c": "number"
}
```

### 3.2. API Endpoints

#### `GET /api/v1/function-test/indoor/model`
*   **Description:** Get indoor unit model by serial number and item.
*   **Query Parameters:** `serial`, `item`
*   **Response Body:** `IndoorUnitData`

#### `GET /api/v1/function-test/outdoor/model`
*   **Description:** Get outdoor unit model by serial number and item.
*   **Query Parameters:** `serial`, `item`
*   **Response Body:** `OutdoorUnitData`

#### `GET /api/v1/function-test/indoor/all`
*   **Description:** Get all indoor unit test data (for 10 testers).
*   **Response Body:** `[IndoorUnitData]`

#### `GET /api/v1/function-test/outdoor/all`
*   **Description:** Get all outdoor unit test data (for 20 testers).
*   **Response Body:** `[OutdoorUnitData]`

#### `GET /api/v1/function-test/indoor/by-serial`
*   **Description:** Get indoor unit test data by serial number.
*   **Query Parameters:** `serial`
*   **Response Body:** `[IndoorUnitData]`

#### `GET /api/v1/function-test/outdoor/by-serial`
*   **Description:** Get outdoor unit test data by serial number.
*   **Query Parameters:** `serial`
*   **Response Body:** `[OutdoorUnitData]`

#### `GET /api/v1/function-test/indoor/by-date-range`
*   **Description:** Get indoor unit test results by date range.
*   **Query Parameters:** `startDate`, `endDate`
*   **Response Body:** `[IndoorUnitData]`

#### `GET /api/v1/function-test/outdoor/by-date-range`
*   **Description:** Get outdoor unit test results by date range.
*   **Query Parameters:** `startDate`, `endDate`
*   **Response Body:** `[OutdoorUnitData]`

#### `POST /api/v1/function-test/indoor/std`
*   **Description:** Add indoor unit standard.
*   **Request Body:** `IndoorUnitStd` (schema to be defined based on `addIndoorStd` page)
*   **Response Body:** `{ "success": true }`

#### `GET /api/v1/function-test/indoor/std`
*   **Description:** Get indoor unit standard by item.
*   **Query Parameters:** `item`
*   **Response Body:** `IndoorUnitStd`

#### `PUT /api/v1/function-test/indoor/std`
*   **Description:** Update indoor unit standard.
*   **Request Body:** `IndoorUnitStd`
*   **Response Body:** `{ "success": true }`

#### `POST /api/v1/function-test/outdoor/std`
*   **Description:** Add outdoor unit standard.
*   **Request Body:** `OutdoorUnitStd` (schema to be defined based on `addOutdoorStd` page)
*   **Response Body:** `{ "success": true }`

#### `GET /api/v1/function-test/outdoor/std`
*   **Description:** Get outdoor unit standard by item.
*   **Query Parameters:** `item`
*   **Response Body:** `OutdoorUnitStd`

#### `PUT /api/v1/function-test/outdoor/std`
*   **Description:** Update outdoor unit standard.
*   **Request Body:** `OutdoorUnitStd`
*   **Response Body:** `{ "success": true }`

#### `GET /api/v1/function-test/indoor/result-and-std`
*   **Description:** Get indoor unit test result and standard.
*   **Query Parameters:** `testNo`
*   **Response Body:** `{ "result": IndoorUnitData, "standard": IndoorUnitStd }`

#### `GET /api/v1/function-test/outdoor/result-and-std`
*   **Description:** Get outdoor unit test result and standard.
*   **Query Parameters:** `testNo`
*   **Response Body:** `{ "result": OutdoorUnitData, "standard": OutdoorUnitStd }`

---

## 4. Power Meter

### 4.1. Data Schema

#### PowerMeterStatus

```json
{
  "meterId": "string",
  "modelName": "string",
  "status": "string", // "active" | "offline" | "error"
  "currentPower": "number",
  "lastUpdated": "string"
}
```

#### PowerReading

```json
{
  "meterId": "string",
  "timestamp": "string",
  "power": {
    "p1": "number",
    "p2": "number",
    "p3": "number",
    "total": "number"
  }
}
```

#### HistoricalDataPoint

```json
{
  "timestamp": "string",
  "power_kw": "number",
  "voltage_v": "number",
  "current_a": "number",
  "power_factor": "number"
}
```

#### RealtimeSeriesResponse

```json
{
  "dataPoints": [
    {
      "timestamp": "number",
      "power": {
        "p1": "number",
        "p2": "number",
        "p3": "number",
        "total": "number"
      }
    }
  ],
  "metersCount": "number",
  "interval": "string"
}
```

#### UptimeMetrics

```json
{
  "isOnline": "boolean",
  "lastSeen": "string",
  "currentSessionUptime": "number",
  "dailyRuntime": "number"
}
```

#### ComprehensiveMeterResponse

```json
{
  "meter": {
    "id": "string",
    "name": "string",
    "department": {
      "id": "string",
      "name": "string",
      "location": "string"
    },
    "location": "string",
    "installationDate": "string",
    "model": "string",
    "serialNumber": "string"
  },
  "currentReading": {
    "meterId": "string",
    "timestamp": "string",
    "power": {
      "p1": "number",
      "p2": "number",
      "p3": "number",
      "total": "number"
    },
    "voltage": {
      "p1": "number",
      "p2": "number",
      "p3": "number"
    },
    "amperage": {
      "p1": "number",
      "p2": "number",
      "p3": "number"
    },
    "powerFactor": {
      "p1": "number",
      "p2": "number",
      "p3": "number"
    }
  },
  "uptime": {
    "isOnline": "boolean",
    "lastSeen": "string",
    "currentSessionUptime": "number",
    "dailyRuntime": "number"
  },
  "performance": {
    "averagePowerFactor": "number",
    "maxPowerRecorded": "number",
    "efficiency": "number"
  },
  "powerQuality": {
    "phaseBalance": "number",
    "maxDeviation": "number",
    "totalHarmonicDistortion": "number"
  },
  "energyEfficiency": {
    "dailyConsumption": "number",
    "weeklyConsumption": "number",
    "monthlyConsumption": "number",
    "peakUsage": {
      "daily": {
        "value": "number",
        "timestamp": "string"
      },
      "weekly": {
        "value": "number",
        "timestamp": "string"
      },
      "monthly": {
        "value": "number",
        "timestamp": "string"
      }
    },
    "offPeakHours": "number",
    "peakHours": "number"
  }
}
```

### 4.2. API Endpoints

#### `GET /api/v1/dashboard/metrics`
*   **Description:** Get dashboard metrics for power meters.
*   **Response Body:** Dashboard metrics object from Firestore

#### `GET /api/v1/power-meter/statuses`
*   **Description:** Get all power meter statuses.
*   **Response Body:** `[PowerMeterStatus]`

#### `GET /api/v1/power-meter/readings`
*   **Description:** Get all power meter readings.
*   **Response Body:** `[PowerReading]`

#### `GET /api/v1/power-meter/realtime`
*   **Description:** Get real-time power series data.
*   **Query Parameters:** `hours` (default: 24), `interval` (default: "5m")
*   **Response Body:** `RealtimeSeriesResponse`

#### `GET /api/v1/power-meter/{meterId}/uptime`
*   **Description:** Get uptime metrics for a specific meter.
*   **Path Parameters:** `meterId`
*   **Response Body:** `UptimeMetrics`

#### `GET /api/v1/power-meter/{meterId}`
*   **Description:** Get comprehensive meter data.
*   **Path Parameters:** `meterId`
*   **Response Body:** `ComprehensiveMeterResponse`

#### `GET /api/v1/power-meter/historical`
*   **Description:** Get historical data for date range.
*   **Query Parameters:** `startDate`, `endDate`
*   **Response Body:** `[HistoricalDataPoint]`

**Note:** All power meter endpoints now fetch real data from Firestore instead of mock data, with validation to ensure data authenticity.