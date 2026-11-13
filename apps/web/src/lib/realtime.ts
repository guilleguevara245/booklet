import type {
  Booking,
  BookingEventName,
  ClientToServerEvents,
  ServerToClientEvents,
} from '@booklet/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL } from './api';
import { businessKeys } from './business';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Un solo socket para toda la web. Con la API en otro dominio se conecta a ese origen;
 * en desarrollo, Vite redirige `/socket.io` a la API local.
 */
let shared: AppSocket | undefined;
function getSocket(): AppSocket {
  if (!shared) {
    const target = API_URL.startsWith('http') ? new URL(API_URL).origin : undefined;
    // WebSocket directo; si una red lo bloquea, cae a long polling.
    const options = {
      withCredentials: true,
      autoConnect: false,
      transports: ['websocket', 'polling'],
      tryAllTransports: true,
    };
    shared = target ? io(target, options) : io(options);
  }
  return shared;
}

/** Para las pruebas: descarta el socket compartido. */
export function resetSocket() {
  shared?.disconnect();
  shared = undefined;
}

export type LiveStatus = 'connecting' | 'live' | 'offline';

export interface LiveNotice {
  id: number;
  type: BookingEventName;
  booking: Booking;
}

const EVENTS: BookingEventName[] = ['booking.created', 'booking.cancelled', 'booking.rescheduled'];

/**
 * Mantiene la agenda de un negocio al día: escucha los cambios de turnos y vuelve a pedir
 * los turnos cuando llega uno. Al reconectar, también los vuelve a pedir por si se perdió
 * algún aviso mientras estaba desconectado.
 */
export function useBusinessLive(businessId: string) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [notice, setNotice] = useState<LiveNotice | null>(null);

  useEffect(() => {
    const socket = getSocket();
    let counter = 0;
    const refresh = () =>
      queryClient.invalidateQueries({ queryKey: businessKeys.bookings(businessId) });

    const onConnect = () => {
      socket.emit('join', businessId, (result) => {
        setStatus(result.ok ? 'live' : 'offline');
        if (result.ok) void refresh();
      });
    };
    const onDisconnect = () => setStatus('connecting');
    const onError = () => setStatus('offline');
    const handlers = EVENTS.map((type) => {
      const handler = (booking: Booking) => {
        if (booking.businessId !== businessId) return;
        void refresh();
        setNotice({ id: ++counter, type, booking });
      };
      socket.on(type, handler);
      return [type, handler] as const;
    });

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onError);
    if (socket.connected) onConnect();
    else socket.connect();

    return () => {
      // Solo si ya está conectado: un `leave` en cola saldría después del `join` siguiente
      // (pasa en desarrollo, cuando React monta el efecto dos veces).
      if (socket.connected) socket.emit('leave', businessId);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onError);
      for (const [type, handler] of handlers) socket.off(type, handler);
    };
  }, [businessId, queryClient]);

  return { status, notice };
}
