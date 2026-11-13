import { z } from 'zod';

// Esquemas de los turnos: reservar, listar, cancelar y reprogramar.

const id = z.uuid({ error: 'Debe ser un UUID' });
const instant = z.iso.datetime({ offset: true, error: 'Fecha y hora ISO 8601 con zona' });

export const customerSchema = z.object({
  name: z.string().trim().min(1, 'No puede estar vacío').max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'Email inválido' }).max(200)),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s()-]{6,25}$/, 'Teléfono inválido')
    .nullish(),
});
export type Customer = z.infer<typeof customerSchema>;

export const createBookingSchema = z.object({
  serviceId: id,
  staffId: id,
  locationId: id,
  /** Uno de los horarios que devuelve la consulta de disponibilidad. */
  startsAt: instant,
  customer: customerSchema,
});
export type CreateBooking = z.infer<typeof createBookingSchema>;

export const bookingStatusSchema = z.enum(['confirmed', 'cancelled']);
export type BookingStatus = z.infer<typeof bookingStatusSchema>;

export const listBookingsQuerySchema = z.object({
  from: instant.optional(),
  to: instant.optional(),
  staffId: id.optional(),
  status: bookingStatusSchema.optional(),
});
export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;

export interface Booking {
  id: string;
  businessId: string;
  locationId: string;
  staffId: string;
  serviceId: string;
  customer: { name: string; email: string; phone: string | null };
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
}

export const cancelBookingSchema = z
  .object({ reason: z.string().trim().max(200).nullish() })
  .default({});
export type CancelBooking = z.infer<typeof cancelBookingSchema>;

/** Mueve un turno a otro horario y, opcionalmente, a otro profesional o sucursal. */
export const rescheduleBookingSchema = z.object({
  startsAt: instant,
  staffId: id.optional(),
  locationId: id.optional(),
});
export type RescheduleBooking = z.infer<typeof rescheduleBookingSchema>;

/** Un turno visto por quien lo reservó, con los nombres para mostrarlo. */
export interface MyBooking extends Booking {
  business: { name: string; slug: string };
  serviceName: string;
  staffName: string;
  locationName: string;
  locationAddress: string | null;
  /** Zona horaria de la sucursal, para mostrar el horario como lo ve el negocio. */
  locationTimezone: string;
}

/** Horarios a los que se puede mover un turno, en un día local de su sucursal. */
export const rescheduleOptionsQuerySchema = z.object({
  date: z.iso.date({ error: 'Formato YYYY-MM-DD' }),
});
export type RescheduleOptionsQuery = z.infer<typeof rescheduleOptionsQuerySchema>;

/** Respuesta al reservar: incluye, una sola vez, el token del link para gestionar el turno. */
export interface CreatedBooking extends Booking {
  manageToken: string;
}
