import type { Location, Service } from '@booklet/shared';
import { type ReactNode, useId } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { ApiError } from '../../lib/api';
import { useLocations, usePublicBusiness, useServices } from '../../lib/business';
import { formatDuration, formatPrice } from '../../lib/format';
import { PublicLayout } from './PublicLayout';

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

  const activeLocations = (locations.data ?? []).filter((l) => l.active);
  const activeServices = (services.data ?? []).filter((s) => s.active);
  const location =
    activeLocations.find((l) => l.id === params.get('sucursal')) ?? activeLocations[0];
  const service = activeServices.find((s) => s.id === params.get('servicio'));

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };

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
              onChange={(sucursal) => update({ sucursal, dia: null, hora: null })}
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
        </div>
      )}
    </PublicLayout>
  );
}

/** Paso de un formulario: un grupo de opciones con su título. */
export function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 text-lg font-bold">{title}</legend>
      {children}
    </fieldset>
  );
}

/** Opción grande, con un radio real adentro: se elige con teclado y la leen los lectores. */
export function OptionCard({
  name,
  value,
  checked,
  onChange,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border bg-white p-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand dark:bg-white/5 ${checked ? 'border-brand ring-1 ring-brand' : 'border-slate-200 hover:border-slate-400 dark:border-white/15'}`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="mt-1 size-4 accent-brand"
      />
      <span className="flex-1">{children}</span>
    </label>
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
