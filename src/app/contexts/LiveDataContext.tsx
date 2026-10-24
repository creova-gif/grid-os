/**
 * Live Data Context - MQTT Real-time Updates + Local Simulator Fallback
 * Subscribes to MQTT broker for live meter readings, alerts, and site summaries
 * Falls back to local simulation when MQTT is unavailable
 */
import { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import mqtt from 'mqtt';
import { createSimulator, tickSimulator, convertToLiveDataFormat, SimulatorState } from '../utils/localSimulator';

// MQTT Configuration
const BROKER_URL = import.meta.env.VITE_MQTT_BROKER || '';
const MQTT_USERNAME = import.meta.env.VITE_MQTT_USERNAME || '';
const MQTT_PASSWORD = import.meta.env.VITE_MQTT_PASSWORD || '';
const SITE_ID = import.meta.env.VITE_SITE_ID || 'site-tz-001';
const OPERATOR_ID = import.meta.env.VITE_OPERATOR_ID || 'op-jumeme-001';
const TOPIC_PREFIX = import.meta.env.VITE_MQTT_TOPIC_PREFIX || 'gridios';
// If VITE_USE_LOCAL_SIMULATOR is explicitly specified, obey it; otherwise default to simulator if no broker configured
const USE_LOCAL_SIMULATOR = import.meta.env.VITE_USE_LOCAL_SIMULATOR !== undefined
  ? import.meta.env.VITE_USE_LOCAL_SIMULATOR === 'true'
  : !BROKER_URL;

export interface MeterStatus {
  meter_id: string;
  power_w: number;
  voltage_v: number;
  current_a: number;
  frequency_hz: number;
  power_factor: number;
  balance_tzs: number;
  connected: boolean;
  tamper: boolean;
  rssi_dbm: number;
  customer_type: string;
  cumulative_kwh: number;
  timestamp: string;
}

export interface SiteSummary {
  site_id: string;
  meters_total: number;
  meters_connected: number;
  meters_zero_balance: number;
  total_load_w: number;
  utilization_pct: number;
  collection_rate_pct: number;
  timestamp: string;
}

export interface Alert {
  meter_id?: string;
  site_id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  balance_tzs?: number;
  timestamp: string;
}

interface LiveDataContextType {
  meterStatus: Record<string, MeterStatus>;
  siteSummary: SiteSummary | null;
  recentAlerts: Alert[];
  connected: boolean;
  error: string | null;
}

const LiveDataContext = createContext<LiveDataContextType>({
  meterStatus: {},
  siteSummary: null,
  recentAlerts: [],
  connected: false,
  error: null,
});

export const useLiveData = () => useContext(LiveDataContext);

interface LiveDataProviderProps {
  children: ReactNode;
}

export function LiveDataProvider({ children }: LiveDataProviderProps) {
  const [meterStatus, setMeterStatus] = useState<Record<string, MeterStatus>>({});
  const [siteSummary, setSiteSummary] = useState<SiteSummary | null>(null);
  const [recentAlerts, setRecentAlerts] = useState<Alert[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const simulatorRef = useRef<SimulatorState | null>(null);

  useEffect(() => {
    if (USE_LOCAL_SIMULATOR) {
      console.log('🎮 Local simulator enabled - starting with 10 virtual meters');
      simulatorRef.current = createSimulator();
      
      // Initial update
      const initialData = convertToLiveDataFormat(simulatorRef.current);
      setMeterStatus(initialData.meterStatus);
      setSiteSummary(initialData.siteSummary);
      setRecentAlerts(initialData.recentAlerts);
      setConnected(true);
      
      // Update every second
      const intervalId = setInterval(() => {
        if (simulatorRef.current) {
          simulatorRef.current = tickSimulator(simulatorRef.current);
          const liveData = convertToLiveDataFormat(simulatorRef.current);
          setMeterStatus(liveData.meterStatus);
          setSiteSummary(liveData.siteSummary);
          setRecentAlerts(liveData.recentAlerts);
        }
      }, 1000);
      
      return () => clearInterval(intervalId);
    }

    if (!BROKER_URL) {
      console.warn('[MQTT] No broker configured. Falling back to local simulator.');
      return;
    }

    if (BROKER_URL.includes('broker.hivemq.com')) {
      console.warn('[Security Advisory] Connecting to public unauthenticated MQTT broker (hivemq.com). For production, configure an authenticated private broker (EMQX / AWS IoT Core / HiveMQ Cloud).');
    }

    const clientId = `gridios-dash-${Math.random().toString(16).slice(2, 8)}`;
    
    const client = mqtt.connect(BROKER_URL, {
      clientId,
      clean: true,
      connectTimeout: 10000,
      reconnectPeriod: 5000,
      ...(MQTT_USERNAME ? { username: MQTT_USERNAME } : {}),
      ...(MQTT_PASSWORD ? { password: MQTT_PASSWORD } : {}),
    });

    client.on('connect', () => {
      console.log('✓ MQTT connected');
      setConnected(true);
      setError(null);

      // Subscribe to topics
      const topics = [
        `${TOPIC_PREFIX}/${OPERATOR_ID}/${SITE_ID}/meters/+/status`,
        `${TOPIC_PREFIX}/${OPERATOR_ID}/${SITE_ID}/site/summary`,
        `${TOPIC_PREFIX}/${OPERATOR_ID}/${SITE_ID}/alerts`,
      ];

      client.subscribe(topics, { qos: 1 }, (err) => {
        if (err) {
          console.error('Subscription error:', err);
          setError('Failed to subscribe to topics');
        } else {
          console.log('✓ Subscribed to:', topics);
        }
      });
    });

    client.on('message', (topic: string, payload: Buffer) => {
      try {
        const data = JSON.parse(payload.toString());

        if (topic.includes('/status')) {
          // Meter status update
          setMeterStatus((prev) => ({
            ...prev,
            [data.meter_id]: data,
          }));
        } else if (topic.includes('/summary')) {
          // Site summary update
          setSiteSummary(data);
        } else if (topic.includes('/alerts')) {
          // New alert
          setRecentAlerts((prev) => [data, ...prev].slice(0, 50));
        }
      } catch (err) {
        console.error('Message parse error:', err);
      }
    });

    client.on('error', (err) => {
      console.error('MQTT error:', err);
      setError(err.message);
    });

    client.on('disconnect', () => {
      console.warn('MQTT disconnected');
      setConnected(false);
    });

    client.on('offline', () => {
      console.warn('MQTT offline');
      setConnected(false);
    });

    client.on('reconnect', () => {
      console.log('MQTT reconnecting...');
    });

    return () => {
      console.log('Cleaning up MQTT connection');
      client.end();
    };
  }, []);

  return (
    <LiveDataContext.Provider
      value={{
        meterStatus,
        siteSummary,
        recentAlerts,
        connected,
        error,
      }}
    >
      {children}
    </LiveDataContext.Provider>
  );
}