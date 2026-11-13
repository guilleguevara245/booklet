import type { AvailableSlot, Location, Service, Staff } from '@booklet/shared';
import { DateTime } from 'luxon';
import { useEffect, useId, useMemo } from 'react';
import { useAvailability } from '../../lib/business';
import { OptionCard, Step } from '../../components/options';

export const ANY = 'cualquiera';
const DAYS_PER_PAGE = 7;

export interface SlotChoice {
  /** Profesional elegido, o `ANY`. */
  staff: string;
  /** Primer día de la semana que se está viendo (`YYYY-MM-DD`). */
  from: string | null;
  /** Día elegido (`YYYY-MM-DD`). */
  day: string | null;
  /** Inicio del turno elegido (ISO) y con quién. */
  start: string | null;
  with: string | null;
}

interface Props {
  businessId: string;
  service: Service;
  location: Location;
  staff: Staff[];
  choice: SlotChoice;
  onChange: (changes: Partial<SlotChoice>) => void;
}

/**
 * Elegir profesional, día y horario. Pide la disponibilidad de una semana entera de una
 * vez, así los días sin lugar aparecen deshabilitados sin hacer un pedido por día.
 */
export function SlotPicker({ businessId, service, location, staff, choice, onChange }: Props) {
  const zone = location.timezone;
  const today = DateTime.now().setZone(zone).toISODate()!;
  const from = choice.from && choice.from >= today ? choice.from : today;
  const to = DateTime.fromISO(from)
    .plus({ days: DAYS_PER_PAGE - 1 })
    .toISODate()!;
  const candidates = staff.filter((s) => s.active && s.serviceIds.includes(service.id));
  const staffId =
    choice.staff !== ANY && candidates.some((s) => s.id === choice.staff)
      ? choice.staff
      : undefined;

  const availability = useAvailability(businessId, {
    serviceId: service.id,
    locationId: location.id,
    staffId,
    from,
    to,
  });

  // Turnos por día local y, dentro de cada día, por horario: con "cualquiera", un mismo
  // horario puede estar libre con varias personas.
  const byDay = useMemo(() => {
    const days = new Map<string, Map<string, AvailableSlot[]>>();
    for (const slot of availability.data?.slots ?? []) {
      const day = DateTime.fromISO(slot.start).setZone(zone).toISODate()!;
      const times = days.get(day) ?? new Map<string, AvailableSlot[]>();
      times.set(slot.start, [...(times.get(slot.start) ?? []), slot]);
      days.set(day, times);
    }
    return days;
  }, [availability.data, zone]);

  const days = Array.from({ length: DAYS_PER_PAGE }, (_, i) =>
    DateTime.fromISO(from, { zone }).plus({ days: i }),
  );
  const firstWithSlots = days.find((d) => byDay.has(d.toISODate()!))?.toISODate() ?? null;
  const day = choice.day && byDay.has(choice.day) ? choice.day : firstWithSlots;
  const times = day ? [...(byDay.get(day)?.entries() ?? [])] : [];

  // Si el día elegido quedó sin lugar (o no había ninguno), se pasa al primero con lugar.
  useEffect(() => {
    if (availability.isSuccess && day !== choice.day) onChange({ day, start: null, with: null });
  }, [availability.isSuccess, day, choice.day, onChange]);

  const staffName = useId();
  const local = (iso: string) => DateTime.fromISO(iso).setZone(zone).setLocale('es-AR');
  const shiftWeek = (weeks: number) =>
    onChange({
      from: DateTime.fromISO(from)
        .plus({ days: weeks * DAYS_PER_PAGE })
        .toISODate(),
      day: null,
      start: null,
      with: null,
    });

  return (
    <div className="flex flex-col gap-8">
      {candidates.length > 1 && (
        <Step title="Profesional">
          <OptionCard
            name={staffName}
            value={ANY}
            checked={!staffId}
            onChange={() => onChange({ staff: ANY, start: null, with: null })}
          >
            <span className="font-medium">Cualquiera</span>
            <span className="block text-sm text-muted dark:text-slate-300">
              Te mostramos todos los horarios libres.
            </span>
          </OptionCard>
          {candidates.map((s) => (
            <OptionCard
              key={s.id}
              name={staffName}
              value={s.id}
              checked={s.id === staffId}
              onChange={(id) => onChange({ staff: id, start: null, with: null })}
            >
              <span className="font-medium">{s.name}</span>
            </OptionCard>
          ))}
        </Step>
      )}

      <section aria-labelledby="dia-titulo" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="dia-titulo" className="text-lg font-bold">
            Día
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => shiftWeek(-1)}
              disabled={from <= today}
              aria-label="Semana anterior"
              className="inline-flex size-11 items-center justify-center rounded-lg border border-slate-300 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-40 dark:border-white/20 dark:hover:bg-white/10"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => shiftWeek(1)}
              aria-label="Semana siguiente"
              className="inline-flex size-11 items-center justify-center rounded-lg border border-slate-300 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand dark:border-white/20 dark:hover:bg-white/10"
            >
              →
            </button>
          </div>
        </div>
        <ul className="grid grid-cols-7 gap-1.5" aria-busy={availability.isPending}>
          {days.map((d) => {
            const iso = d.toISODate()!;
            const available = byDay.has(iso);
            const selected = iso === day;
            const short = d.setLocale('es-AR').toFormat('ccc');
            const month = d.setLocale('es-AR').toFormat("'de' LLLL");
            return (
              <li key={iso}>
                {/* El nombre accesible incluye lo que se ve ("mar 8") más el mes y si hay lugar. */}
                <button
                  type="button"
                  onClick={() => onChange({ day: iso, start: null, with: null })}
                  disabled={!available}
                  aria-pressed={selected}
                  className={`flex w-full flex-col items-center rounded-xl border py-2 focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40 ${selected ? 'border-brand bg-brand text-white' : 'border-slate-200 bg-white hover:border-brand dark:border-white/15 dark:bg-white/5'}`}
                >
                  <span className="text-xs uppercase">{short} </span>
                  <span className="text-lg font-bold">
                    {d.day}
                    <span className="sr-only">
                      {' '}
                      {month}
                      {available ? '' : ', sin horarios'}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="hora-titulo" className="flex flex-col gap-3">
        <h2 id="hora-titulo" className="text-lg font-bold">
          Horario
        </h2>
        {availability.isPending ? (
          <p role="status" className="text-muted dark:text-slate-300">
            Buscando horarios…
          </p>
        ) : availability.isError ? (
          <p role="alert">No pudimos cargar los horarios. Probá de nuevo.</p>
        ) : times.length === 0 ? (
          <p className="text-muted dark:text-slate-300">
            No hay horarios libres esta semana. Probá con la semana siguiente.
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {times.map(([start, slots]) => {
              const selected = start === choice.start;
              return (
                <li key={start}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    // Con "cualquiera", se asigna la primera persona libre en ese horario.
                    onClick={() => onChange({ start, with: slots[0]!.staffId })}
                    className={`min-h-11 w-full rounded-lg border font-medium focus-visible:outline-2 focus-visible:outline-brand ${selected ? 'border-brand bg-brand text-white' : 'border-slate-300 bg-white hover:border-brand dark:border-white/20 dark:bg-white/5'}`}
                  >
                    {local(start).toFormat('HH:mm')}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
