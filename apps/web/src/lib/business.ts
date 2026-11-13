import type {
  AvailabilityResponse,
  AvailableSlot,
  Booking,
  Business,
  CreateBooking,
  CreatedBooking,
  CreateBusiness,
  Location,
  MeResponse,
  Service,
  Staff,
} from '@booklet/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { api, type ApiError } from './api';
import { meKey } from './auth';

// Consultas del panel. Las claves empiezan por el id del negocio para poder invalidar
// todo lo de un negocio de una vez.

export const businessKeys = {
  all: (id: string) => ['business', id] as const,
  bookings: (id: string) => ['business', id, 'bookings'] as const,
  day: (id: string, from: string, to: string) => ['business', id, 'bookings', from, to] as const,
};

export function useBusiness(id: string) {
  return useQuery({
    queryKey: [...businessKeys.all(id), 'info'],
    queryFn: ({ signal }) => api<Business>('GET', `/businesses/${id}`, undefined, signal),
  });
}

/** Negocio por su dirección pública, para la página de reservas. */
export function usePublicBusiness(slug: string) {
  return useQuery({
    queryKey: ['public-business', slug],
    queryFn: ({ signal }) =>
      api<Business>('GET', `/businesses/by-slug/${encodeURIComponent(slug)}`, undefined, signal),
    retry: (count, err) => (err as ApiError).status !== 404 && count < 2,
  });
}

export function useLocations(id: string) {
  return useQuery({
    enabled: id !== '',
    queryKey: [...businessKeys.all(id), 'locations'],
    queryFn: ({ signal }) =>
      api<Location[]>('GET', `/businesses/${id}/locations`, undefined, signal),
  });
}

export function useStaff(id: string) {
  return useQuery({
    enabled: id !== '',
    queryKey: [...businessKeys.all(id), 'staff'],
    queryFn: ({ signal }) => api<Staff[]>('GET', `/businesses/${id}/staff`, undefined, signal),
  });
}

export function useServices(id: string) {
  return useQuery({
    enabled: id !== '',
    queryKey: [...businessKeys.all(id), 'services'],
    queryFn: ({ signal }) => api<Service[]>('GET', `/businesses/${id}/services`, undefined, signal),
  });
}

/** Límites de un día local, en UTC, para pedir los turnos de ese día. */
export function dayRange(date: string, timezone: string) {
  const start = DateTime.fromISO(date, { zone: timezone }).startOf('day');
  return { from: start.toUTC().toISO()!, to: start.plus({ days: 1 }).toUTC().toISO()! };
}

/** Turnos confirmados de un día. */
export function useDayBookings(businessId: string, range: { from: string; to: string } | null) {
  return useQuery({
    queryKey: businessKeys.day(businessId, range?.from ?? '', range?.to ?? ''),
    enabled: range !== null,
    queryFn: ({ signal }) => {
      const q = new URLSearchParams({ from: range!.from, to: range!.to, status: 'confirmed' });
      return api<Booking[]>('GET', `/businesses/${businessId}/bookings?${q}`, undefined, signal);
    },
  });
}

export function useCreateBusiness() {
  const queryClient = useQueryClient();
  return useMutation<Business, ApiError, CreateBusiness>({
    mutationFn: (body) => api<Business>('POST', '/businesses', body),
    onSuccess: (business) =>
      queryClient.setQueryData<MeResponse | null>(meKey, (me) =>
        me
          ? {
              ...me,
              memberships: [
                ...me.memberships,
                {
                  businessId: business.id,
                  slug: business.slug,
                  name: business.name,
                  role: 'owner',
                },
              ],
            }
          : me,
      ),
  });
}

/** Horarios libres para mover un turno en un día local. */
export function useRescheduleOptions(businessId: string, bookingId: string, date: string | null) {
  return useQuery({
    queryKey: [...businessKeys.bookings(businessId), 'options', bookingId, date],
    enabled: date !== null,
    queryFn: ({ signal }) =>
      api<AvailableSlot[]>(
        'GET',
        `/businesses/${businessId}/bookings/${bookingId}/reschedule-options?date=${date}`,
        undefined,
        signal,
      ),
  });
}

export function useCancelBooking(businessId: string) {
  const queryClient = useQueryClient();
  return useMutation<Booking, ApiError, { id: string; reason?: string }>({
    mutationFn: ({ id, reason }) =>
      api<Booking>('POST', `/businesses/${businessId}/bookings/${id}/cancel`, {
        reason: reason?.trim() || null,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: businessKeys.bookings(businessId) }),
  });
}

export function useRescheduleBooking(businessId: string) {
  const queryClient = useQueryClient();
  return useMutation<Booking, ApiError, { id: string; startsAt: string; staffId: string }>({
    mutationFn: ({ id, startsAt, staffId }) =>
      api<Booking>('POST', `/businesses/${businessId}/bookings/${id}/reschedule`, {
        startsAt,
        staffId,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: businessKeys.bookings(businessId) }),
  });
}

/** Turnos libres de un servicio en un rango de días locales. */
export function useAvailability(
  businessId: string,
  q: { serviceId: string; locationId: string; staffId?: string; from: string; to: string } | null,
) {
  return useQuery({
    queryKey: ['availability', businessId, q],
    enabled: q !== null && businessId !== '',
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        serviceId: q!.serviceId,
        locationId: q!.locationId,
        from: q!.from,
        to: q!.to,
      });
      if (q!.staffId) params.set('staffId', q!.staffId);
      return api<AvailabilityResponse>(
        'GET',
        `/businesses/${businessId}/availability?${params}`,
        undefined,
        signal,
      );
    },
  });
}

/** Reservar un turno desde la página pública. Con sesión, el turno queda en la cuenta. */
export function useCreateBooking(businessId: string) {
  const queryClient = useQueryClient();
  return useMutation<CreatedBooking, ApiError, CreateBooking>({
    mutationFn: (body) => api<CreatedBooking>('POST', `/businesses/${businessId}/bookings`, body),
    // Lo que se reservó (o lo que otra persona tomó, si dio 409) cambia la disponibilidad.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['availability', businessId] }),
  });
}
