import type { AvailableSlot } from '@booklet/shared';
import type { UseQueryResult } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { type FormEvent, useId, useState } from 'react';
import { Button, FormError } from './ui';

interface Props {
  startsAt: string;
  currentStaffId: string;
  timezone: string;
  staffName: (id: string) => string;
  /** Hook que trae los horarios libres de un día (del panel o del link del mail). */
  useOptions: (date: string | null) => UseQueryResult<AvailableSlot[], Error>;
  onSubmit: (slot: AvailableSlot) => void;
  pending: boolean;
  error?: string;
  onBack: () => void;
}

/**
 * Elegir día y horario para mover un turno, con los horarios agrupados por profesional
 * (el actual primero). Lo usan el panel y la página del link del mail.
 */
export function RescheduleForm({
  startsAt,
  currentStaffId,
  timezone,
  staffName,
  useOptions,
  onSubmit,
  pending,
  error,
  onBack,
}: Props) {
  const local = (iso: string) => DateTime.fromISO(iso).setZone(timezone);
  const [date, setDate] = useState(local(startsAt).toISODate()!);
  const [chosen, setChosen] = useState<AvailableSlot | null>(null);
  const options = useOptions(date || null);
  const dateId = useId();

  const groups = new Map<string, AvailableSlot[]>();
  for (const slot of options.data ?? []) {
    groups.set(slot.staffId, [...(groups.get(slot.staffId) ?? []), slot]);
  }
  const staffIds = [...groups.keys()].sort((a, b) =>
    a === currentStaffId ? -1 : b === currentStaffId ? 1 : staffName(a).localeCompare(staffName(b)),
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    if (chosen) onSubmit(chosen);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={dateId} className="text-sm font-medium">
          Nuevo día
        </label>
        <input
          id={dateId}
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setChosen(null);
          }}
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-2 dark:border-white/20 dark:bg-white/5"
        />
      </div>
      <FormError>{error ?? (options.isError ? options.error.message : undefined)}</FormError>
      {options.isPending ? (
        <p role="status" className="text-sm text-muted dark:text-slate-300">
          Buscando horarios…
        </p>
      ) : staffIds.length === 0 ? (
        <p className="text-sm text-muted dark:text-slate-300">No hay horarios libres ese día.</p>
      ) : (
        <div className="flex max-h-72 flex-col gap-4 overflow-y-auto">
          {staffIds.map((id) => (
            <fieldset key={id}>
              <legend className="mb-2 text-sm font-medium">{staffName(id)}</legend>
              <div className="flex flex-wrap gap-2">
                {groups.get(id)!.map((slot) => {
                  const selected = chosen?.start === slot.start && chosen.staffId === slot.staffId;
                  return (
                    <button
                      key={slot.start}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setChosen(slot)}
                      className={`min-h-11 min-w-16 rounded-lg border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-brand ${selected ? 'border-brand bg-brand text-white' : 'border-slate-300 hover:border-brand dark:border-white/20'}`}
                    >
                      {local(slot.start).toFormat('HH:mm')}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onBack}>
          Volver
        </Button>
        <Button type="submit" disabled={!chosen || pending}>
          {chosen
            ? `Mover a las ${local(chosen.start).toFormat('HH:mm')} con ${staffName(chosen.staffId)}`
            : 'Elegí un horario'}
        </Button>
      </div>
    </form>
  );
}
