import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiStatus } from './ApiStatus';

function renderStatus() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ApiStatus />
    </QueryClientProvider>,
  );
}

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

const healthy = {
  status: 'ok',
  version: '0.0.0',
  uptimeSeconds: 10,
  checks: { database: 'up', redis: 'up' },
};

afterEach(() => vi.unstubAllGlobals());

describe('ApiStatus', () => {
  it('muestra que la API funciona', async () => {
    mockFetch(200, healthy);
    renderStatus();
    expect(await screen.findByText('API funcionando')).toBeInTheDocument();
  });

  it('muestra qué dependencia está caída cuando la API responde 503', async () => {
    mockFetch(503, { ...healthy, status: 'degraded', checks: { database: 'up', redis: 'down' } });
    renderStatus();
    expect(await screen.findByText('API con problemas')).toBeInTheDocument();
    expect(screen.getByText('Caído')).toBeInTheDocument();
  });

  it('avisa cuando la API no responde', async () => {
    mockFetch(500, {});
    renderStatus();
    expect(await screen.findByText('La API no responde')).toBeInTheDocument();
  });
});
