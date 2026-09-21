import type {
  AirConditionerDetails,
  TestResults,
  IndoorUnitData,
  OutdoorUnitData,
  EMCDetails,
  EMCTestResult,
  DashboardMetrics,
  PowerMeterStatus,
  HistoricalDataPoint,
  PowerReading,
  TimeSeriesDataPoint,
  RealtimeSeriesResponse,
  UptimeMetrics,
  ComprehensiveMeterResponse
} from '@/types/models';

const API_BASE = '/api/v1';

export const ApiService = {
  /**
   * Health check endpoint
   */
  getHealthCheck: async () => {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }
    return response.json();
  },

  /**
   * Get suggestion for Calorie Meter Room
   */
  getCalorieMeterSuggestion: async (data: {
    air_conditioner_details: AirConditionerDetails;
    test_results: TestResults;
  }) => {
    const response = await fetch(`${API_BASE}/calorie-meter/suggestion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Calorie meter suggestion failed: ${response.status}`);
    }

    return response.json();
  },

  /**
   * Get EMC suggestion
   */
  getEMCSuggestion: async (data: {
    emc_details: EMCDetails;
    emc_test_result: EMCTestResult;
  }) => {
    const response = await fetch(`${API_BASE}/emc/suggestion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`EMC suggestion failed: ${response.status}`);
    }

    return response.json();
  },

  /**
   * Get indoor unit model data
   */
  getIndoorUnitModel: async (serial: string, item: string): Promise<IndoorUnitData> => {
    const response = await fetch(`${API_BASE}/function-test/indoor/model?serial=${encodeURIComponent(serial)}&item=${encodeURIComponent(item)}`);

    if (!response.ok) {
      throw new Error(`Get indoor unit model failed: ${response.status}`);
    }

    return response.json();
  },

  /**
   * Get outdoor unit model data
   */
  getOutdoorUnitModel: async (serial: string, item: string): Promise<OutdoorUnitData> => {
    const response = await fetch(`${API_BASE}/function-test/outdoor/model?serial=${encodeURIComponent(serial)}&item=${encodeURIComponent(item)}`);

    if (!response.ok) {
      throw new Error(`Get outdoor unit model failed: ${response.status}`);
    }

    return response.json();
  },

  /**
   * Get all indoor units
   */
  getAllIndoorUnits: async (): Promise<IndoorUnitData[]> => {
    const response = await fetch(`${API_BASE}/function-test/indoor/all`);

    if (!response.ok) {
      throw new Error(`Get all indoor units failed: ${response.status}`);
    }

    return response.json();
  },

  /**
   * Get all outdoor units
   */
  getAllOutdoorUnits: async (): Promise<OutdoorUnitData[]> => {
    const response = await fetch(`${API_BASE}/function-test/outdoor/all`);

    if (!response.ok) {
      throw new Error(`Get all outdoor units failed: ${response.status}`);
    }

    return response.json();
  },

  /**
   * Get indoor units by serial
   */
  getIndoorUnitsBySerial: async (serial: string): Promise<IndoorUnitData[]> => {
    const response = await fetch(`${API_BASE}/function-test/indoor/by-serial?serial=${encodeURIComponent(serial)}`);

    if (!response.ok) {
      throw new Error(`Get indoor units by serial failed: ${response.status}`);
    }

    return response.json();
  },

  /**
   * Get outdoor units by serial
   */
  getOutdoorUnitsBySerial: async (serial: string): Promise<OutdoorUnitData[]> => {
    const response = await fetch(`${API_BASE}/function-test/outdoor/by-serial?serial=${encodeURIComponent(serial)}`);

    if (!response.ok) {
      throw new Error(`Get outdoor units by serial failed: ${response.status}`);
    }

    return response.json();
  },

  /**
   * Get indoor units by date range
   */
  getIndoorUnitsByDateRange: async (startDate: string, endDate: string): Promise<IndoorUnitData[]> => {
    const response = await fetch(`${API_BASE}/function-test/indoor/by-date-range?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`);

    if (!response.ok) {
      throw new Error(`Get indoor units by date range failed: ${response.status}`);
    }

    return response.json();
  },

  /**
   * Get outdoor units by date range
   */
  getOutdoorUnitsByDateRange: async (startDate: string, endDate: string): Promise<OutdoorUnitData[]> => {
    const response = await fetch(`${API_BASE}/function-test/outdoor/by-date-range?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`);

    if (!response.ok) {
      throw new Error(`Get outdoor units by date range failed: ${response.status}`);
    }

    return response.json();
  },

  /**
   * Get dashboard metrics
   */
  getDashboardMetrics: async (): Promise<DashboardMetrics> => {
    const response = await fetch(`${API_BASE}/dashboard/metrics`);
    if (!response.ok) {
      throw new Error(`Get dashboard metrics failed: ${response.status}`);
    }
    return response.json();
  },

  /**
   * Get power meter statuses
   */
  getPowerMeterStatuses: async (): Promise<PowerMeterStatus[]> => {
    const response = await fetch(`${API_BASE}/power-meter/statuses`);
    if (!response.ok) {
      throw new Error(`Get power meter statuses failed: ${response.status}`);
    }
    const data = await response.json();
    // Validate data
    if (!Array.isArray(data) || !data.every(item =>
      typeof item.meterId === 'string' &&
      typeof item.modelName === 'string' &&
      ['active', 'offline', 'error'].includes(item.status) &&
      typeof item.currentPower === 'number' &&
      typeof item.lastUpdated === 'string'
    )) {
      throw new Error('Invalid data received from backend');
    }
    return data;
  },

  /**
   * Get historical data
   */
  getHistoricalData: async (startDate: string, endDate: string): Promise<HistoricalDataPoint[]> => {
    const response = await fetch(`${API_BASE}/power-meter/historical?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`);
    if (!response.ok) {
      throw new Error(`Get historical data failed: ${response.status}`);
    }
    const data = await response.json();
    // Validate data
    if (!Array.isArray(data) || !data.every(item =>
      typeof item.timestamp === 'string' &&
      typeof item.power_kw === 'number' &&
      typeof item.voltage_v === 'number' &&
      typeof item.current_a === 'number' &&
      typeof item.power_factor === 'number'
    )) {
      throw new Error('Invalid data received from backend');
    }
    return data.map(item => ({
      ...item,
      timestamp: new Date(item.timestamp)
    }));
  },

   /**
    * Get power meter readings
    */
   getPowerMeterReadings: async (): Promise<PowerReading[]> => {
     const response = await fetch(`${API_BASE}/power-meter/readings`);
     if (!response.ok) {
       throw new Error(`Get power meter readings failed: ${response.status}`);
     }
     const data = await response.json();
     // Validate data
     if (!Array.isArray(data) || !data.every(item =>
       typeof item.meterId === 'string' &&
       item.power && typeof item.power.total === 'number' &&
       item.timestamp
     )) {
       throw new Error('Invalid data received from backend');
     }
     // Transform timestamp strings to Date objects
     return data.map((reading: any) => ({
       ...reading,
       timestamp: new Date(reading.timestamp)
     }));
   },

   /**
    * Get real-time power series data
    */
   getRealtimeSeries: async (hours: number = 24, interval: string = '5m'): Promise<RealtimeSeriesResponse> => {
     const response = await fetch(`${API_BASE}/power-meter/realtime?hours=${hours}&interval=${interval}`);
     if (!response.ok) {
       throw new Error(`Get real-time series failed: ${response.status}`);
     }
     const data = await response.json();
     // Validate data
     if (!data.dataPoints || !Array.isArray(data.dataPoints) || !data.dataPoints.every((point: any) =>
       point.timestamp && point.power && typeof point.power.total === 'number'
     )) {
       throw new Error('Invalid data received from backend');
     }
     // Transform timestamp numbers to Date objects
     const dataPoints: TimeSeriesDataPoint[] = data.dataPoints.map((point: any) => ({
       timestamp: new Date(point.timestamp),
       power: point.power
     }));

     return {
       dataPoints,
       metersCount: data.metersCount,
       interval: data.interval
     };
   },

   /**
    * Get uptime metrics for a meter
    */
   getUptimeMetrics: async (meterId: string): Promise<UptimeMetrics> => {
     const response = await fetch(`${API_BASE}/power-meter/${encodeURIComponent(meterId)}/uptime`);
     if (!response.ok) {
       throw new Error(`Get uptime metrics failed: ${response.status}`);
     }
     const data = await response.json();
     // Validate data
     if (!data.isOnline === undefined || typeof data.lastSeen !== 'string' ||
         typeof data.currentSessionUptime !== 'number' || typeof data.dailyRuntime !== 'number') {
       throw new Error('Invalid data received from backend');
     }
     // Transform timestamp strings to Date objects
     return {
       ...data,
       lastSeen: new Date(data.lastSeen)
     };
   },

   /**
    * Get comprehensive meter response
    */
   getComprehensiveMeterData: async (meterId: string): Promise<ComprehensiveMeterResponse> => {
     const response = await fetch(`${API_BASE}/power-meter/${encodeURIComponent(meterId)}`);
     if (!response.ok) {
       throw new Error(`Get comprehensive meter data failed: ${response.status}`);
     }
     const data = await response.json();

     // Validate data
     if (!data.meter || !data.currentReading || !data.uptime || !data.energyEfficiency) {
       throw new Error('Invalid data received from backend');
     }

     // Transform timestamps and nested objects
     return {
       ...data,
       meter: {
         ...data.meter,
         installationDate: new Date(data.meter.installationDate)
       },
       currentReading: {
         ...data.currentReading,
         timestamp: new Date(data.currentReading.timestamp)
       },
       uptime: {
         ...data.uptime,
         lastSeen: new Date(data.uptime.lastSeen)
       },
       energyEfficiency: {
         ...data.energyEfficiency,
         peakUsage: {
           daily: {
             ...data.energyEfficiency.peakUsage.daily,
             timestamp: new Date(data.energyEfficiency.peakUsage.daily.timestamp)
           },
           weekly: {
             ...data.energyEfficiency.peakUsage.weekly,
             timestamp: new Date(data.energyEfficiency.peakUsage.weekly.timestamp)
           },
           monthly: {
             ...data.energyEfficiency.peakUsage.monthly,
             timestamp: new Date(data.energyEfficiency.peakUsage.monthly.timestamp)
           }
         }
       }
     };
   }
};
