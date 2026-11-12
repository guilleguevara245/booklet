import { describe, expect, it } from 'vitest';
import { computeSlots, type SlotQuery } from './compute.js';

const BA = 'America/Argentina/Buenos_Aires'; // UTC-3 todo el año

// 2026-11-16 es lunes.
function query(overrides: Partial<SlotQuery> = {}): SlotQuery {
  return {
    timezone: BA,
    from: '2026-11-16',
    to: '2026-11-16',
    rules: [{ weekday: 1, start: '09:00', end: '12:00' }],
    blocked: [],
    durationMinutes: 30,
    bufferMinutes: 0,
    stepMinutes: 30,
    notBefore: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

const iso = (dates: Date[]) => dates.map((d) => d.toISOString());

describe('computeSlots', () => {
  it('divide el horario en turnos según la duración, en la zona de la sucursal', () => {
    expect(iso(computeSlots(query()))).toEqual([
      '2026-11-16T12:00:00.000Z',
      '2026-11-16T12:30:00.000Z',
      '2026-11-16T13:00:00.000Z',
      '2026-11-16T13:30:00.000Z',
      '2026-11-16T14:00:00.000Z',
      '2026-11-16T14:30:00.000Z',
    ]);
  });

  it('no ofrece turnos que terminen fuera del horario', () => {
    const slots = computeSlots(query({ durationMinutes: 90, stepMinutes: 30 }));
    expect(iso(slots).at(-1)).toBe('2026-11-16T13:30:00.000Z'); // 10:30 a 12:00 local
  });

  it('respeta el corte del mediodía en un horario partido', () => {
    const slots = computeSlots(
      query({
        rules: [
          { weekday: 1, start: '09:00', end: '13:00' },
          { weekday: 1, start: '15:00', end: '19:00' },
        ],
        durationMinutes: 60,
        stepMinutes: 60,
      }),
    );
    expect(iso(slots)).not.toContain('2026-11-16T16:00:00.000Z'); // 13:00 local
    expect(iso(slots)).toContain('2026-11-16T15:00:00.000Z'); // 12:00 local
    expect(iso(slots)).toContain('2026-11-16T18:00:00.000Z'); // 15:00 local
  });

  it('une tramos contiguos para que un turno pueda cruzarlos', () => {
    const slots = computeSlots(
      query({
        rules: [
          { weekday: 1, start: '09:00', end: '10:00' },
          { weekday: 1, start: '10:00', end: '11:00' },
        ],
        durationMinutes: 60,
        stepMinutes: 30,
      }),
    );
    expect(iso(slots)).toEqual([
      '2026-11-16T12:00:00.000Z',
      '2026-11-16T12:30:00.000Z',
      '2026-11-16T13:00:00.000Z',
    ]);
  });

  it('saltea lo bloqueado y deja libre el margen posterior al turno', () => {
    const slots = computeSlots(
      query({
        blocked: [
          { start: new Date('2026-11-16T13:00:00Z'), end: new Date('2026-11-16T14:00:00Z') },
        ],
        durationMinutes: 30,
        bufferMinutes: 15,
        stepMinutes: 15,
      }),
    );
    const times = iso(slots);
    expect(times).toContain('2026-11-16T12:15:00.000Z'); // termina 12:45 + 15 de margen = 13:00
    expect(times).not.toContain('2026-11-16T12:30:00.000Z'); // el margen pisaría lo bloqueado
    expect(times).not.toContain('2026-11-16T13:30:00.000Z');
    expect(times).toContain('2026-11-16T14:00:00.000Z');
  });

  it('no exige margen después del último turno del día si no hay nada bloqueado', () => {
    const slots = computeSlots(query({ bufferMinutes: 30 }));
    expect(iso(slots).at(-1)).toBe('2026-11-16T14:30:00.000Z');
  });

  it('no ofrece turnos antes de la anticipación mínima', () => {
    const slots = computeSlots(query({ notBefore: new Date('2026-11-16T13:10:00Z') }));
    expect(iso(slots)[0]).toBe('2026-11-16T13:30:00.000Z');
  });

  it('usa los días de la semana ISO (7 = domingo) y recorre el rango completo', () => {
    const slots = computeSlots(
      query({
        from: '2026-11-15', // domingo
        to: '2026-11-22', // domingo siguiente
        rules: [{ weekday: 7, start: '10:00', end: '11:00' }],
        durationMinutes: 60,
        stepMinutes: 60,
      }),
    );
    expect(iso(slots)).toEqual(['2026-11-15T13:00:00.000Z', '2026-11-22T13:00:00.000Z']);
  });

  it('devuelve nada si el rango está invertido o la duración no es válida', () => {
    expect(computeSlots(query({ from: '2026-11-17', to: '2026-11-16' }))).toEqual([]);
    expect(computeSlots(query({ durationMinutes: 0 }))).toEqual([]);
  });

  describe('cambio de horario de verano (Europe/Madrid)', () => {
    const base = {
      timezone: 'Europe/Madrid',
      rules: [{ weekday: 7, start: '01:00', end: '04:00' }],
      durationMinutes: 60,
      stepMinutes: 60,
    };

    it('cuando se adelanta el reloj, la hora que no existe no se ofrece', () => {
      // 29/03/2026: a las 02:00 pasa a ser 03:00. De 01:00 a 04:00 hay solo dos horas reales.
      const slots = computeSlots(query({ ...base, from: '2026-03-29', to: '2026-03-29' }));
      expect(iso(slots)).toEqual(['2026-03-29T00:00:00.000Z', '2026-03-29T01:00:00.000Z']);
    });

    it('cuando se atrasa el reloj, la hora repetida da un turno más', () => {
      // 25/10/2026: a las 03:00 vuelve a ser 02:00. De 01:00 a 04:00 hay cuatro horas reales.
      const slots = computeSlots(query({ ...base, from: '2026-10-25', to: '2026-10-25' }));
      expect(slots).toHaveLength(4);
    });
  });
});
