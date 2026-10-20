/**
 * Supabase Client Configuration
 * Configure your Supabase project URL and anon key
 */
import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '/utils/supabase/info';

// Supabase project credentials (environment variable driven)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || `https://${projectId}.supabase.co`;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || publicAnonKey;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// Database types (auto-generated from your schema)
export type Database = {
  public: {
    Tables: {
      operators: {
        Row: {
          id: string;
          name: string;
          country: string;
          contact_email: string;
          contact_phone: string | null;
          logo_url: string | null;
          plan: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
      };
      sites: {
        Row: {
          id: string;
          operator_id: string;
          name: string;
          country: string;
          region: string | null;
          latitude: number | null;
          longitude: number | null;
          capacity_kw: number;
          currency: string;
          tariff_residential: number;
          tariff_business: number;
          tariff_productive: number;
          status: string;
          created_at: string;
          updated_at: string;
        };
      };
      meters: {
        Row: {
          id: string;
          site_id: string;
          operator_id: string;
          meter_ref: string;
          serial_number: string;
          brand: string;
          model: string | null;
          phase: string;
          load_limit_w: number;
          status: string;
          latitude: number | null;
          longitude: number | null;
          created_at: string;
          updated_at: string;
        };
      };
      customers: {
        Row: {
          id: string;
          operator_id: string;
          site_id: string;
          meter_id: string | null;
          full_name: string;
          phone: string;
          customer_type: string;
          account_number: string;
          balance_tzs: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
      };
      alerts: {
        Row: {
          id: string;
          operator_id: string;
          site_id: string;
          meter_id: string | null;
          customer_id: string | null;
          alert_type: string;
          severity: string;
          message: string;
          metadata: any;
          resolved: boolean;
          resolved_at: string | null;
          occurred_at: string;
          created_at: string;
        };
      };
      meter_readings: {
        Row: {
          time: string;
          meter_id: string;
          site_id: string;
          operator_id: string;
          power_w: number | null;
          voltage_v: number | null;
          current_a: number | null;
          frequency_hz: number | null;
          power_factor: number | null;
          energy_kwh_interval: number | null;
          cumulative_kwh: number | null;
          balance_tzs: number | null;
          rssi_dbm: number | null;
          tamper_detected: boolean;
          firmware: string | null;
          connected: boolean;
        };
      };
    };
  };
};
