# Smart Factory API Documentation Mapping

**Generated**: August 31, 2025  
**Local Server**: `http://localhost:8080`  
**Deployed Server**: `https://smart-factory-2r3ykpdzlq-as.a.run.app`

## Overview

This document maps the Excel documentation specifications to the actual implemented API endpoints in the Smart Factory system. All endpoints have been verified as working on both local and deployed environments.

## 1. Health & Demo Endpoints

### Health Check
- **Excel Documentation**: Not explicitly documented in specifications
- **Implemented Endpoint**: `GET /api/v1/health`
- **Status**: ✅ Working (Local & Deployed)
- **Response**: `{"status":"UP"}`
- **Implementation**: `HealthCheckResource.java:10-18`

### Demo Status  
- **Excel Documentation**: Not explicitly documented in specifications
- **Implemented Endpoint**: `GET /api/v1/demo/status`
- **Status**: ✅ Working (Local & Deployed)
- **Response**: Shows Epic 2 completion status and available endpoints
- **Implementation**: `DemoResource.java:8-29`

### Epic 2 Summary
- **Excel Documentation**: Not explicitly documented in specifications  
- **Implemented Endpoint**: `GET /api/v1/demo/epic2-summary`
- **Status**: ✅ Working (Local & Deployed)
- **Response**: Detailed Epic 2 implementation summary
- **Implementation**: `DemoResource.java:31-47`

## 2. Function Test Module

**Excel Source**: `Smart factory/Function test/function test spec.xlsx`  
**Main Requirements**: `Smart Factory - Software Requirement R00.xlsx` FCT sheet

### Indoor Unit Endpoints

#### Get Indoor Model
- **Excel Documentation**: Sheet `getModel` → "getIndoorModel by serial & item"
- **Implemented Endpoint**: `GET /api/v1/function-test/indoor/model`
- **Parameters**: `?serial={serial}&item={item}`
- **Status**: ✅ Working (Local & Deployed)
- **Implementation**: `FunctionTestResource.java:28-51`
- **Excel Request Format**:
  ```json
  {
    "testerNo": "",
    "serial": "",
    "item": ""
  }
  ```
- **Excel Response Format**:
  ```json
  {
    "model": ""
  }
  ```

#### Get All Indoor Tests
- **Excel Documentation**: Sheet `getAllTest` → "getAllIndoorTest (10 tester No)"
- **Implemented Endpoint**: `GET /api/v1/function-test/indoor/all`
- **Status**: ✅ Working (Local & Deployed)
- **Implementation**: `FunctionTestResource.java:54-65`
- **Excel Response Format**: Array of objects with comprehensive indoor unit data including voltage, current, power, temperatures, etc.

#### Get Indoor Tests by Serial
- **Excel Documentation**: Sheet `getTest` → "getIndoorTestBySerial"
- **Implemented Endpoint**: `GET /api/v1/function-test/indoor/by-serial`
- **Parameters**: `?serial={serial}`
- **Status**: ✅ Working (Local & Deployed)
- **Implementation**: `FunctionTestResource.java:68-85`

#### Get Indoor Tests by Date Range
- **Excel Documentation**: Sheet `getAllTestResult` → "getIndoorTestResult by date range"
- **Implemented Endpoint**: `GET /api/v1/function-test/indoor/by-date-range`
- **Parameters**: `?startDate={startDate}&endDate={endDate}`
- **Status**: ✅ Working (Local & Deployed)
- **Implementation**: `FunctionTestResource.java:88-105`

### Outdoor Unit Endpoints

#### Get Outdoor Model
- **Excel Documentation**: Sheet `getModel` → "getOutdoorModel by serial & item"
- **Implemented Endpoint**: `GET /api/v1/function-test/outdoor/model`
- **Parameters**: `?serial={serial}&item={item}`
- **Status**: ✅ Working (Local & Deployed)
- **Implementation**: `FunctionTestResource.java:109-132`

#### Get All Outdoor Tests
- **Excel Documentation**: Sheet `getAllTest` → "getAllOutdoorTest (20 tester No)"
- **Implemented Endpoint**: `GET /api/v1/function-test/outdoor/all`
- **Status**: ✅ Working (Local & Deployed)
- **Implementation**: `FunctionTestResource.java:135-146`
- **Excel Response Format**: Array with comprehensive outdoor unit data including pressures, temperatures, fan speeds, etc.

#### Get Outdoor Tests by Serial
- **Excel Documentation**: Sheet `getTest` → "getOutdoorTestBySerial"
- **Implemented Endpoint**: `GET /api/v1/function-test/outdoor/by-serial`
- **Parameters**: `?serial={serial}`
- **Status**: ✅ Working (Local & Deployed)
- **Implementation**: `FunctionTestResource.java:149-166`

#### Get Outdoor Tests by Date Range
- **Excel Documentation**: Sheet `getAllTestResult` → "getOutdoorTestResult by date range"
- **Implemented Endpoint**: `GET /api/v1/function-test/outdoor/by-date-range`
- **Parameters**: `?startDate={startDate}&endDate={endDate}`
- **Status**: ✅ Working (Local & Deployed)
- **Implementation**: `FunctionTestResource.java:169-186`

### Standards Management Endpoints

#### Indoor Standards
- **Excel Documentation**: Sheet `standard` → Indoor standards CRUD operations
- **Implemented Endpoints**:
  - `POST /api/v1/function-test/indoor/std` - Add standard ✅
  - `GET /api/v1/function-test/indoor/std?item={item}` - Get standard ✅
  - `PUT /api/v1/function-test/indoor/std` - Update standard ✅
- **Implementation**: `FunctionTestResource.java:189-260`

#### Outdoor Standards  
- **Excel Documentation**: Sheet `standard` → Outdoor standards CRUD operations
- **Implemented Endpoints**:
  - `POST /api/v1/function-test/outdoor/std` - Add standard ✅
  - `GET /api/v1/function-test/outdoor/std?item={item}` - Get standard ✅
  - `PUT /api/v1/function-test/outdoor/std` - Update standard ✅
- **Implementation**: `FunctionTestResource.java:263-334`

### Combined Result and Standard Endpoints

#### Indoor Result and Standard
- **Excel Documentation**: Sheet `getTestResultAndStd` → "getIndoorTestResultAndStd"
- **Implemented Endpoint**: `GET /api/v1/function-test/indoor/result-and-std`
- **Parameters**: `?testNo={testNo}`
- **Status**: ✅ Working (Local & Deployed)
- **Implementation**: `FunctionTestResource.java:337-362`
- **Excel Response Format**: Combined object with test results and standards

#### Outdoor Result and Standard
- **Excel Documentation**: Sheet `getTestResultAndStd` → "getOutdoorTestResultAndStd"
- **Implemented Endpoint**: `GET /api/v1/function-test/outdoor/result-and-std`
- **Parameters**: `?testNo={testNo}`
- **Status**: ✅ Working (Local & Deployed)
- **Implementation**: `FunctionTestResource.java:365-389`

## 3. Calorie Meter Room Module

**Excel Source**: `Smart factory/Calorie Meter Room/Calorie Meter Room spec.xlsx`  
**Main Requirements**: `Smart Factory - Software Requirement R00.xlsx` Calorie Meter Room sheet

### Get Suggestion
- **Excel Documentation**: Sheet `getSuggestion` → AI optimization suggestions
- **Implemented Endpoint**: `POST /api/v1/calorie-meter/suggestion`
- **Status**: ✅ Working (Local & Deployed)
- **Implementation**: `CalorieMeterResource.java:15-112`
- **Excel Request Format**:
  ```json
  {
    "detail": {
      "model": "12",
      "serial": "20",
      "conditioner_type": "",
      "rate_capacity": "31",
      "rate_eer": "32",
      "evap_fin_pattern": "33",
      // ... more air conditioner details
    }
  }
  ```
- **Requirements**: AI Software for optimizing cooling capacity & energy efficiency
- **Purpose**: Recommend Flow Rate, CFM, RPM, Compressor Speed adjustments

## 4. EMC Module

**Excel Source**: `Smart factory/EMC/EMC spec.xlsx`  
**Main Requirements**: `Smart Factory - Software Requirement R00.xlsx` EMC sheet

### Get Suggestion
- **Excel Documentation**: Sheet `getSuggestion` → AI optimization for EMC compliance
- **Implemented Endpoint**: `POST /api/v1/emc/suggestion`  
- **Status**: ✅ Working (Local & Deployed)
- **Implementation**: `EMCResource.java:15-112`
- **Excel Request Format**:
  ```json
  {
    "indoor": {
      "indoor_cx1": "",
      "indoor_cx2": "",
      "indoor_l1": "",
      "indoor_cy1": "",
      "indoor_cy2": ""
    },
    "outdoor": {
      "outdoor_cx1": "",
      "outdoor_cx2": "",
      // ... more outdoor details
    }
  }
  ```
- **Requirements**: AI Software for optimizing Line Filter (Resistance, Inductance, Capacitor)
- **Standard**: EN 55014-1:2006 CONDUCTED EMISSION compliance

## Data Models Mapping

### Excel to Java Model Mapping

| Excel Field | Java Model Field | Model Class |
|-------------|------------------|-------------|
| `serialNumber` | `serialNumber` | `IndoorUnitData`/`OutdoorUnitData` |
| `voltageL1/L2/L3` | `voltageL1/L2/L3` | Both unit data classes |
| `currentL1/L2/L3` | `currentL1/L2/L3` | Both unit data classes |
| `power` | `powerKw` | Both unit data classes |
| `powerFactor` | `powerFactor` | Both unit data classes |
| `errorCode` | `errorCode` | Both unit data classes |
| `pressure1/2` | Refrigerant pressure fields | `OutdoorUnitData` |
| `temp1/2/3/4` | Various temperature fields | Both classes |
| `operationMode` | `operationMode` | Both classes |
| `runningPercent` | `runningPercent` | `OutdoorUnitData` |
| `compressorSpeed` | `compressorSpeed` | `OutdoorUnitData` |

## Implementation Status Summary

| Module | Excel Sheets | Implemented Endpoints | Status |
|--------|--------------|----------------------|---------|
| **Function Test** | 6 sheets | 16 endpoints | ✅ Complete |
| **Calorie Meter** | 1 sheet | 1 endpoint | ✅ Complete |  
| **EMC** | 1 sheet | 1 endpoint | ✅ Complete |
| **Health/Demo** | Not documented | 3 endpoints | ✅ Complete |
| **Power Meter** | Documented | ❌ Not implemented | 🔄 Pending |
| **Field/Reliability** | Documented | ❌ Not implemented | 🔄 Pending |

## Missing Implementations

### Power Meter Module
- **Excel Documentation**: Extensive documentation in main requirements file
- **Status**: ❌ Not implemented
- **Expected Endpoints**: Gateway and device management, voltage/current monitoring, energy reporting

### Field and Reliability Module  
- **Excel Documentation**: Documented for field testing and reliability analysis
- **Status**: ❌ Not implemented  
- **Expected Endpoints**: Real-time field data collection, AI analysis for durability testing

## Technical Notes

1. **Framework**: JAX-RS (Jakarta REST) with Quarkus
2. **Database**: Firestore (Google Cloud)
3. **Authentication**: Not implemented (open endpoints)
4. **CORS**: Enabled for development (`quarkus.http.cors=true`)
5. **API Documentation**: Swagger UI available at `/q/swagger-ui`
6. **OpenAPI Spec**: Available at `/q/openapi`

## Deployment Information

- **Cloud Platform**: Google Cloud Run
- **Region**: asia-southeast1  
- **Service**: smart-factory
- **Auto-scaling**: Enabled
- **Memory**: 1Gi
- **Timeout**: 300s
- **Port**: 8080

## Verification Commands

```bash
# Test health endpoint
curl https://smart-factory-2r3ykpdzlq-as.a.run.app/api/v1/health

# Test function test endpoints
curl "https://smart-factory-2r3ykpdzlq-as.a.run.app/api/v1/function-test/indoor/all"

# Test calorie meter suggestion
curl -X POST https://smart-factory-2r3ykpdzlq-as.a.run.app/api/v1/calorie-meter/suggestion \
  -H "Content-Type: application/json" \
  -d '{"airConditionerDetails":{},"testResults":{}}'

# Test EMC suggestion  
curl -X POST https://smart-factory-2r3ykpdzlq-as.a.run.app/api/v1/emc/suggestion \
  -H "Content-Type: application/json" \
  -d '{"emcDetails":{},"emcTestResult":{}}'
```

All endpoints return proper HTTP status codes and JSON responses. The implementation matches the Excel specifications with some field name adaptations for Java conventions.