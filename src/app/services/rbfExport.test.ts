import { describe, it, expect } from 'vitest';
import {
  buildMeterLedger,
  generateReaLoisReport,
  generateWorldBankEsmapReport,
  exportLedgerToCsv,
} from './rbfExport';

describe('RBF Export Engine', () => {
  const mockMeterStatus = {
    'MTR-001': {
      meter_id: 'MTR-001',
      power_w: 45,
      voltage_v: 231,
      current_a: 0.19,
      frequency_hz: 50.0,
      power_factor: 0.95,
      balance_tzs: 5100,
      connected: true,
      tamper: false,
      rssi_dbm: -68,
      customer_type: 'residential',
      cumulative_kwh: 14.5,
      timestamp: '2026-10-22T14:00:00Z',
    },
    'MTR-010': {
      meter_id: 'MTR-010',
      power_w: 0,
      voltage_v: 230,
      current_a: 0,
      frequency_hz: 50.0,
      power_factor: 1.0,
      balance_tzs: 0,
      connected: false,
      tamper: false,
      rssi_dbm: -75,
      customer_type: 'residential',
      cumulative_kwh: 22.0,
      timestamp: '2026-10-22T14:00:00Z',
    },
  };

  it('buildMeterLedger constructs verified ledger rows from live telemetry', () => {
    const ledger = buildMeterLedger(mockMeterStatus as any);
    expect(ledger).toHaveLength(10);

    const mtr001 = ledger.find((m) => m.meterId === 'MTR-001');
    expect(mtr001).toBeDefined();
    expect(mtr001?.customerName).toBe('Amina Hassan');
    expect(mtr001?.status).toBe('CONNECTED');
    expect(mtr001?.currentBalanceTzs).toBe(5100);
    expect(mtr001?.currentPowerWatts).toBe(45);

    const mtr010 = ledger.find((m) => m.meterId === 'MTR-010');
    expect(mtr010?.status).toBe('DISCONNECTED');
    expect(mtr010?.currentBalanceTzs).toBe(0);
  });

  it('generateReaLoisReport generates compliant REA LOIS payload', () => {
    const report = generateReaLoisReport(null, mockMeterStatus as any);
    expect(report.meta.agency).toContain('Rural Energy Agency');
    expect(report.meta.siteId).toBe('site-tz-001');
    expect(report.summary.totalConnections).toBe(10);
    expect(report.summary.generationCapacityKw).toBe(50);
    expect(report.summary.eligibleSubsidyUsd).toBeGreaterThan(0);
    expect(report.breakdownByCategory.residential.connections).toBeGreaterThan(0);
    expect(report.metersLedger).toHaveLength(10);
  });

  it('generateWorldBankEsmapReport computes MTF and environmental benefits', () => {
    const report = generateWorldBankEsmapReport(null, mockMeterStatus as any);
    expect(report.meta.agency).toContain('World Bank ESMAP');
    expect(report.esmapTier).toContain('Tier 3');
    expect(report.environmentalImpact.renewableEnergyFractionPct).toBe(100);
    expect(report.environmentalImpact.dieselDisplacedLitersMonthly).toBeGreaterThan(0);
    expect(report.environmentalImpact.co2AvoidedKgMonthly).toBeGreaterThan(0);
  });

  it('exportLedgerToCsv formats valid CSV with proper headers', () => {
    const ledger = buildMeterLedger(mockMeterStatus as any);
    const csv = exportLedgerToCsv(ledger);

    expect(csv).toContain('Meter ID,Customer Name,Category');
    expect(csv).toContain('"MTR-001","Amina Hassan"');
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(11); // 1 header + 10 meters
  });
});
