import type { Booking, Staff } from '@booklet/shared';
import { DateTime } from 'luxon';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { RescheduleForm } from '../../components/RescheduleForm';
import { Button, FormError } from '../../components/ui';
import { useCancelBooking, useRescheduleBooking, useRescheduleOptions } from '../../lib/business';

interface Props {
  businessId: string;
  booking: Booking;
  timezone: string;
  staff: Staff[];
  serviceName: string;
  onClose: () => void;
}

type Mode = 'details' | 'cancel' | 'reschedule';

/**
 * Detalle de un turno, con las acciones de cancelar y reprogramar. Usa `<dialog>` modal:
 * el navegador encierra el foco adentro y lo cierra con Escape.
 */
export function BookingDialog({
  businessId,
  booking,
  timezone,
  staff,
  serviceName,
  onClose,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [mode, setMode] = useState<Mode>('details');
  const local = (iso: string) => DateTime.fromISO(iso).setZone(timezone).setLocale('es-AR');
  const staffName = (id: string) => staff.find((s) => s.id === id)?.name ?? 'Profesional';

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl bg-white p-0 text-ink shadow-xl backdrop:bg-black/40 dark:bg-night dark:text-white"
    >
      <div className="flex flex-col gap-5 p-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-xl font-bold">
              {booking.customer.name}
            </h2>
            <p className="text-muted first-letter:uppercase dark:text-slate-300">
              {local(booking.startsAt).toFormat("cccc d 'de' LLLL, HH:mm")}–
              {local(booking.endsAt).toFormat('HH:mm')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Cerrar"
            className="inline-flex size-11 items-center justify-center rounded-lg text-xl hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand dark:hover:bg-white/10"
          >
            ×
          </button>
        </header>

        {mode === 'details' && (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted dark:text-slate-300">Servicio</dt>
              <dd>{serviceName}</dd>
              <dt className="text-muted dark:text-slate-300">Profesional</dt>
              <dd>{staffName(booking.staffId)}</dd>
              <dt className="text-muted dark:text-slate-300">Email</dt>
              <dd>
                <a className="underline" href={`mailto:${booking.customer.email}`}>
                  {booking.customer.email}
                </a>
              </dd>
              {booking.customer.phone && (
                <>
                  <dt className="text-muted dark:text-slate-300">Teléfono</dt>
                  <dd>
                    <a
                      className="underline"
                      href={`tel:${booking.customer.phone.replace(/[^\d+]/g, '')}`}
                    >
                      {booking.customer.phone}
                    </a>
                  </dd>
                </>
              )}
            </dl>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setMode('reschedule')}>
                Reprogramar
              </Button>
              <Button variant="danger" onClick={() => setMode('cancel')}>
                Cancelar turno
              </Button>
            </div>
          </>
        )}

        {mode === 'cancel' && (
          <CancelForm
            businessId={businessId}
            booking={booking}
            onBack={() => setMode('details')}
            onDone={() => ref.current?.close()}
          />
        )}

        {mode === 'reschedule' && (
          <PanelReschedule
            businessId={businessId}
            booking={booking}
            timezone={timezone}
            staffName={staffName}
            onBack={() => setMode('details')}
            onDone={() => ref.current?.close()}
          />
        )}
      </div>
    </dialog>
  );
}

interface StepProps {
  businessId: string;
  booking: Booking;
  onBack: () => void;
  onDone: () => void;
}

function CancelForm({ businessId, booking, onBack, onDone }: StepProps) {
  const cancel = useCancelBooking(businessId);
  const [reason, setReason] = useState('');
  const reasonId = useId();

  function submit(e: FormEvent) {
    e.preventDefault();
    cancel.mutate({ id: booking.id, reason }, { onSuccess: onDone });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p>¿Cancelar este turno? El horario queda libre para otra reserva.</p>
      <FormError>{cancel.error?.message}</FormError>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={reasonId} className="text-sm font-medium">
          Motivo (opcional)
        </label>
        <textarea
          id={reasonId}
          value={reason}
          maxLength={200}
          rows={2}
          onChange={(e) => setReason(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-white/20 dark:bg-white/5"
        />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onBack}>
          Volver
        </Button>
        <Button type="submit" variant="danger" disabled={cancel.isPending}>
          {cancel.isPending ? 'Cancelando…' : 'Sí, cancelar turno'}
        </Button>
      </div>
    </form>
  );
}

function PanelReschedule({
  businessId,
  booking,
  timezone,
  staffName,
  onBack,
  onDone,
}: StepProps & { timezone: string; staffName: (id: string) => string }) {
  const reschedule = useRescheduleBooking(businessId);
  return (
    <RescheduleForm
      startsAt={booking.startsAt}
      currentStaffId={booking.staffId}
      timezone={timezone}
      staffName={staffName}
      useOptions={(date) => useRescheduleOptions(businessId, booking.id, date)}
      onSubmit={(slot) =>
        reschedule.mutate(
          { id: booking.id, startsAt: slot.start, staffId: slot.staffId },
          { onSuccess: onDone },
        )
      }
      pending={reschedule.isPending}
      error={reschedule.error?.message}
      onBack={onBack}
    />
  );
}
