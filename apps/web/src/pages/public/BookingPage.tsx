import type { Location, Service } from '@booklet/shared';
import { useCallback, useId } from 'react';
import { DateTime } from 'luxon';
import { useParams, useSearchParams } from 'react-router';
import { ApiError } from '../../lib/api';
import { useLocations, usePublicBusiness, useServices, useStaff } from '../../lib/business';
import { formatDuration, formatPrice } from '../../lib/format';
import { OptionCard, Step } from '../../components/options';
import { PublicLayout } from './PublicLayout';
import { ANY, type SlotChoice, SlotPicker } from './SlotPicker';

/**
 * Página pública de reservas: `/n/:slug`. El estado de cada paso vive en la URL
 * (`?sucursal=…&servicio=…`), así un link compartido abre en el mismo punto.
 */
export function BookingPage() {
  const { slug = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const business = usePublicBusiness(slug);
  const id = business.data?.id ?? '';
  const locations = useLocations(id);
  const services = useServices(id);
  const staff = useStaff(id);

  const activeLocations = (locations.data ?? []).filter((l) => l.active);
  const activeServices = (services.data ?? []).filter((s) => s.active);
  const location =
    activeLocations.find((l) => l.id === params.get('sucursal')) ?? activeLocations[0];
  const service = activeServices.find((s) => s.id === params.get('servicio'));

  const update = useCallback(
    (changes: Record<string, string | null>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  // Cada parte de la elección vive en un parámetro de la dirección.
  const choice: SlotChoice = {
    staff: params.get('profesional') ?? ANY,
    from: params.get('desde'),
    day: params.get('dia'),
    start: params.get('hora'),
    with: params.get('con'),
  };
  const onChoice = useCallback(
    (c: Partial<SlotChoice>) => {
      const keys: Record<keyof SlotChoice, string> = {
        staff: 'profesional',
        from: 'desde',
        day: 'dia',
        start: 'hora',
        with: 'con',
      };
      update(
        Object.fromEntries(
          Object.entries(c).map(([k, v]) => [keys[k as keyof SlotChoice], v === ANY ? null : v]),
        ),
      );
    },
    [update],
  );
  const chosenStaff = staff.data?.find((s) => s.id === choice.with);

  if (business.isError) {
    const notFound = business.error instanceof ApiError && business.error.status === 404;
    return (
      <PublicLayout>
        <h1 className="text-2xl font-bold">
          {notFound ? 'No encontramos este negocio' : 'No pudimos cargar la página'}
        </h1>
        <p className="mt-2 text-muted dark:text-slate-300">
          {notFound
            ? 'Revisá que la dirección esté bien escrita.'
            : 'Probá de nuevo en un momento.'}
        </p>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      {business.isPending ? (
        <p role="status">Cargando…</p>
      ) : (
        <div className="flex flex-col gap-8">
          <header>
            <p className="text-sm font-medium text-brand-dark dark:text-violet-300">
              Reservá tu turno
            </p>
            <h1 className="text-3xl font-bold">{business.data.name}</h1>
            {location && activeLocations.length === 1 && (
              <p className="mt-1 text-muted dark:text-slate-300">
                {[location.name, location.address].filter(Boolean).join(' · ')}
              </p>
            )}
          </header>

          {activeLocations.length > 1 && (
            <LocationStep
              locations={activeLocations}
              value={location?.id}
              onChange={(sucursal) => update({ sucursal, dia: null, hora: null, con: null })}
            />
          )}

          {services.isSuccess && activeServices.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-muted dark:border-white/20 dark:text-slate-300">
              Este negocio todavía no publicó sus servicios.
            </p>
          ) : (
            <ServiceStep
              services={activeServices}
              value={service?.id}
              onChange={(servicio) =>
                update({ servicio, profesional: null, dia: null, hora: null })
              }
            />
          )}

          {!service && activeServices.length > 0 && (
            <p className="text-muted dark:text-slate-300">
              Elegí un servicio para ver los horarios.
            </p>
          )}

          {service && location && staff.data && (
            <SlotPicker
              key={`${service.id}:${location.id}`}
              businessId={id}
              service={service}
              location={location}
              staff={staff.data}
              choice={choice}
              onChange={onChoice}
            />
          )}

          {service && location && choice.start && chosenStaff && (
            <p role="status" className="rounded-xl bg-violet-50 p-4 dark:bg-violet-500/15">
              {service.name} con {chosenStaff.name},{' '}
              {DateTime.fromISO(choice.start)
                .setZone(location.timezone)
                .setLocale('es-AR')
                .toFormat("cccc d 'de' LLLL 'a las' HH:mm")}
              .
            </p>
          )}
        </div>
      )}
    </PublicLayout>
  );
}

function LocationStep({
  locations,
  value,
  onChange,
}: {
  locations: Location[];
  value?: string;
  onChange: (id: string) => void;
}) {
  const name = useId();
  return (
    <Step title="Sucursal">
      {locations.map((l) => (
        <OptionCard
          key={l.id}
          name={name}
          value={l.id}
          checked={l.id === value}
          onChange={onChange}
        >
          <span className="block font-medium">{l.name}</span>
          {l.address && (
            <span className="block text-sm text-muted dark:text-slate-300">{l.address}</span>
          )}
        </OptionCard>
      ))}
    </Step>
  );
}

function ServiceStep({
  services,
  value,
  onChange,
}: {
  services: Service[];
  value?: string;
  onChange: (id: string) => void;
}) {
  const name = useId();
  return (
    <Step title="Servicio">
      {services.map((s) => {
        const price = formatPrice(s.priceCents, s.currency);
        return (
          <OptionCard
            key={s.id}
            name={name}
            value={s.id}
            checked={s.id === value}
            onChange={onChange}
          >
            <span className="flex flex-wrap items-baseline justify-between gap-x-4">
              <span className="font-medium">{s.name}</span>
              {price && <span className="font-medium">{price}</span>}
            </span>
            <span className="block text-sm text-muted dark:text-slate-300">
              {formatDuration(s.durationMinutes)}
            </span>
          </OptionCard>
        );
      })}
    </Step>
  );
}
