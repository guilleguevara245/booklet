import type { AuthResponse, Login, MeResponse, Register } from '@booklet/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';

export const meKey = ['me'] as const;

/** La persona con sesión y sus negocios, o `null` si no inició sesión. */
export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: async ({ signal }) => {
      try {
        return await api<MeResponse>('GET', '/auth/me', undefined, signal);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
  });
}

/** Inicia sesión o registra, y vuelve a pedir `/auth/me` para tener los negocios. */
function useStartSession<T>(path: string) {
  const queryClient = useQueryClient();
  return useMutation<AuthResponse, ApiError, T>({
    mutationFn: (body) => api<AuthResponse>('POST', path, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meKey }),
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
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    },
  });
}
