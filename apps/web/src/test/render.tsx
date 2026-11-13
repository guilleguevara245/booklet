import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { routes } from '../routes';

type Handler = (body: unknown) => { status: number; body?: unknown };

/**
 * Reemplaza `fetch` por respuestas armadas a mano, por método y ruta
 * (`'GET /auth/me'`). Devuelve el mock para revisar qué se pidió.
 */
export function mockApi(handlers: Record<string, Handler | { status: number; body?: unknown }>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const key = `${init?.method ?? 'GET'} ${url.pathname.replace(/^\/api/, '')}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`Pedido sin respuesta armada: ${key}`);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const res = typeof handler === 'function' ? handler(body) : handler;
    return new Response(res.body === undefined ? null : JSON.stringify(res.body), {
      status: res.status,
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Renderiza la app completa en una ruta, con su propio caché de consultas. */
export function renderApp(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient };
}

export const ana = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ana@example.com',
  name: 'Ana',
  emailVerified: false,
  hasPassword: true,
  hasGoogle: false,
};
