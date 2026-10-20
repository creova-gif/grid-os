/**
 * GridOS API Client
 * Connects Figma Make frontend to Express backend
 */

import axios from 'axios';

// API base URL - configure based on environment
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// Create axios instance with defaults
export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gridosToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized - redirect to login
      localStorage.removeItem('gridosToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ============================================================
// API Endpoints
// ============================================================

// Sites API
export const sitesApi = {
  getAll: () => api.get('/api/sites'),
  getById: (id: string) => api.get(`/api/sites/${id}`),
  getStats: (id: string) => api.get(`/api/sites/${id}/stats`),
};

// Meters API
export const metersApi = {
  getBySite: (siteId: string) => api.get(`/api/sites/${siteId}/meters`),
  getById: (id: string) => api.get(`/api/meters/${id}`),
  getReadings: (id: string, params?: { hours?: number }) => 
    api.get(`/api/meters/${id}/readings`, { params }),
};

// Customers API
export const customersApi = {
  getBySite: (siteId: string) => api.get(`/api/sites/${siteId}/customers`),
  getById: (id: string) => api.get(`/api/customers/${id}`),
  topup: (id: string, data: { amount_tzs: number; payment_method: string }) =>
    api.post(`/api/customers/${id}/topup`, data),
  getProfile: (id: string) => api.get(`/api/customers/${id}/profile`),
};

// Alerts API
export const alertsApi = {
  getBySite: (siteId: string, params?: { status?: string }) =>
    api.get(`/api/sites/${siteId}/alerts`, { params }),
  resolve: (id: string, data: { notes: string; agent_id: string }) =>
    api.patch(`/api/alerts/${id}/resolve`, data),
};

// AI Insights API
export const aiApi = {
  loadForecast: (siteId: string) => api.get(`/api/ai/load-forecast/${siteId}`),
  creditScores: (siteId: string) => api.get(`/api/ai/credit-scores/${siteId}`),
  siteHealth: (siteId: string) => api.get(`/api/ai/site-health/${siteId}`),
};

// Reports API
export const reportsApi = {
  generate: (siteId: string, data: { start_date: string; end_date: string }) =>
    api.post(`/api/reports/rbf/${siteId}`, data),
  download: (reportId: string) => api.get(`/api/reports/${reportId}/download`, {
    responseType: 'blob',
  }),
};

// Planning API
export const planningApi = {
  scoreLocation: (data: { lat: number; lng: number; country: string }) =>
    api.post('/api/planning/score-location', data),
  getSites: () => api.get('/api/planning/sites'),
};

// Mock fallback data for offline / simulator mode
const MOCK_PORTFOLIO = {
  totals: {
    sites: 4,
    total_customers: 248,
    total_revenue_usd_mo: 14250,
  },
  sites: [
    {
      name: 'Ukerewe Island — Nansio Feeder',
      region: 'Lake Victoria, Mwanza',
      capacity_kw: 50,
      health_score: 94,
      meters_total: 10,
      active_customers: 10,
      monthly_revenue_tzs: 4120000,
      monthly_revenue_usd: 1615,
      unresolved_alerts: 0,
      health_status: 'healthy',
    },
    {
      name: 'Bwiro Solar Hub',
      region: 'Ukerewe District',
      capacity_kw: 35,
      health_score: 88,
      meters_total: 64,
      active_customers: 58,
      monthly_revenue_tzs: 3200000,
      monthly_revenue_usd: 1250,
      unresolved_alerts: 1,
      health_status: 'healthy',
    },
    {
      name: 'Bukindo Mini-Grid',
      region: 'Ukerewe North',
      capacity_kw: 80,
      health_score: 72,
      meters_total: 112,
      active_customers: 94,
      monthly_revenue_tzs: 7800000,
      monthly_revenue_usd: 3050,
      unresolved_alerts: 3,
      health_status: 'attention',
    },
    {
      name: 'Kagunga Lakeshore Feeder',
      region: 'Kigoma Rural',
      capacity_kw: 120,
      health_score: 96,
      meters_total: 185,
      active_customers: 178,
      monthly_revenue_tzs: 14200000,
      monthly_revenue_usd: 5560,
      unresolved_alerts: 0,
      health_status: 'healthy',
    },
  ],
};

// Portfolio API
export const portfolioApi = {
  getByOperator: async (operatorId: string) => {
    try {
      const res = await api.get(`/api/portfolio/${operatorId}`, { timeout: 3000 });
      return res;
    } catch {
      return { data: MOCK_PORTFOLIO };
    }
  },
};

// Fintech API
export const fintechApi = {
  getRbf: (siteId: string) => api.get(`/api/fintech/rbf/${siteId}`),
  getCarbon: (siteId: string) => api.get(`/api/fintech/carbon/${siteId}`),
  getMfi: (siteId: string) => api.get(`/api/fintech/mfi/${siteId}`),
  calculateBlendedFinance: (data: {
    capacity_kw: number;
    expected_connections: number;
    country: string;
    has_lois: boolean;
  }) => api.post('/api/fintech/blended-finance', data),
};

// Operations API
export const operationsApi = {
  getAnomalies: (siteId: string) => api.get(`/api/operations/anomalies/${siteId}`),
  getAgriculture: (siteId: string) => api.get(`/api/operations/agriculture/${siteId}`),
  getMaintenance: (siteId: string) => api.get(`/api/operations/maintenance/${siteId}`),
  getRegulatory: (operatorId: string) => api.get(`/api/operations/regulatory/${operatorId}`),
  getImpact: (operatorId: string) => api.get(`/api/operations/impact/${operatorId}`),
};

// Onboarding API
export const onboardingApi = {
  getChecklist: (operatorId: string) => api.get(`/api/onboarding/checklist/${operatorId}`),
};

// USSD API
export const ussdApi = {
  handleSession: (data: { sessionId: string; phoneNumber: string; text: string }) =>
    api.post('/ussd', data),
};

// Health check
export const healthCheck = () => api.get('/health');

/**
 * Lightweight health check helper returning boolean
 */
export const checkApiHealth = async (): Promise<boolean> => {
  try {
    const res = await api.get('/health', { timeout: 2500 });
    return res.status === 200;
  } catch {
    return false;
  }
};

export default api;
