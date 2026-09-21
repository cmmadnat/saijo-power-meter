import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiService } from './ApiService';

// Mock fetch globally
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('ApiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPowerMeterStatuses', () => {
    it('validates data structure and throws error for invalid data', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ invalidField: 'value' }]),
      });

      await expect(ApiService.getPowerMeterStatuses()).rejects.toThrow('Invalid data received from backend');
    });

    it('returns valid data', async () => {
      const mockData = [{
        meterId: 'M001',
        modelName: 'AC-2000',
        status: 'active',
        currentPower: 3.6,
        lastUpdated: '2023-01-01T00:00:00Z'
      }];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await ApiService.getPowerMeterStatuses();
      expect(result).toEqual(mockData);
    });
  });

  describe('getHistoricalData', () => {
    it('validates data structure and throws error for invalid data', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ invalidField: 'value' }]),
      });

      await expect(ApiService.getHistoricalData('2023-01-01', '2023-01-02')).rejects.toThrow('Invalid data received from backend');
    });

    it('returns valid data with parsed timestamps', async () => {
      const mockData = [{
        timestamp: '2023-01-01T00:00:00Z',
        power_kw: 3.0,
        voltage_v: 220,
        current_a: 5.0,
        power_factor: 0.9
      }];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await ApiService.getHistoricalData('2023-01-01', '2023-01-02');
      expect(result).toEqual([{
        ...mockData[0],
        timestamp: new Date('2023-01-01T00:00:00Z')
      }]);
    });
  });

  describe('getPowerMeterReadings', () => {
    it('validates data structure and throws error for invalid data', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ invalidField: 'value' }]),
      });

      await expect(ApiService.getPowerMeterReadings()).rejects.toThrow('Invalid data received from backend');
    });

    it('returns valid data with parsed timestamps', async () => {
      const mockData = [{
        meterId: 'M001',
        timestamp: '2023-01-01T00:00:00Z',
        power: { total: 3000 }
      }];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await ApiService.getPowerMeterReadings();
      expect(result).toEqual([{
        ...mockData[0],
        timestamp: new Date('2023-01-01T00:00:00Z')
      }]);
    });
  });

  describe('getRealtimeSeries', () => {
    it('validates data structure and throws error for invalid data', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ invalidField: 'value' }),
      });

      await expect(ApiService.getRealtimeSeries()).rejects.toThrow('Invalid data received from backend');
    });

    it('returns valid data with parsed timestamps', async () => {
      const mockResponse = {
        dataPoints: [{
          timestamp: 1640995200000, // 2022-01-01T00:00:00Z
          power: { p1: 1000, p2: 1000, p3: 1000, total: 3000 }
        }],
        metersCount: 3,
        interval: '5m'
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await ApiService.getRealtimeSeries();
      expect(result.dataPoints[0].timestamp).toEqual(new Date(1640995200000));
    });
  });

  describe('getUptimeMetrics', () => {
    it('validates data structure and throws error for invalid data', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ invalidField: 'value' }),
      });

      await expect(ApiService.getUptimeMetrics('M001')).rejects.toThrow('Invalid data received from backend');
    });

    it('returns valid data with parsed timestamps', async () => {
      const mockData = {
        isOnline: true,
        lastSeen: '2023-01-01T00:00:00Z',
        currentSessionUptime: 3600000,
        dailyRuntime: 86400000
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await ApiService.getUptimeMetrics('M001');
      expect(result.lastSeen).toEqual(new Date('2023-01-01T00:00:00Z'));
    });
  });

  describe('getComprehensiveMeterData', () => {
    it('validates data structure and throws error for invalid data', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ invalidField: 'value' }),
      });

      await expect(ApiService.getComprehensiveMeterData('M001')).rejects.toThrow('Invalid data received from backend');
    });

    it('returns valid data with parsed timestamps', async () => {
      const mockData = {
        meter: {
          id: 'M001',
          name: 'Meter M001',
          department: { id: 'dept1', name: 'Production', location: 'Factory' },
          location: 'Line A',
          installationDate: '2023-01-01T00:00:00Z',
          model: 'PM-2000',
          serialNumber: 'SNM001001'
        },
        currentReading: {
          meterId: 'M001',
          timestamp: '2023-01-01T00:00:00Z',
          power: { p1: 1000, p2: 1000, p3: 1000, total: 3000 },
          voltage: { p1: 220, p2: 220, p3: 220 },
          amperage: { p1: 5, p2: 5, p3: 5 },
          powerFactor: { p1: 0.9, p2: 0.9, p3: 0.9 }
        },
        uptime: {
          isOnline: true,
          lastSeen: '2023-01-01T00:00:00Z',
          currentSessionUptime: 3600000,
          dailyRuntime: 86400000
        },
        performance: {
          averagePowerFactor: 0.92,
          maxPowerRecorded: 5000,
          efficiency: 0.88
        },
        powerQuality: {
          phaseBalance: 95.2,
          maxDeviation: 4.8,
          totalHarmonicDistortion: 2.1
        },
        energyEfficiency: {
          dailyConsumption: 79.2,
          weeklyConsumption: 553.4,
          monthlyConsumption: 2377.0,
          peakUsage: {
            daily: { value: 4500, timestamp: '2023-01-01T00:00:00Z' },
            weekly: { value: 4800, timestamp: '2023-01-01T00:00:00Z' },
            monthly: { value: 4900, timestamp: '2023-01-01T00:00:00Z' }
          },
          offPeakHours: 12,
          peakHours: 8
        }
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await ApiService.getComprehensiveMeterData('M001');
      expect(result.meter.installationDate).toEqual(new Date('2023-01-01T00:00:00Z'));
      expect(result.currentReading.timestamp).toEqual(new Date('2023-01-01T00:00:00Z'));
      expect(result.uptime.lastSeen).toEqual(new Date('2023-01-01T00:00:00Z'));
      expect(result.energyEfficiency.peakUsage.daily.timestamp).toEqual(new Date('2023-01-01T00:00:00Z'));
    });
  });
});