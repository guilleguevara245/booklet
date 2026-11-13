import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BIZ, business, LOC2, location, services, staff, SVC } from '../../test/fixtures';
import { mockApi, renderApp } from '../../test/render';

afterEach(() => vi.unstubAllGlobals());

function mockPublic(extra: Record<string, { status: number; body?: unknown }> = {}) {
  return mockApi({
    'GET /auth/me': { status: 401, body: {} },
    'GET /businesses/by-slug/barberia-sur': { status: 200, body: business },
    [`GET /businesses/${BIZ}/locations`]: { status: 200, body: [location] },
    [`GET /businesses/${BIZ}/services`]: { status: 200, body: services },
    [`GET /businesses/${BIZ}/staff`]: { status: 200, body: staff },
    ...extra,
  });
}

describe('página pública de reservas', () => {
  it('muestra el negocio, su dirección y los servicios con duración y precio', async () => {
    mockPublic();
    renderApp('/n/barberia-sur');
    expect(await screen.findByRole('heading', { name: 'Barbería Sur' })).toBeInTheDocument();
    expect(await screen.findByText('Boedo · Av. Boedo 900')).toBeInTheDocument();
    const corte = screen.getByRole('radio', { name: /^Corte(?! y)/ });
    expect(corte.closest('label')).toHaveTextContent(/30 min/);
    expect(corte.closest('label')).toHaveTextContent(/\$\s15\.000/);
    // Sin precio cargado, no se muestra un precio.
    expect(
      screen.getByRole('radio', { name: /Corte y barba/ }).closest('label'),
    ).not.toHaveTextContent('$');
  });

  it('guarda el servicio elegido en la dirección', async () => {
    mockPublic();
    const { router } = renderApp('/n/barberia-sur');
    await userEvent.click(await screen.findByRole('radio', { name: /^Corte(?! y)/ }));
    await waitFor(() => expect(router.state.location.search).toBe(`?servicio=${SVC}`));
    expect(screen.getByRole('radio', { name: /^Corte(?! y)/ })).toBeChecked();
  });

  it('con varias sucursales, deja elegir una', async () => {
    mockPublic({
      [`GET /businesses/${BIZ}/locations`]: {
        status: 200,
        body: [location, { ...location, id: LOC2, name: 'Palermo', address: null }],
      },
    });
    renderApp('/n/barberia-sur');
    expect(await screen.findByRole('group', { name: 'Sucursal' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Boedo/ })).toBeChecked();
  });

  it('avisa si la dirección no existe', async () => {
    mockApi({
      'GET /auth/me': { status: 401, body: {} },
      'GET /businesses/by-slug/no-existe': {
        status: 404,
        body: { message: 'Negocio no encontrado' },
      },
    });
    renderApp('/n/no-existe');
    expect(
      await screen.findByRole('heading', { name: 'No encontramos este negocio' }),
    ).toBeInTheDocument();
  });
});
