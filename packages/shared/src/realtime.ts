import type { Booking } from './bookings.js';

// Eventos en tiempo real del panel (Socket.IO).

/** Lo que el servidor avisa a los miembros de un negocio. */
export interface ServerToClientEvents {
  'booking.created': (booking: Booking) => void;
  'booking.cancelled': (booking: Booking) => void;
  'booking.rescheduled': (booking: Booking) => void;
}

export type JoinResult = { ok: true } | { ok: false; error: string };

/** Lo que el panel le pide al servidor. */
export interface ClientToServerEvents {
  /** Empieza a recibir los avisos de un negocio. Hay que ser dueño o staff. */
  join: (businessId: string, ack: (result: JoinResult) => void) => void;
  leave: (businessId: string) => void;
}

export type BookingEventName = keyof ServerToClientEvents;
