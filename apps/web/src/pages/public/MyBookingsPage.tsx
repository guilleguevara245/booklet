import type { MyBooking } from '@booklet/shared';
import { DateTime } from 'luxon';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button, FormError } from '../../components/ui';
import { useCancelMyBooking, useMyBookings } from '../../lib/auth';
import { PublicLayout } from './PublicLayout';

/** Los turnos de la persona en todos los negocios: próximos arriba, después el historial. */
export function MyBookingsPage() {
  const bookings = useMyBookings();
  const now = new Date().toISOString();
  const all = bookings.data ?? [];
  const upcoming = all
    .filter((b) => b.status === 'confirmed' && b.startsAt > now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = all.filter((b) => !upcoming.includes(b));

  return (
    <PublicLayout>
      <h1 className="mb-6 text-3xl font-bold">Mis turnos</h1>
      {bookings.isPending ? (
        <p role="status">Cargando…</p>
      ) : bookings.isError ? (
        <p role="alert">No pudimos cargar tus turnos. Probá de nuevo.</p>
      ) : all.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-muted dark:border-white/20 dark:text-slate-300">
          Todavía no tenés turnos. Cuando reserves con tu cuenta, van a aparecer acá.
        </p>
      ) : (
        <div className="flex flex-col gap-10">
          <section aria-labelledby="proximos">
            <h2 id="proximos" className="mb-3 text-xl font-bold">
              Próximos
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-muted dark:text-slate-300">No tenés turnos próximos.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {upcoming.map((b) => (
                  <BookingItem key={b.id} booking={b} cancellable />
                ))}
              </ul>
            )}
          </section>
          {past.length > 0 && (
            <section aria-labelledby="historial">
              <h2 id="historial" className="mb-3 text-xl font-bold">
                Historial
              </h2>
              <ul className="flex flex-col gap-3">
                {past.map((b) => (
                  <BookingItem key={b.id} booking={b} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </PublicLayout>
  );
}

function BookingItem({
  booking: b,
  cancellable = false,
}: {
  booking: MyBooking;
  cancellable?: boolean;
}) {
  const cancel = useCancelMyBooking();
  const [confirming, setConfirming] = useState(false);
  const when = DateTime.fromISO(b.startsAt)
    .setZone(b.locationTimezone)
    .setLocale('es-AR')
    .toFormat("cccc d 'de' LLLL 'a las' HH:mm");
  const cancelled = b.status === 'cancelled';

  return (
    <li
      className={`rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5 ${cancelled ? 'opacity-75' : ''}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            {b.serviceName} en{' '}
            <Link to={`/n/${b.business.slug}`} className="underline">
              {b.business.name}
            </Link>
          </p>
          <p className="first-letter:uppercase">
            <time dateTime={b.startsAt}>{when}</time>
          </p>
          <p className="text-sm text-muted dark:text-slate-300">
            Con {b.staffName} · {b.locationName}
          </p>
        </div>
        {cancelled && (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-white/10 dark:text-slate-200">
            Cancelado
          </span>
        )}
      </div>
      {cancellable && (
        <div className="mt-3 flex flex-col gap-2">
          <FormError>{cancel.error?.message}</FormError>
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">¿Cancelar este turno?</span>
              <Button
                variant="danger"
                onClick={() => cancel.mutate(b.id)}
                disabled={cancel.isPending}
              >
                {cancel.isPending ? 'Cancelando…' : 'Sí, cancelar'}
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                No
              </Button>
            </div>
          ) : (
            <Button variant="secondary" className="self-start" onClick={() => setConfirming(true)}>
              Cancelar turno
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
