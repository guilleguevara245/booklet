// Archivo de calendario (.ics) para agregar el turno a Google Calendar, Apple, Outlook, etc.

/** 2030-01-08T13:00:00.000Z → 20300108T130000Z */
const stamp = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Escapa texto según RFC 5545: barra invertida, punto y coma, coma y saltos de línea. */
const text = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export interface CalendarEvent {
  uid: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
}

export function buildIcs(e: CalendarEvent, now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Booklet//Turnos//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}@booklet`,
    `DTSTAMP:${stamp(now.toISOString())}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.end)}`,
    `SUMMARY:${text(e.title)}`,
    ...(e.location ? [`LOCATION:${text(e.location)}`] : []),
    ...(e.description ? [`DESCRIPTION:${text(e.description)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}
