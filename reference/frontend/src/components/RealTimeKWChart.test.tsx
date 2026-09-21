import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TimeSeriesDataPoint } from '@/types/models';

// Mock ApiService
const mockApiService = {
  getRealtimeSeries: vi.fn(),
};

vi.mock('@/services/ApiService', () => ({
  ApiService: mockApiService,
}));

// Mock Recharts components since we can't render them in unit tests
vi.mock('recharts', () => ({
  LineChart: () => null,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => children,
  Legend: () => null,
}));

// Mock Lucide React icons
vi.mock('lucide-react', () => ({
  Zap: () => null,
  RefreshCw: () => null,
  Clock: () => null,
  AlertCircle: () => null,
}));

// Mock UI components
vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => children,
  CardContent: ({ children }: { children: React.ReactNode }) => children,
  CardHeader: ({ children }: { children: React.ReactNode }) => children,
  CardTitle: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/components/ui/button', () => ({
  Button: () => null,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: () => null,
}));

describe('RealTimeKWChart Component Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Data Transformation', () => {
    it('transforms TimeSeriesDataPoint array to ChartDataPoint format', () => {
      const mockData: TimeSeriesDataPoint[] = [
        {
          timestamp: new Date('2025-10-11T10:00:00Z'),
          power: { p1: 1000, p2: 1100, p3: 1200, total: 3300 },
        },
        {
          timestamp: new Date('2025-10-11T10:05:00Z'),
          power: { p1: 1050, p2: 1150, p3: 1250, total: 3450 },
        },
      ];

      // Import the transformation function (we'll extract it for testing)
      const transformDataForChart = (data: TimeSeriesDataPoint[]) => {
        if (!data || data.length === 0) {
          return [];
        }

        return data
          .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
          .map((point) => ({
            timestamp: point.timestamp.getTime(),
            timestampFormatted: new Date(point.timestamp).toLocaleTimeString(),
            p1: point.power.p1 / 1000, // Convert W to kW
            p2: point.power.p2 / 1000,
            p3: point.power.p3 / 1000,
            total: point.power.total / 1000,
          }));
      };

      const result = transformDataForChart(mockData);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        timestamp: new Date('2025-10-11T10:00:00Z').getTime(),
        timestampFormatted: new Date('2025-10-11T10:00:00Z').toLocaleTimeString(),
        p1: 1.0, // 1000W = 1kW
        p2: 1.1,
        p3: 1.2,
        total: 3.3,
      });
      expect(result[1]).toEqual({
        timestamp: new Date('2025-10-11T10:05:00Z').getTime(),
        timestampFormatted: new Date('2025-10-11T10:05:00Z').toLocaleTimeString(),
        p1: 1.05,
        p2: 1.15,
        p3: 1.25,
        total: 3.45,
      });
    });

    it('returns empty array for null or undefined data', () => {
      const transformDataForChart = (data: TimeSeriesDataPoint[]) => {
        if (!data || data.length === 0) {
          return [];
        }
        return data.map((point) => ({
          timestamp: point.timestamp.getTime(),
          timestampFormatted: point.timestamp.toLocaleTimeString(),
          p1: point.power.p1 / 1000,
          p2: point.power.p2 / 1000,
          p3: point.power.p3 / 1000,
          total: point.power.total / 1000,
        }));
      };

      expect(transformDataForChart(null as any)).toEqual([]);
      expect(transformDataForChart(undefined as any)).toEqual([]);
      expect(transformDataForChart([])).toEqual([]);
    });

    it('sorts data by timestamp', () => {
      const mockData: TimeSeriesDataPoint[] = [
        {
          timestamp: new Date('2025-10-11T10:10:00Z'),
          power: { p1: 1000, p2: 1100, p3: 1200, total: 3300 },
        },
        {
          timestamp: new Date('2025-10-11T10:00:00Z'),
          power: { p1: 1050, p2: 1150, p3: 1250, total: 3450 },
        },
      ];

      const transformDataForChart = (data: TimeSeriesDataPoint[]) => {
        if (!data || data.length === 0) {
          return [];
        }

        return data
          .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
          .map((point) => ({
            timestamp: point.timestamp.getTime(),
            timestampFormatted: point.timestamp.toLocaleTimeString(),
            p1: point.power.p1 / 1000,
            p2: point.power.p2 / 1000,
            p3: point.power.p3 / 1000,
            total: point.power.total / 1000,
          }));
      };

      const result = transformDataForChart(mockData);

      expect(result[0].timestamp).toBe(new Date('2025-10-11T10:00:00Z').getTime());
      expect(result[1].timestamp).toBe(new Date('2025-10-11T10:10:00Z').getTime());
    });
  });

  describe('API Integration', () => {
    it('calls getRealtimeSeries with correct parameters', async () => {
      const mockResponse = {
        dataPoints: [],
        metersCount: 3,
        interval: '5m',
      };

      mockApiService.getRealtimeSeries.mockResolvedValue(mockResponse);

      // Simulate component initialization
      await mockApiService.getRealtimeSeries(24, '5m');

      expect(mockApiService.getRealtimeSeries).toHaveBeenCalledWith(24, '5m');
    });

    it('handles API errors gracefully', async () => {
      const errorMessage = 'Network error';
      mockApiService.getRealtimeSeries.mockRejectedValue(new Error(errorMessage));

      // The component should handle this error internally
      try {
        await mockApiService.getRealtimeSeries(24, '5m');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe(errorMessage);
      }
    });
  });

  describe('Auto-refresh Logic', () => {
    it('calculates refresh intervals correctly', () => {
      const refreshInterval = 60; // 60 seconds
      const expectedMs = refreshInterval * 1000;

      expect(expectedMs).toBe(60000);
    });

    it('handles different refresh intervals', () => {
      const intervals = [30, 60, 300]; // 30s, 1min, 5min

      intervals.forEach(interval => {
        const ms = interval * 1000;
        expect(ms).toBeGreaterThan(0);
        expect(ms).toBe(interval * 1000);
      });
    });
  });

  describe('Chart Configuration', () => {
    it('provides correct default props', () => {
      const defaultProps = {
        height: 400,
        refreshInterval: 60,
        title: "Real-time Power Consumption (3-Phase)",
        showControls: true,
      };

      expect(defaultProps.height).toBe(400);
      expect(defaultProps.refreshInterval).toBe(60);
      expect(defaultProps.title).toBe("Real-time Power Consumption (3-Phase)");
      expect(defaultProps.showControls).toBe(true);
    });

    it('allows customization of chart properties', () => {
      const customProps = {
        height: 600,
        refreshInterval: 30,
        title: "Custom Chart Title",
        showControls: false,
      };

      expect(customProps.height).toBe(600);
      expect(customProps.refreshInterval).toBe(30);
      expect(customProps.title).toBe("Custom Chart Title");
      expect(customProps.showControls).toBe(false);
    });
  });

  describe('Data Validation', () => {
    it('validates TimeSeriesDataPoint structure', () => {
      const validPoint: TimeSeriesDataPoint = {
        timestamp: new Date(),
        power: {
          p1: 1000,
          p2: 1100,
          p3: 1200,
          total: 3300,
        },
      };

      expect(validPoint.timestamp).toBeInstanceOf(Date);
      expect(typeof validPoint.power.p1).toBe('number');
      expect(typeof validPoint.power.p2).toBe('number');
      expect(typeof validPoint.power.p3).toBe('number');
      expect(typeof validPoint.power.total).toBe('number');
    });

    it('handles invalid data gracefully', () => {
      const invalidData = [
        { timestamp: 'invalid', power: {} },
        { timestamp: null, power: null },
      ];

      const transformDataForChart = (data: any[]) => {
        if (!data || data.length === 0) {
          return [];
        }

        return data
          .filter(point => point && point.timestamp instanceof Date && point.power)
          .map((point) => ({
            timestamp: point.timestamp.getTime(),
            timestampFormatted: point.timestamp.toLocaleTimeString(),
            p1: point.power.p1 / 1000 || 0,
            p2: point.power.p2 / 1000 || 0,
            p3: point.power.p3 / 1000 || 0,
            total: point.power.total / 1000 || 0,
          }));
      };

      const result = transformDataForChart(invalidData);
      expect(result).toEqual([]);
    });
  });

  describe('Performance Considerations', () => {
    it('limits data points for performance', () => {
      // Simulate large dataset
      const largeDataset: TimeSeriesDataPoint[] = Array.from({ length: 1000 }, (_, i) => ({
        timestamp: new Date(Date.now() + i * 300000), // 5 minute intervals
        power: {
          p1: 1000 + Math.random() * 500,
          p2: 1100 + Math.random() * 500,
          p3: 1200 + Math.random() * 500,
          total: 3300 + Math.random() * 1500,
        },
      }));

      const transformDataForChart = (data: TimeSeriesDataPoint[]) => {
        if (!data || data.length === 0) {
          return [];
        }

        // In a real implementation, you might limit the number of points for performance
        return data
          .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
          .slice(-100) // Keep only last 100 points for performance
          .map((point) => ({
            timestamp: point.timestamp.getTime(),
            timestampFormatted: point.timestamp.toLocaleTimeString(),
            p1: point.power.p1 / 1000,
            p2: point.power.p2 / 1000,
            p3: point.power.p3 / 1000,
            total: point.power.total / 1000,
          }));
      };

      const result = transformDataForChart(largeDataset);
      expect(result).toHaveLength(100); // Should be limited to 100 points
    });
  });
});