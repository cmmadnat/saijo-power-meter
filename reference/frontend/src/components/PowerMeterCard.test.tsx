import { describe, it, expect } from 'vitest';
import type { PowerReading } from '@/types/models';

// Import utility functions from PowerMeterCard (we'll need to extract them for testing)
const calculateTotalPower = (
  power: { p1: number; p2: number; p3: number },
  voltage: { p1: number; p2: number; p3: number },
  amperage: { p1: number; p2: number; p3: number },
  powerFactor: { p1: number; p2: number; p3: number }
): number => {
  // Calculate power for each phase: P = V * I * PF
  const p1 = voltage.p1 * amperage.p1 * powerFactor.p1;
  const p2 = voltage.p2 * amperage.p2 * powerFactor.p2;
  const p3 = voltage.p3 * amperage.p3 * powerFactor.p3;
  return p1 + p2 + p3;
};

const isDeviceOn = (totalPower: number): boolean => {
  return totalPower > 0.1; // Consider device on if power > 100W
};

const formatPowerInKW = (powerInWatts: number, decimals: number = 2): string => {
  return (powerInWatts / 1000).toFixed(decimals);
};

const calculateDailyEnergyConsumption = (totalPower: number): number => {
  // Estimate daily consumption based on current power (kWh)
  // This is a simple estimation - in reality would need time-series data
  return (totalPower / 1000) * 24; // Convert to kWh and multiply by 24 hours
};

const formatEnergyInKWh = (energy: number): string => {
  return `${energy.toFixed(2)} kWh`;
};

const calculateDailyCost = (reading: PowerReading, electricityRate?: number): number => {
  if (!electricityRate) return 0;
  const dailyEnergy = calculateDailyEnergyConsumption(calculateTotalPower(
    reading.power,
    reading.voltage,
    reading.amperage,
    reading.powerFactor
  ));
  return dailyEnergy * electricityRate;
};

const formatCostAsCurrency = (cost: number): string => {
  return `$${cost.toFixed(2)}`;
};

const isValidElectricityRate = (rate: number): boolean => {
  return rate > 0 && rate < 100; // Reasonable bounds for electricity rate
};

describe('PowerMeterCard Utility Functions', () => {
  const mockReading: PowerReading = {
    meterId: 'M001',
    timestamp: new Date('2025-10-11T11:30:00Z'),
    power: {
      p1: 1200,
      p2: 1100,
      p3: 1300,
      total: 3600,
    },
    voltage: {
      p1: 220,
      p2: 218,
      p3: 222,
    },
    amperage: {
      p1: 5.5,
      p2: 5.0,
      p3: 5.9,
    },
    powerFactor: {
      p1: 0.95,
      p2: 0.92,
      p3: 0.94,
    },
  };

  describe('calculateTotalPower', () => {
    it('calculates total power correctly using P = V * I * PF formula', () => {
      const result = calculateTotalPower(
        mockReading.power,
        mockReading.voltage,
        mockReading.amperage,
        mockReading.powerFactor
      );

      // Expected: (220*5.5*0.95) + (218*5.0*0.92) + (222*5.9*0.94)
      // = 1149.25 + 1003.2 + 1231.252 = 3383.702
      expect(result).toBeCloseTo(3383.70, 2);
    });

    it('returns 0 for all zero values', () => {
      const zeroReading = {
        power: { p1: 0, p2: 0, p3: 0 },
        voltage: { p1: 0, p2: 0, p3: 0 },
        amperage: { p1: 0, p2: 0, p3: 0 },
        powerFactor: { p1: 0, p2: 0, p3: 0 },
      };

      const result = calculateTotalPower(
        zeroReading.power,
        zeroReading.voltage,
        zeroReading.amperage,
        zeroReading.powerFactor
      );

      expect(result).toBe(0);
    });
  });

  describe('isDeviceOn', () => {
    it('returns true for power > 100W', () => {
      expect(isDeviceOn(150)).toBe(true);
      expect(isDeviceOn(3600)).toBe(true);
    });

    it('returns false for power <= 100W', () => {
      expect(isDeviceOn(100)).toBe(false);
      expect(isDeviceOn(50)).toBe(false);
      expect(isDeviceOn(0)).toBe(false);
    });

    it('returns true for power just above threshold', () => {
      expect(isDeviceOn(100.1)).toBe(true);
    });
  });

  describe('formatPowerInKW', () => {
    it('converts watts to kilowatts with default 2 decimal places', () => {
      expect(formatPowerInKW(3600)).toBe('3.60');
      expect(formatPowerInKW(1500)).toBe('1.50');
    });

    it('converts watts to kilowatts with custom decimal places', () => {
      expect(formatPowerInKW(3600, 1)).toBe('3.6');
      expect(formatPowerInKW(1550, 3)).toBe('1.550');
    });

    it('handles zero power correctly', () => {
      expect(formatPowerInKW(0)).toBe('0.00');
    });
  });

  describe('calculateDailyEnergyConsumption', () => {
    it('estimates daily consumption as power * 24 hours', () => {
      expect(calculateDailyEnergyConsumption(3600)).toBe(86.4); // 3.6kW * 24h = 86.4kWh
      expect(calculateDailyEnergyConsumption(1500)).toBe(36); // 1.5kW * 24h = 36kWh
    });

    it('returns 0 for zero power', () => {
      expect(calculateDailyEnergyConsumption(0)).toBe(0);
    });
  });

  describe('formatEnergyInKWh', () => {
    it('formats energy with kWh suffix and 2 decimal places', () => {
      expect(formatEnergyInKWh(86.4)).toBe('86.40 kWh');
      expect(formatEnergyInKWh(36)).toBe('36.00 kWh');
    });
  });

  describe('calculateDailyCost', () => {
    it('calculates cost as daily energy * electricity rate', () => {
      const rate = 0.12; // $0.12 per kWh
      const result = calculateDailyCost(mockReading, rate);

      // Expected: 86.4 kWh * $0.12 = $10.368
      expect(result).toBeCloseTo(10.37, 2);
    });

    it('returns 0 when no electricity rate is provided', () => {
      const result = calculateDailyCost(mockReading);
      expect(result).toBe(0);
    });

    it('returns 0 when electricity rate is undefined', () => {
      const result = calculateDailyCost(mockReading, undefined);
      expect(result).toBe(0);
    });
  });

  describe('formatCostAsCurrency', () => {
    it('formats cost as USD currency with 2 decimal places', () => {
      expect(formatCostAsCurrency(10.37)).toBe('$10.37');
      expect(formatCostAsCurrency(5)).toBe('$5.00');
      expect(formatCostAsCurrency(0)).toBe('$0.00');
    });
  });

  describe('isValidElectricityRate', () => {
    it('returns true for rates between 0 and 100', () => {
      expect(isValidElectricityRate(0.12)).toBe(true);
      expect(isValidElectricityRate(50)).toBe(true);
      expect(isValidElectricityRate(99.99)).toBe(true);
    });

    it('returns false for rates <= 0', () => {
      expect(isValidElectricityRate(0)).toBe(false);
      expect(isValidElectricityRate(-1)).toBe(false);
    });

    it('returns false for rates >= 100', () => {
      expect(isValidElectricityRate(100)).toBe(false);
      expect(isValidElectricityRate(200)).toBe(false);
    });
  });

  describe('PowerMeterCard Logic Integration', () => {
    it('correctly determines device status and formats display values', () => {
      const totalPower = calculateTotalPower(
        mockReading.power,
        mockReading.voltage,
        mockReading.amperage,
        mockReading.powerFactor
      );

      expect(isDeviceOn(totalPower)).toBe(true);
      expect(formatPowerInKW(totalPower)).toBe('3.38');
      expect(calculateDailyEnergyConsumption(totalPower)).toBeCloseTo(81.23, 2);
    });

    it('handles offline device correctly', () => {
      const offlineReading: PowerReading = {
        ...mockReading,
        power: { p1: 0, p2: 0, p3: 0, total: 0 },
        voltage: { p1: 0, p2: 0, p3: 0 },
        amperage: { p1: 0, p2: 0, p3: 0 },
        powerFactor: { p1: 0, p2: 0, p3: 0 },
      };

      const totalPower = calculateTotalPower(
        offlineReading.power,
        offlineReading.voltage,
        offlineReading.amperage,
        offlineReading.powerFactor
      );

      expect(totalPower).toBe(0);
      expect(isDeviceOn(totalPower)).toBe(false);
      expect(formatPowerInKW(totalPower)).toBe('0.00');
    });

    it('calculates cost correctly with valid electricity rate', () => {
      const rate = 0.12;
      const cost = calculateDailyCost(mockReading, rate);

      expect(cost).toBeGreaterThan(0);
      expect(formatCostAsCurrency(cost)).toMatch(/^\$\d+\.\d{2}$/);
    });

    it('rejects invalid electricity rates', () => {
      expect(isValidElectricityRate(200)).toBe(false);
      expect(isValidElectricityRate(-5)).toBe(false);
      expect(isValidElectricityRate(0)).toBe(false);
    });
  });
});