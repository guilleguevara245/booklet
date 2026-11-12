import { describe, expect, it } from 'vitest';
import {
  availabilityQuerySchema,
  createServiceSchema,
  slugSchema,
  timezoneSchema,
  weeklyRuleSchema,
} from './catalog.js';

const uuid = '3f2b8c1e-8d4a-4b6e-9c1a-2f4e6d8b0a1c';

describe('esquemas del catálogo', () => {
  it('acepta direcciones en minúsculas con guiones y rechaza el resto', () => {
    expect(slugSchema.safeParse('peluqueria-ana').success).toBe(true);
    expect(slugSchema.safeParse('Peluqueria Ana').success).toBe(false);
    expect(slugSchema.safeParse('-ana').success).toBe(false);
  });

  it('valida zonas horarias IANA', () => {
    expect(timezoneSchema.safeParse('America/Argentina/Cordoba').success).toBe(true);
    expect(timezoneSchema.safeParse('GMT-3 Buenos Aires').success).toBe(false);
  });

  it('exige que un tramo termine después de empezar y admite 24:00', () => {
    expect(weeklyRuleSchema.safeParse({ weekday: 5, start: '20:00', end: '24:00' }).success).toBe(
      true,
    );
    expect(weeklyRuleSchema.safeParse({ weekday: 5, start: '10:00', end: '10:00' }).success).toBe(
      false,
    );
    expect(weeklyRuleSchema.safeParse({ weekday: 0, start: '10:00', end: '11:00' }).success).toBe(
      false,
    );
  });

  it('completa los valores por defecto de un servicio', () => {
    expect(createServiceSchema.parse({ name: 'Corte', durationMinutes: 30 })).toEqual({
      name: 'Corte',
      durationMinutes: 30,
      bufferMinutes: 0,
      priceCents: 0,
      currency: 'ARS',
    });
  });

  it('limita la consulta de disponibilidad a 31 días y exige un rango ordenado', () => {
    const q = (from: string, to: string) =>
      availabilityQuerySchema.safeParse({ serviceId: uuid, from, to }).success;
    expect(q('2026-11-01', '2026-12-01')).toBe(true); // 31 días
    expect(q('2026-11-01', '2026-12-02')).toBe(false);
    expect(q('2026-11-10', '2026-11-09')).toBe(false);
  });
});
