import { DateTime } from 'luxon';

/** Tramo del horario semanal en hora local. `weekday`: 1 = lunes … 7 = domingo. */
export interface WeeklyRule {
  weekday: number;
  /** `HH:MM` o `HH:MM:SS` */
  start: string;
  /** `HH:MM` o `HH:MM:SS` */
  end: string;
}

/** Intervalo absoluto, semiabierto: incluye `start`, excluye `end`. */
export interface Interval {
  start: Date;
  end: Date;
}

export interface SlotQuery {
  /** Zona horaria IANA de la sucursal, por ejemplo `America/Argentina/Buenos_Aires`. */
  timezone: string;
  /** Primer día, en fecha local `YYYY-MM-DD`. */
  from: string;
  /** Último día, inclusive. */
  to: string;
  rules: WeeklyRule[];
  /** Cierres, ausencias y (desde la fase 2) turnos ya tomados. */
  blocked: Interval[];
  durationMinutes: number;
  /** Tiempo que debe quedar libre después del turno, antes de algo bloqueado. */
  bufferMinutes: number;
  /** Cada cuántos minutos puede empezar un turno. */
  stepMinutes: number;
  /** No se ofrecen turnos que empiecen antes de este momento (ahora + anticipación mínima). */
  notBefore: Date;
}

const MINUTE = 60_000;

interface Span {
  start: number;
  end: number;
}

/** Une tramos superpuestos o contiguos (9–13 y 13–17 pasan a ser 9–17). */
function merge(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out.at(-1);
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ ...s });
  }
  return out;
}

/** Pasa un tramo semanal de un día local a un intervalo absoluto en esa zona horaria. */
function localSpan(day: DateTime, rule: WeeklyRule, zone: string): Span | null {
  const date = day.toISODate();
  const start = DateTime.fromISO(`${date}T${rule.start}`, { zone });
  const end = DateTime.fromISO(`${date}T${rule.end}`, { zone });
  if (!start.isValid || !end.isValid || end <= start) return null;
  return { start: start.toMillis(), end: end.toMillis() };
}

/**
 * Calcula los horarios en que puede empezar un turno.
 *
 * Un horario sirve si el turno entero cae dentro del horario de atención y, sumando el margen
 * posterior, no se superpone con nada bloqueado. Los horarios se cargan en hora local, así que
 * un cambio de horario de verano mueve los turnos junto con el reloj de la sucursal.
 */
export function computeSlots(q: SlotQuery): Date[] {
  if (q.durationMinutes <= 0 || q.stepMinutes <= 0) return [];
  const first = DateTime.fromISO(q.from, { zone: q.timezone }).startOf('day');
  const last = DateTime.fromISO(q.to, { zone: q.timezone }).startOf('day');
  if (!first.isValid || !last.isValid || last < first) return [];

  const work: Span[] = [];
  for (let day = first; day <= last; day = day.plus({ days: 1 })) {
    for (const rule of q.rules) {
      if (rule.weekday !== day.weekday) continue;
      const span = localSpan(day, rule, q.timezone);
      if (span) work.push(span);
    }
  }

  const blocked = q.blocked.map((b) => ({ start: b.start.getTime(), end: b.end.getTime() }));
  const duration = q.durationMinutes * MINUTE;
  const reserve = duration + q.bufferMinutes * MINUTE;
  const step = q.stepMinutes * MINUTE;
  const notBefore = q.notBefore.getTime();

  const slots: number[] = [];
  for (const w of merge(work)) {
    for (let t = w.start; t + duration <= w.end; t += step) {
      if (t < notBefore) continue;
      const clash = blocked.some((b) => t < b.end && b.start < t + reserve);
      if (!clash) slots.push(t);
    }
  }
  return slots.map((t) => new Date(t));
}
