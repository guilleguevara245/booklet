import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ana, mockApi, renderApp } from '../../test/render';

afterEach(() => vi.unstubAllGlobals());

const base = {
  businessId: 'b',
  locationId: 'l',
  staffId: 's',
  serviceId: 'v',
  customer: { name: 'Ana', email: 'ana@example.com', phone: null },
  cancelledAt: null,
  cancelReason: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  business: { name: 'Barbería Sur', slug: 'barberia-sur' },
  serviceName: 'Corte',
  staffName: 'Leo',
  locationName: 'Boedo',
  locationTimezone: 'America/Argentina/Buenos_Aires',
};
const upcoming = {
  ...base,
  id: 'futuro',
  startsAt: '2099-03-02T13:00:00.000Z', // 10:00 en Buenos Aires
  endsAt: '2099-03-02T13:30:00.000Z',
  status: 'confirmed',
};
const old = {
  ...base,
  id: 'pasado',
  startsAt: '2020-03-02T13:00:00.000Z',
  endsAt: '2020-03-02T13:30:00.000Z',
  status: 'confirmed',
};

describe('mis turnos', () => {
  it('separa los próximos del historial y muestra la hora del negocio', async () => {
    mockApi({
      'GET /auth/me': { status: 200, body: { user: ana, memberships: [] } },
      'GET /me/bookings': { status: 200, body: [old, upcoming] },
    });
    renderApp('/mis-turnos');
    const proximos = await screen.findByRole('region', { name: 'Próximos' });
    expect(within(proximos).getByText(/lunes 2 de marzo a las 10:00/)).toBeInTheDocument();
    expect(within(proximos).getByRole('link', { name: 'Barbería Sur' })).toHaveAttribute(
      'href',
      '/n/barberia-sur',
    );
    const historial = screen.getByRole('region', { name: 'Historial' });
    expect(
      within(historial).queryByRole('button', { name: 'Cancelar turno' }),
    ).not.toBeInTheDocument();
  });

  it('cancela un turno próximo después de confirmar', async () => {
    let cancelled = false;
    mockApi({
      'GET /auth/me': { status: 200, body: { user: ana, memberships: [] } },
      'GET /me/bookings': () => ({
        status: 200,
        body: [cancelled ? { ...upcoming, status: 'cancelled' } : upcoming],
      }),
      'POST /me/bookings/futuro/cancel': () => {
        cancelled = true;
        return { status: 200, body: { ...upcoming, status: 'cancelled' } };
      },
    });
    renderApp('/mis-turnos');
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar turno' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, cancelar' }));
    const historial = await screen.findByRole('region', { name: 'Historial' });
    await waitFor(() => expect(within(historial).getByText('Cancelado')).toBeInTheDocument());
    expect(screen.getByText('No tenés turnos próximos.')).toBeInTheDocument();
  });
});
