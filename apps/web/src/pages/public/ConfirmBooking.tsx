import type { Booking, Location, Service, Staff } from '@booklet/shared';
import { DateTime } from 'luxon';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button, Field, FormError } from '../../components/ui';
import { useMe } from '../../lib/auth';
import { useCreateBooking } from '../../lib/business';
import { formatDuration, formatPrice } from '../../lib/format';
import { buildIcs } from '../../lib/ics';

interface Props {
  businessId: string;
  businessName: string;
  service: Service;
  location: Location;
  staff: Staff;
  start: string;
  /** El horario se ocupó mientras la persona completaba el formulario. */
  onSlotTaken: () => void;
  onBooked: (booking: Booking) => void;
}

const when = (iso: string, zone: string) =>
  DateTime.fromISO(iso).setZone(zone).setLocale('es-AR').toFormat("cccc d 'de' LLLL 'a las' HH:mm");

/** Último paso: datos de contacto y confirmar. Con sesión, se completan solos. */
export function ConfirmBooking(props: Props) {
  const { businessId, service, location, staff, start, onSlotTaken, onBooked } = props;
  const { data: me } = useMe();
  const create = useCreateBooking(businessId);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  // Con sesión, nombre y email salen de la cuenta (sin pisar lo que la persona ya escribió).
  useEffect(() => {
    if (me)
      setForm((f) => ({ ...f, name: f.name || me.user.name, email: f.email || me.user.email }));
  }, [me]);

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate(
      {
        serviceId: service.id,
        staffId: staff.id,
        locationId: location.id,
        startsAt: start,
        customer: { name: form.name, email: form.email, phone: form.phone.trim() || null },
      },
      {
        onSuccess: onBooked,
        onError: (err) => {
          if (err.status === 409) onSlotTaken();
        },
      },
    );
  }

  const price = formatPrice(service.priceCents, service.currency);
  const general =
    create.error && create.error.status !== 409 && create.error.issues.length === 0
      ? create.error.message
      : undefined;

  return (
    <section
      aria-labelledby="confirmar-titulo"
      className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5"
    >
      <h2 id="confirmar-titulo" className="text-lg font-bold">
        Tus datos
      </h2>
      <p className="rounded-xl bg-violet-50 p-4 dark:bg-violet-500/15">
        <span className="font-medium">
          {service.name} con {staff.name}
        </span>
        <span className="block first-letter:uppercase">{when(start, location.timezone)}</span>
        <span className="block text-sm text-muted dark:text-slate-300">
          {formatDuration(service.durationMinutes)}
          {price && ` · ${price}`} · {location.name}
        </span>
      </p>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FormError>{general}</FormError>
        <Field
          label="Nombre y apellido"
          autoComplete="name"
          required
          value={form.name}
          onChange={set('name')}
          error={create.error?.field('customer.name')}
        />
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={set('email')}
          hint="Por si el negocio necesita contactarte."
          error={create.error?.field('customer.email')}
        />
        <Field
          label="Teléfono (opcional)"
          type="tel"
          autoComplete="tel"
          value={form.phone}
          onChange={set('phone')}
          error={create.error?.field('customer.phone')}
        />
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Reservando…' : 'Confirmar turno'}
        </Button>
      </form>
    </section>
  );
}

/** Pantalla final: el turno quedó reservado. */
export function BookingConfirmed({
  booking,
  businessName,
  service,
  location,
  staff,
  onAnother,
}: {
  booking: Booking;
  businessName: string;
  service: Service;
  location: Location;
  staff: Staff;
  onAnother: () => void;
}) {
  const { data: me } = useMe();
  const heading = useRef<HTMLHeadingElement>(null);
  // El foco va al título, así los lectores de pantalla anuncian que terminó.
  useEffect(() => heading.current?.focus(), []);

  // Un data URL y no un blob: no hay que liberarlo, y sigue valiendo aunque React monte
  // el componente dos veces en desarrollo.
  const icsUrl = useMemo(() => {
    const ics = buildIcs({
      uid: booking.id,
      title: `${service.name} en ${businessName}`,
      start: booking.startsAt,
      end: booking.endsAt,
      location: [location.name, location.address].filter(Boolean).join(', '),
      description: `Con ${staff.name}. Reservado con Booklet.`,
    });
    return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
  }, [booking, businessName, service, location, staff]);

  const linkClass =
    'inline-flex min-h-11 items-center justify-center rounded-lg px-4 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';

  return (
    <section className="flex flex-col items-start gap-4 rounded-2xl border border-emerald-200 bg-white p-6 dark:border-emerald-500/30 dark:bg-white/5">
      <h2 ref={heading} tabIndex={-1} className="text-2xl font-bold outline-none">
        ¡Listo! Tu turno quedó reservado
      </h2>
      <p>
        <span className="font-medium">
          {service.name} con {staff.name}
        </span>
        <span className="block first-letter:uppercase">
          {when(booking.startsAt, location.timezone)}
        </span>
        <span className="block text-muted dark:text-slate-300">
          {businessName} · {[location.name, location.address].filter(Boolean).join(', ')}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          href={icsUrl}
          download="turno.ics"
          className={`${linkClass} bg-brand text-white hover:bg-brand-dark`}
        >
          Agregar al calendario
        </a>
        {me && (
          <Link
            to="/mis-turnos"
            className={`${linkClass} border border-slate-300 hover:bg-slate-50 dark:border-white/20 dark:hover:bg-white/10`}
          >
            Ver mis turnos
          </Link>
        )}
        <Button variant="secondary" onClick={onAnother}>
          Reservar otro turno
        </Button>
      </div>
    </section>
  );
}
