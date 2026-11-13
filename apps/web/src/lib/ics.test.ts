import { describe, expect, it } from 'vitest';
import { buildIcs } from './ics';

describe('buildIcs', () => {
  it('arma un evento en UTC con el texto escapado', () => {
    const ics = buildIcs(
      {
        uid: 'abc',
        title: 'Corte, en Barbería Sur',
        start: '2030-01-08T13:00:00.000Z',
        end: '2030-01-08T13:30:00.000Z',
        location: 'Av. Boedo 900; CABA',
      },
      new Date('2030-01-01T00:00:00.000Z'),
    );
    expect(ics).toContain('DTSTART:20300108T130000Z\r\n');
    expect(ics).toContain('DTEND:20300108T133000Z\r\n');
    expect(ics).toContain('SUMMARY:Corte\\, en Barbería Sur\r\n');
    expect(ics).toContain('LOCATION:Av. Boedo 900\\; CABA\r\n');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
  });
});
