import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderApp } from '../../test/render';

afterEach(() => vi.unstubAllGlobals());

const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345';
const booking = {
  id: 't1',
  businessId: 'b1',
  locationId: 'l1',
  staffId: 's1',
  serviceId: 'v1',
  customer: { name: 'Juana', email: 'juana@example.com', phone: null },
  startsAt: '2099-03-02T13:00:00.000Z',
  endsAt: '2099-03-02T13:30:00.000Z',
  status: 'confirmed',
  cancelledAt: null,
  cancelReason: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  business: { name: 'Barbería Sur', slug: 'barberia-sur' },
  serviceName: 'Corte',
  staffName: 'Leo',
  locationName: 'Boedo',
  locationAddress: 'Av. Boedo 900',
  locationTimezone: 'America/Argentina/Buenos_Aires',
};

function mockManage(extra = {}) {
  return mockApi({
    'GET /auth/me': { status: 401, body: {} },
    [`GET /manage/${TOKEN}`]: { status: 200, body: booking },
    'GET /businesses/b1/staff': { status: 200, body: [] },
    ...extra,
  });
}

describe('link para gestionar el turno', () => {
  it('muestra el turno sin iniciar sesión', async () => {
    mockManage();
    renderApp(`/turno/${TOKEN}`);
    expect(await screen.findByRole('heading', { name: 'Barbería Sur' })).toBeInTheDocument();
    const detalle = screen.getByRole('region', { name: 'Detalle del turno' });
    expect(detalle).toHaveTextContent('lunes 2 de marzo a las 10:00');
    expect(detalle).toHaveTextContent('Corte con Leo');
    expect(detalle).toHaveTextContent('Boedo, Av. Boedo 900');
  });

  it('cancela y lo confirma en pantalla', async () => {
    mockManage({
      [`POST /manage/${TOKEN}/cancel`]: { status: 200, body: { ...booking, status: 'cancelled' } },
    });
    renderApp(`/turno/${TOKEN}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar turno' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, cancelar' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Listo: cancelamos tu turno.');
    expect(screen.getByText('Cancelado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar turno' })).not.toBeInTheDocument();
  });

  it('avisa si el link no corresponde a ningún turno', async () => {
    mockApi({
      'GET /auth/me': { status: 401, body: {} },
      [`GET /manage/${TOKEN}`]: { status: 404, body: { message: 'No encontramos ese turno.' } },
    });
    renderApp(`/turno/${TOKEN}`);
    expect(
      await screen.findByRole('heading', { name: 'No encontramos ese turno' }),
    ).toBeInTheDocument();
  });
});
