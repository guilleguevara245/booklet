import type {
  AuthResponse,
  AvailableSlot,
  Booking,
  Login,
  MeResponse,
  MyBooking,
  Register,
} from '@booklet/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';

export const meKey = ['me'] as const;

async function fetchMe({ signal }: { signal?: AbortSignal }): Promise<MeResponse | null> {
  try {
    return await api<MeResponse>('GET', '/auth/me', undefined, signal);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

/** La persona con sesión y sus negocios, o `null` si no inició sesión. */
export function useMe() {
  return useQuery({ queryKey: meKey, queryFn: fetchMe, staleTime: 60_000 });
}

/**
 * Inicia sesión o registra, y vuelve a pedir `/auth/me` para tener los negocios. Se espera
 * esa respuesta antes de seguir: si no, el panel vería todavía "sin sesión" y mandaría de
 * vuelta a /entrar.
 */
function useStartSession<T>(path: string) {
  const queryClient = useQueryClient();
  return useMutation<AuthResponse, ApiError, T>({
    mutationFn: (body) => api<AuthResponse>('POST', path, body),
    // `fetchQuery` y no `refetchQueries`: si nadie pidió `/auth/me` todavía (se entró directo
    // a /entrar), igual queda en el caché antes de seguir.
    onSuccess: () => queryClient.fetchQuery({ queryKey: meKey, queryFn: fetchMe, staleTime: 0 }),
  });
}

export const useLogin = () => useStartSession<Login>('/auth/login');
export const useRegister = () => useStartSession<Register>('/auth/register');

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('POST', '/auth/logout'),
    onSuccess: () => {
      queryClient.setQueryData(meKey, null);
      // Se borra todo lo de la sesión anterior (incluidos sus turnos), menos el "sin sesión".
      queryClient.removeQueries({
        predicate: (q) => q.queryKey !== meKey && q.queryHash !== '["me"]',
      });
    },
  });
}

/** Turnos de la persona con sesión, en cualquier negocio. */
export function useMyBookings() {
  return useQuery({
    queryKey: ['me', 'bookings'],
    queryFn: ({ signal }) => api<MyBooking[]>('GET', '/me/bookings', undefined, signal),
  });
}

export function useCancelMyBooking() {
  const queryClient = useQueryClient();
  return useMutation<Booking, ApiError, string>({
    mutationFn: (id) => api<Booking>('POST', `/me/bookings/${id}/cancel`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me', 'bookings'] }),
  });
}

// --- Link "gestionar mi turno" de los mails (sin sesión, con el token) ---

export const manageKey = (token: string) => ['manage', token] as const;

export function useManagedBooking(token: string) {
  return useQuery({
    queryKey: manageKey(token),
    queryFn: ({ signal }) => api<MyBooking>('GET', `/manage/${token}`, undefined, signal),
    retry: (count, err) => (err as ApiError).status !== 404 && count < 2,
  });
}

export function useManagedOptions(token: string, date: string | null) {
  return useQuery({
    queryKey: [...manageKey(token), 'options', date],
    enabled: date !== null,
    queryFn: ({ signal }) =>
      api<AvailableSlot[]>('GET', `/manage/${token}/options?date=${date}`, undefined, signal),
  });
}

export function useManageAction(token: string) {
  const queryClient = useQueryClient();
  return useMutation<
    MyBooking,
    ApiError,
    { action: 'cancel' } | { action: 'reschedule'; startsAt: string; staffId: string }
  >({
    mutationFn: (input) =>
      input.action === 'cancel'
        ? api<MyBooking>('POST', `/manage/${token}/cancel`, {})
        : api<MyBooking>('POST', `/manage/${token}/reschedule`, {
            startsAt: input.startsAt,
            staffId: input.staffId,
          }),
    onSuccess: (booking) => queryClient.setQueryData(manageKey(token), booking),
  });
}
