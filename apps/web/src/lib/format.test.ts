import { describe, expect, it } from 'vitest';
import { formatDuration, formatPrice } from './format';

describe('formatDuration', () => {
  it('muestra minutos y horas', () => {
    expect(formatDuration(30)).toBe('30 min');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(90)).toBe('1 h 30 min');
  });
});

describe('formatPrice', () => {
  it('formatea pesos sin centavos cuando no hacen falta', () => {
    expect(formatPrice(1_500_000, 'ARS')?.replace(/\s/g, ' ')).toBe('$ 15.000');
  });

  it('devuelve null si el servicio no tiene precio cargado', () => {
    expect(formatPrice(0, 'ARS')).toBeNull();
  });
});
