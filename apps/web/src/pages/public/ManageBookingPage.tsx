import { DateTime } from 'luxon';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { RescheduleForm } from '../../components/RescheduleForm';
import { Button, FormError } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { useManageAction, useManagedBooking, useManagedOptions } from '../../lib/auth';
import { useStaff } from '../../lib/business';
import { PublicLayout } from './PublicLayout';

type Mode = 'view' | 'cancel' | 'reschedule';

/** El link del mail: ver, cancelar o reprogramar un turno sin iniciar sesión. */
export function ManageBookingPage() {
  const { token = '' } = useParams();
  const booking = useManagedBooking(token);
  const action = useManageAction(token);
  const staff = useStaff(booking.data?.businessId ?? '');
  const [mode, setMode] = useState<Mode>('view');
  const [notice, setNotice] = useState<string | null>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  if (booking.isError) {
    const notFound = booking.error instanceof ApiError && booking.error.status === 404;
    return (
      <PublicLayout>
        <h1 className="text-2xl font-bold">
          {notFound ? 'No encontramos ese turno' : 'No pudimos cargar el turno'}
        </h1>
        <p className="mt-2 text-muted dark:text-slate-300">
          {notFound
            ? 'Revisá que el link del mail esté completo.'
            : 'Probá de nuevo en un momento.'}
        </p>
      </PublicLayout>
    );
  }
  if (booking.isPending) {
    return (
      <PublicLayout>
        <p role="status">Cargando…</p>
      </PublicLayout>
    );
  }

  const b = booking.data;
  const zone = b.locationTimezone;
  const when = DateTime.fromISO(b.startsAt).setZone(zone).setLocale('es-AR');
  const cancelled = b.status === 'cancelled';
  const past = new Date(b.startsAt) <= new Date();
  const staffName = (id: string) => staff.data?.find((s) => s.id === id)?.name ?? 'Profesional';

  return (
    <PublicLayout>
      <div className="flex flex-col gap-6">
        <header>
          <p className="text-sm font-medium text-brand-dark dark:text-violet-300">Tu turno</p>
          <h1 className="text-3xl font-bold">{b.business.name}</h1>
        </header>

        {notice && (
          <p
            ref={noticeRef}
            tabIndex={-1}
            role="status"
            className="rounded-xl bg-emerald-50 p-4 text-emerald-900 outline-none dark:bg-emerald-950/50 dark:text-emerald-200"
          >
            {notice}
          </p>
        )}

        <section
          aria-label="Detalle del turno"
          className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5"
        >
          {cancelled && (
            <span className="mb-2 self-start rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-white/10 dark:text-slate-200">
              Cancelado
            </span>
          )}
          <p className="text-lg font-medium first-letter:uppercase">
            <time dateTime={b.startsAt}>{when.toFormat("cccc d 'de' LLLL 'a las' HH:mm")}</time>
          </p>
          <p>
            {b.serviceName} con {b.staffName}
          </p>
          <p className="text-muted dark:text-slate-300">
            {[b.locationName, b.locationAddress].filter(Boolean).join(', ')}
          </p>
        </section>

        {!cancelled && !past && mode === 'view' && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setMode('reschedule')}>Cambiar día u horario</Button>
            <Button variant="secondary" onClick={() => setMode('cancel')}>
              Cancelar turno
            </Button>
          </div>
        )}

        {mode === 'cancel' && (
          <section aria-labelledby="cancelar" className="flex flex-col gap-3">
            <h2 id="cancelar" className="text-lg font-bold">
              ¿Cancelar el turno?
            </h2>
            <p>El horario queda libre para otra persona.</p>
            <FormError>{action.error?.message}</FormError>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="danger"
                disabled={action.isPending}
                onClick={() =>
                  action.mutate(
                    { action: 'cancel' },
                    {
                      onSuccess: () => {
                        setMode('view');
                        setNotice('Listo: cancelamos tu turno.');
                      },
                    },
                  )
                }
              >
                {action.isPending ? 'Cancelando…' : 'Sí, cancelar'}
              </Button>
              <Button variant="secondary" onClick={() => setMode('view')}>
                No, volver
              </Button>
            </div>
          </section>
        )}

        {mode === 'reschedule' && (
          <section aria-labelledby="cambiar" className="flex flex-col gap-3">
            <h2 id="cambiar" className="text-lg font-bold">
              Elegí el nuevo horario
            </h2>
            <RescheduleForm
              startsAt={b.startsAt}
              currentStaffId={b.staffId}
              timezone={zone}
              staffName={staffName}
              useOptions={(date) => useManagedOptions(token, date)}
              onSubmit={(slot) =>
                action.mutate(
                  { action: 'reschedule', startsAt: slot.start, staffId: slot.staffId },
                  {
                    onSuccess: () => {
                      setMode('view');
                      setNotice('Listo: cambiamos tu turno.');
                    },
                  },
                )
              }
              pending={action.isPending}
              error={action.error?.message}
              onBack={() => setMode('view')}
            />
          </section>
        )}

        <p className="text-sm text-muted dark:text-slate-300">
          <Link to={`/n/${b.business.slug}`} className="underline">
            Reservar otro turno en {b.business.name}
          </Link>
        </p>
      </div>
    </PublicLayout>
  );
}
