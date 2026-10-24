import { describe, it, expect } from 'vitest';
import { checkApiHealth, portfolioApi } from './api';

describe('API Service', () => {
  it('checkApiHealth returns boolean without throwing unhandled rejection', async () => {
    // In test environment with no server running on localhost:4000
    const isHealthy = await checkApiHealth();
    expect(typeof isHealthy).toBe('boolean');
    expect(isHealthy).toBe(false);
  });

  it('portfolioApi.getByOperator returns resilient fallback data when offline', async () => {
    const res = await portfolioApi.getByOperator('any-operator-id');
    expect(res).toBeDefined();
    expect(res.data).toBeDefined();
    expect(res.data.totals.sites).toBe(4);
    expect(res.data.sites).toHaveLength(4);
    expect(res.data.sites[0].name).toContain('Ukerewe Island');
  });
});
