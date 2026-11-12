import { describe, expect, it } from 'vitest';
import { probe } from './health.service.js';

describe('probe', () => {
  it('marca up cuando la verificación responde', async () => {
    await expect(probe(async () => 'PONG')).resolves.toBe('up');
  });

  it('marca down cuando la verificación falla', async () => {
    await expect(probe(async () => Promise.reject(new Error('sin conexión')))).resolves.toBe(
      'down',
    );
  });

  it('marca down cuando la verificación tarda más que el tope', async () => {
    const slow = () => new Promise((resolve) => setTimeout(resolve, 200));
    await expect(probe(slow, 20)).resolves.toBe('down');
  });
});
