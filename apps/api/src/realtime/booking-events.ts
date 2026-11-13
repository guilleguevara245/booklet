import { Injectable } from '@nestjs/common';
import type { Booking, BookingEventName } from '@booklet/shared';
import { Subject } from 'rxjs';

export interface BookingEvent {
  type: BookingEventName;
  booking: Booking;
}

/**
 * Canal interno de cambios en turnos. El servicio de reservas publica acá cuando un cambio
 * ya quedó guardado, y el gateway de tiempo real lo reenvía a los paneles conectados.
 */
@Injectable()
export class BookingEvents {
  private readonly subject = new Subject<BookingEvent>();
  readonly events$ = this.subject.asObservable();

  publish(type: BookingEventName, booking: Booking): void {
    this.subject.next({ type, booking });
  }
}
