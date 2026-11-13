import type { Booking, Service, Staff } from '@booklet/shared';
import { DateTime } from 'luxon';
import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import {
  dayRange,
  useBusiness,
  useDayBookings,
  useLocations,
  useServices,
  useStaff,
} from '../../lib/business';
import { PanelLayout } from './PanelLayout';

const PX_PER_MINUTE = 1.2; // una hora = 72 px
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 21;

const navClass =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 font-medium hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand dark:border-white/20 dark:bg-transparent dark:hover:bg-white/10';

/** Agenda del día: una columna por profesional, con los turnos en su horario. */
export function AgendaPage() {
  const { businessId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const business = useBusiness(businessId);
  const locations = useLocations(businessId);
  const staff = useStaff(businessId);
  const services = useServices(businessId);

  // La sucursal elegida define la zona horaria en que se ve el día.
  const activeLocations = (locations.data ?? []).filter((l) => l.active);
  const location =
    activeLocations.find((l) => l.id === params.get('sucursal')) ?? activeLocations[0];
  const timezone = location?.timezone ?? 'America/Argentina/Buenos_Aires';
  const today = DateTime.now().setZone(timezone).toISODate()!;
  const date = params.get('fecha') ?? today;
  const range = useMemo(() => dayRange(date, timezone), [date, timezone]);
  const bookings = useDayBookings(businessId, location ? range : null);

  const go = (next: string | null, sucursal = location?.id) => {
    const p = new URLSearchParams();
    if (next && next !== today) p.set('fecha', next);
    if (sucursal && sucursal !== activeLocations[0]?.id) p.set('sucursal', sucursal);
    setParams(p);
  };
  const shift = (days: number) => go(DateTime.fromISO(date).plus({ days }).toISODate());

  const dayBookings = (bookings.data ?? []).filter((b) => b.locationId === location?.id);
  const columns = (staff.data ?? []).filter(
    (s) => s.active || dayBookings.some((b) => b.staffId === s.id),
  );
  const serviceNames = new Map((services.data ?? []).map((s: Service) => [s.id, s.name]));
  const label = DateTime.fromISO(date).setLocale('es-AR').toFormat("cccc d 'de' LLLL");

  return (
    <PanelLayout>
      <main className="flex flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{business.data?.name ?? 'Agenda'}</h1>
            <p className="text-muted first-letter:uppercase dark:text-slate-300">{label}</p>
          </div>
          <nav aria-label="Elegir día" className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={navClass}
              onClick={() => shift(-1)}
              aria-label="Día anterior"
            >
              ←
            </button>
            <button
              type="button"
              className={navClass}
              onClick={() => go(null)}
              disabled={date === today}
            >
              Hoy
            </button>
            <button
              type="button"
              className={navClass}
              onClick={() => shift(1)}
              aria-label="Día siguiente"
            >
              →
            </button>
            <label className="sr-only" htmlFor="fecha">
              Fecha
            </label>
            <input
              id="fecha"
              type="date"
              value={date}
              onChange={(e) => e.target.value && go(e.target.value)}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-2 dark:border-white/20 dark:bg-white/5"
            />
            {activeLocations.length > 1 && (
              <>
                <label className="sr-only" htmlFor="sucursal">
                  Sucursal
                </label>
                <select
                  id="sucursal"
                  value={location?.id}
                  onChange={(e) => go(date, e.target.value)}
                  className="min-h-11 rounded-lg border border-slate-300 bg-white px-2 dark:border-white/20 dark:bg-white/5"
                >
                  {activeLocations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </>
            )}
          </nav>
        </div>

        {locations.isSuccess && !location ? (
          <EmptyState>Este negocio todavía no tiene sucursales cargadas.</EmptyState>
        ) : staff.isSuccess && columns.length === 0 ? (
          <EmptyState>Este negocio todavía no tiene profesionales cargados.</EmptyState>
        ) : bookings.isError ? (
          <EmptyState>No pudimos cargar los turnos. Probá recargar la página.</EmptyState>
        ) : (
          <DayGrid
            columns={columns}
            bookings={dayBookings}
            timezone={timezone}
            serviceNames={serviceNames}
            loading={bookings.isPending || staff.isPending}
          />
        )}
        <p className="text-sm text-muted dark:text-slate-300">
          <Link to="/panel" className="underline">
            Cambiar de negocio
          </Link>
        </p>
      </main>
    </PanelLayout>
  );
}

function EmptyState({ children }: { children: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-muted dark:border-white/20 dark:bg-white/5 dark:text-slate-300">
      {children}
    </p>
  );
}

interface GridProps {
  columns: Staff[];
  bookings: Booking[];
  timezone: string;
  serviceNames: Map<string, string>;
  loading: boolean;
}

function DayGrid({ columns, bookings, timezone, serviceNames, loading }: GridProps) {
  const local = (iso: string) => DateTime.fromISO(iso).setZone(timezone);
  // El rango visible se agranda si hay turnos fuera del horario habitual.
  const startHour = Math.min(DEFAULT_START_HOUR, ...bookings.map((b) => local(b.startsAt).hour));
  const endHour = Math.max(
    DEFAULT_END_HOUR,
    ...bookings.map((b) => Math.ceil(local(b.endsAt).hour + local(b.endsAt).minute / 60)),
  );
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const height = (endHour - startHour) * 60 * PX_PER_MINUTE;
  const minutesFromStart = (iso: string) => {
    const t = local(iso);
    return (t.hour - startHour) * 60 + t.minute;
  };

  return (
    <div
      className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5"
      aria-busy={loading}
    >
      <div
        className="grid min-w-full"
        style={{ gridTemplateColumns: `4rem repeat(${columns.length}, minmax(11rem, 1fr))` }}
      >
        <div className="sticky left-0 z-10 border-b border-slate-200 bg-white dark:border-white/10 dark:bg-night" />
        {columns.map((s) => (
          <div
            key={s.id}
            className="border-b border-l border-slate-200 px-3 py-2 font-medium dark:border-white/10"
          >
            {s.name}
          </div>
        ))}

        <div
          className="sticky left-0 z-10 bg-white dark:bg-night"
          style={{ height }}
          aria-hidden="true"
        >
          {hours.map((h) => (
            <div
              key={h}
              className="pr-2 text-right text-xs text-muted dark:text-slate-300"
              style={{ height: 60 * PX_PER_MINUTE }}
            >
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {columns.map((s) => {
          const own = bookings.filter((b) => b.staffId === s.id);
          return (
            <section
              key={s.id}
              aria-label={`Turnos de ${s.name}`}
              className="relative border-l border-slate-200 dark:border-white/10"
              style={{
                height,
                backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${60 * PX_PER_MINUTE - 1}px, rgb(148 163 184 / 0.25) ${60 * PX_PER_MINUTE - 1}px, rgb(148 163 184 / 0.25) ${60 * PX_PER_MINUTE}px)`,
              }}
            >
              {own.length === 0 ? (
                <p className="sr-only">Sin turnos</p>
              ) : (
                <ol>
                  {own.map((b) => {
                    const top = minutesFromStart(b.startsAt) * PX_PER_MINUTE;
                    const h =
                      (minutesFromStart(b.endsAt) - minutesFromStart(b.startsAt)) * PX_PER_MINUTE;
                    // Un turno corto entra en una sola línea; uno largo muestra el servicio debajo.
                    const compact = h < 48;
                    const service = serviceNames.get(b.serviceId) ?? 'Servicio';
                    return (
                      <li
                        key={b.id}
                        className="absolute inset-x-1 overflow-hidden rounded-lg border-l-4 border-brand bg-violet-50 px-2 py-1 text-sm dark:bg-violet-500/20"
                        style={{ top, height: Math.max(h - 2, 28) }}
                      >
                        <p className={compact ? 'truncate' : 'font-medium'}>
                          <span className="font-medium">
                            <time dateTime={b.startsAt}>{local(b.startsAt).toFormat('HH:mm')}</time>
                            –<time dateTime={b.endsAt}>{local(b.endsAt).toFormat('HH:mm')}</time>{' '}
                            {b.customer.name}
                          </span>
                          {compact && (
                            <span className="text-muted dark:text-slate-300"> · {service}</span>
                          )}
                        </p>
                        {!compact && (
                          <p className="truncate text-muted dark:text-slate-300">{service}</p>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
