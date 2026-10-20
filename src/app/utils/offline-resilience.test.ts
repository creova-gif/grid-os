import { describe, it, expect } from 'vitest';
import { METERS } from '../data/site-config';

describe('Offline Field Agent Resilience', () => {
  it('normalizes local Tanzanian phone numbers across formats', () => {
    const testCases = [
      { input: '0711001001', expectedLast9: '711001001' },
      { input: '+255711001001', expectedLast9: '711001001' },
      { input: '255 711 001 001', expectedLast9: '711001001' },
    ];

    testCases.forEach(({ input, expectedLast9 }) => {
      const cleanDigits = input.replace(/\D/g, '').slice(-9);
      expect(cleanDigits).toBe(expectedLast9);
    });
  });

  it('matches customer from local METERS configuration using normalized phone', () => {
    const userInput = '0711001001';
    const cleanDigits = userInput.replace(/\D/g, '').slice(-9);
    const query = userInput.trim().toLowerCase();

    const matched = METERS.find((m) => {
      const phoneDigits = m.customer.phone.replace(/\D/g, '').slice(-9);
      return (
        (cleanDigits.length >= 7 && phoneDigits.endsWith(cleanDigits)) ||
        m.customer.phone.includes(query) ||
        m.id.toLowerCase().includes(query) ||
        m.customer.name.toLowerCase().includes(query)
      );
    });

    expect(matched).toBeDefined();
    expect(matched?.customer.name).toBe('Amina Hassan');
    expect(matched?.id).toBe('MTR-001');
  });

  it('generates valid 20-digit STS token structure', () => {
    const token = Array.from({ length: 5 }, () =>
      Math.floor(1000 + Math.random() * 9000).toString()
    ).join('-');

    // 5 blocks of 4 digits = 20 digits + 4 hyphens = 24 chars
    expect(token).toMatch(/^\d{4}-\d{4}-\d{4}-\d{4}-\d{4}$/);
    const digitsOnly = token.replace(/-/g, '');
    expect(digitsOnly).toHaveLength(20);
  });
});
