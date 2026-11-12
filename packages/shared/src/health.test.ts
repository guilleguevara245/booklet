import { describe, expect, it } from 'vitest';
import { healthResponseSchema, overallStatus } from './health.js';

describe('overallStatus', () => {
  it('devuelve ok cuando todas las dependencias están arriba', () => {
    expect(overallStatus({ database: 'up', redis: 'up' })).toBe('ok');
  });

  it('devuelve degraded si alguna dependencia está caída', () => {
    expect(overallStatus({ database: 'up', redis: 'down' })).toBe('degraded');
  });
});

describe('healthResponseSchema', () => {
  it('rechaza un uptime negativo', () => {
    const result = healthResponseSchema.safeParse({
      status: 'ok',
      version: '0.0.0',
      uptimeSeconds: -1,
      checks: { database: 'up', redis: 'up' },
    });
    expect(result.success).toBe(false);
  });
});
