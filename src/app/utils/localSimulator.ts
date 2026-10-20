/**
 * Local Simulator - Generates realistic meter data without MQTT
 * Based on GridOS Live Dashboard simulation logic
 */

export const METERS = [
  { id: 'MTR-001', name: 'Amina Hassan', type: 'residential', balance: 5200, profile: 'low', brand: 'Hexing' },
  { id: 'MTR-002', name: 'Joseph Mwangi', type: 'residential', balance: 12800, profile: 'mid', brand: 'Hexing' },
  { id: 'MTR-003', name: 'Mama Pima Duka', type: 'business', balance: 28000, profile: 'biz', brand: 'SparkMeter' },
  { id: 'MTR-004', name: 'Baraka Fishing Co', type: 'productive', balance: 45000, profile: 'heavy', brand: 'SparkMeter' },
  { id: 'MTR-005', name: 'Grace Nyamweru', type: 'residential', balance: 800, profile: 'low', brand: 'Hexing' },
  { id: 'MTR-006', name: 'St. Peter School', type: 'productive', balance: 67000, profile: 'school', brand: 'Hexing' },
  { id: 'MTR-007', name: 'Ali Dispensary', type: 'business', balance: 32000, profile: 'clinic', brand: 'Conlog' },
  { id: 'MTR-008', name: 'Zawadi Restaurant', type: 'business', balance: 19500, profile: 'rest', brand: 'Hexing' },
  { id: 'MTR-009', name: 'Farida Tailoring', type: 'business', balance: 7200, profile: 'biz', brand: 'SparkMeter' },
  { id: 'MTR-010', name: 'Pastor Elias', type: 'residential', balance: 0, profile: 'zero', brand: 'Hexing' },
];

export const TARIFF: Record<string, number> = {
  residential: 1710,
  business: 1560,
  productive: 1310,
};

// Hourly power consumption profiles (24 hours, watts)
export const PROFILES: Record<string, number[]> = {
  low: [5, 5, 5, 5, 5, 5, 10, 20, 15, 10, 10, 10, 15, 10, 10, 10, 15, 30, 40, 50, 45, 35, 20, 10],
  mid: [10, 10, 10, 10, 10, 10, 20, 40, 30, 20, 20, 25, 30, 20, 20, 20, 30, 80, 120, 150, 120, 80, 40, 20],
  biz: [5, 5, 5, 5, 5, 5, 5, 60, 80, 90, 90, 90, 90, 90, 90, 90, 90, 90, 70, 50, 30, 15, 10, 5],
  heavy: [200, 180, 160, 140, 120, 200, 250, 300, 280, 260, 240, 200, 180, 160, 140, 120, 100, 200, 280, 300, 260, 240, 220, 200],
  school: [5, 5, 5, 5, 5, 5, 5, 30, 200, 250, 250, 250, 200, 200, 200, 200, 150, 50, 20, 10, 10, 10, 5, 5],
  clinic: [40, 40, 40, 40, 40, 40, 40, 60, 80, 100, 100, 100, 100, 80, 80, 80, 80, 80, 60, 60, 50, 50, 45, 40],
  rest: [5, 5, 5, 5, 5, 100, 200, 250, 150, 50, 40, 200, 250, 200, 80, 50, 40, 200, 300, 280, 180, 80, 30, 10],
  zero: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

export interface MeterState {
  id: string;
  name: string;
  type: string;
  balance: number;
  profile: string;
  brand: string;
  power: number;
  voltage: number;
  tamper: boolean;
  rssi: number;
  connected: boolean;
}

export interface AlertItem {
  type: string;
  severity: 'critical' | 'high' | 'medium';
  message: string;
  meter_id: string;
  timestamp: string;
}

export interface SimulatorState {
  meters: MeterState[];
  alerts: AlertItem[];
  tick: number;
  revenueToday: number;
  loadHistory: number[];
}

// Add random variation to a base value
function varyRandom(base: number, percentage = 0.15): number {
  return base * (1 + (Math.random() - 0.5) * 2 * percentage);
}

// Get expected power consumption for a meter at current hour
function getPowerForMeter(meter: MeterState): number {
  if (meter.balance <= 0) return 0;
  
  const hour = new Date().getHours();
  const profile = PROFILES[meter.profile] || PROFILES.low;
  
  return Math.max(0, Math.round(varyRandom(profile[hour], 0.2)));
}

// Initialize simulator state
export function createSimulator(): SimulatorState {
  return {
    meters: METERS.map(m => ({
      ...m,
      power: 0,
      voltage: 230,
      tamper: false,
      rssi: -70,
      connected: m.balance > 0,
    })),
    alerts: [],
    tick: 0,
    revenueToday: 0,
    loadHistory: Array(20).fill(0),
  };
}

// Run one simulation tick (call every 3 seconds)
export function tickSimulator(state: SimulatorState): SimulatorState {
  const newState = { ...state };
  newState.tick += 1;
  
  let totalLoad = 0;
  let earned = 0;
  const newAlerts: AlertItem[] = [...state.alerts];

  newState.meters = newState.meters.map(meter => {
    const newMeter = { ...meter };
    
    // Calculate power consumption
    newMeter.power = getPowerForMeter(newMeter);
    totalLoad += newMeter.power;
    
    // Calculate energy consumption and cost
    const kwhConsumed = (newMeter.power * 3) / 3_600_000; // 3 seconds in hours
    const cost = kwhConsumed * TARIFF[newMeter.type];
    
    // Deduct from balance
    if (newMeter.balance > 0) {
      newMeter.balance = Math.max(0, newMeter.balance - cost);
      earned += cost;
    }
    
    // Update voltage (drops slightly under heavy load)
    newMeter.voltage = newMeter.power > 200
      ? Math.round(varyRandom(218, 0.03))
      : Math.round(varyRandom(230, 0.015));
    
    // Update signal strength
    newMeter.rssi = Math.round(varyRandom(-70, 0.15));
    
    // Connection status
    newMeter.connected = newMeter.balance > 0;
    
    // Random tamper detection (0.3% chance per tick)
    if (!newMeter.tamper && Math.random() < 0.003) {
      newMeter.tamper = true;
    }
    
    // Generate alerts
    
    // Disconnection alert
    if (newMeter.balance <= 0 && meter.balance > 0) {
      const existing = newAlerts.find(a => a.type === 'DISCONNECTED' && a.meter_id === newMeter.id);
      if (!existing) {
        newAlerts.unshift({
          type: 'DISCONNECTED',
          severity: 'high',
          message: `${newMeter.name} disconnected — zero balance`,
          meter_id: newMeter.id,
          timestamp: new Date().toLocaleTimeString(),
        });
      }
    }
    
    // Low credit alert
    if (newMeter.balance > 0 && newMeter.balance < 3000) {
      const existing = newAlerts.find(a => a.type === 'LOW_CREDIT' && a.meter_id === newMeter.id);
      if (!existing) {
        newAlerts.unshift({
          type: 'LOW_CREDIT',
          severity: 'medium',
          message: `${newMeter.name} low credit: TZS ${Math.round(newMeter.balance)}`,
          meter_id: newMeter.id,
          timestamp: new Date().toLocaleTimeString(),
        });
      }
    }
    
    // Tamper alert
    if (newMeter.tamper) {
      const existing = newAlerts.find(a => a.type === 'TAMPER' && a.meter_id === newMeter.id);
      if (!existing) {
        newAlerts.unshift({
          type: 'TAMPER',
          severity: 'critical',
          message: `Tamper detected — ${newMeter.id} (${newMeter.name})`,
          meter_id: newMeter.id,
          timestamp: new Date().toLocaleTimeString(),
        });
      }
    }
    
    return newMeter;
  });
  
  // Update revenue
  newState.revenueToday += earned;
  
  // Keep last 20 alerts
  newState.alerts = newAlerts.slice(0, 20);
  
  // Update load history (rolling window of 20 points)
  newState.loadHistory = [...newState.loadHistory.slice(-19), Math.round(totalLoad)];
  
  return newState;
}

// Convert simulator state to LiveDataContext format
export function convertToLiveDataFormat(state: SimulatorState) {
  const meterStatus: Record<string, any> = {};
  
  state.meters.forEach(meter => {
    meterStatus[meter.id] = {
      meter_id: meter.id,
      customer_name: meter.name,
      customer_type: meter.type,
      power_w: meter.power,
      voltage_v: meter.voltage,
      current_a: meter.power / meter.voltage,
      balance_tzs: meter.balance,
      connected: meter.connected,
      tamper: meter.tamper,
      rssi: meter.rssi,
      brand: meter.brand,
    };
  });
  
  const totalLoad = state.meters.reduce((sum, m) => sum + m.power, 0);
  const metersConnected = state.meters.filter(m => m.connected).length;
  const metersZeroBalance = state.meters.filter(m => m.balance <= 0).length;
  
  const siteSummary = {
    site_id: 'site-tz-001',
    total_load_w: totalLoad,
    capacity_kw: 50,
    utilization_pct: Math.round((totalLoad / 50000) * 100),
    meters_total: state.meters.length,
    meters_connected: metersConnected,
    meters_zero_balance: metersZeroBalance,
    collection_rate_pct: Math.round(((metersConnected / state.meters.length) * 100)),
    revenue_today_tzs: Math.round(state.revenueToday),
  };
  
  const recentAlerts = state.alerts.map(alert => ({
    id: `${alert.meter_id}-${alert.type}`,
    severity: alert.severity,
    message: alert.message,
    timestamp: alert.timestamp,
    meter_id: alert.meter_id,
  }));
  
  return {
    meterStatus,
    siteSummary,
    recentAlerts,
  };
}

// Top up a meter's balance (for testing)
export function topUpMeter(state: SimulatorState, meterId: string, amount: number): SimulatorState {
  const newState = { ...state };
  newState.meters = newState.meters.map(m =>
    m.id === meterId ? { ...m, balance: m.balance + amount } : m
  );
  return newState;
}
