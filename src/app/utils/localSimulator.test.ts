import { describe, it, expect } from 'vitest';
import {
  createSimulator,
  tickSimulator,
  convertToLiveDataFormat,
  METERS,
} from './localSimulator';

describe('LocalSimulator', () => {
  it('initializes with 10 virtual meters', () => {
    const sim = createSimulator();
    expect(sim.meters).toHaveLength(10);
    expect(sim.meters[0].id).toBe('MTR-001');
    expect(sim.meters[0].name).toBe('Amina Hassan');
  });

  it('marks meter with zero balance as disconnected with 0W power', () => {
    const sim = createSimulator();
    const zeroMeter = sim.meters.find((m) => m.id === 'MTR-010');
    expect(zeroMeter).toBeDefined();
    expect(zeroMeter?.balance).toBe(0);
    expect(zeroMeter?.connected).toBe(false);
    expect(zeroMeter?.power).toBe(0);
  });

  it('advances simulator tick and calculates load', () => {
    const sim = createSimulator();
    const nextSim = tickSimulator(sim);
    expect(nextSim.tick).toBe(sim.tick + 1);
    const totalLoad = nextSim.meters.reduce((sum, m) => sum + m.power, 0);
    expect(totalLoad).toBeGreaterThanOrEqual(0);
    expect(nextSim.meters).toHaveLength(10);
  });

  it('converts to LiveData format correctly', () => {
    const sim = createSimulator();
    const liveData = convertToLiveDataFormat(sim);

    expect(liveData.siteSummary).toBeDefined();
    expect(liveData.siteSummary.site_id).toBe('site-tz-001');
    expect(liveData.siteSummary.meters_total).toBe(10);
    expect(liveData.siteSummary.meters_zero_balance).toBe(1);

    expect(liveData.meterStatus['MTR-001']).toBeDefined();
    expect(liveData.meterStatus['MTR-001'].customer_type).toBe('residential');
    expect(liveData.meterStatus['MTR-001'].connected).toBe(true);
  });
});
