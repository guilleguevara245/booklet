import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ana, mockApi, renderApp } from '../../test/render';
import { slugify } from './PanelHome';

const BIZ = '22222222-2222-4222-8222-222222222222';
const LOC = '33333333-3333-4333-8333-333333333333';
const SVC = '44444444-4444-4444-8444-444444444444';
const LEO = '55555555-5555-4555-8555-555555555555';
const MIA = '66666666-6666-4666-8666-666666666666';

const membership = { businessId: BIZ, slug: 'barberia', name: 'Barbería Sur', role: 'owner' };

function mockBusiness(bookings: unknown[] = []) {
  return mockApi({
    'GET /auth/me': { status: 200, body: { user: ana, memberships: [membership] } },
    [`GET /businesses/${BIZ}`]: {
      status: 200,
      body: { id: BIZ, slug: 'barberia', name: 'Barbería Sur' },
    },
    [`GET /businesses/${BIZ}/locations`]: {
      status: 200,
      body: [
        {
          id: LOC,
          businessId: BIZ,
          name: 'Boedo',
          address: null,
          timezone: 'America/Argentina/Buenos_Aires',
          active: true,
        },
      ],
    },
    [`GET /businesses/${BIZ}/staff`]: {
      status: 200,
      body: [
        { id: LEO, businessId: BIZ, name: 'Leo', active: true, serviceIds: [SVC], userId: null },
        { id: MIA, businessId: BIZ, name: 'Mia', active: true, serviceIds: [SVC], userId: null },
      ],
    },
    [`GET /businesses/${BIZ}/services`]: {
      status: 200,
      body: [
        {
          id: SVC,
          businessId: BIZ,
          name: 'Barba',
          durationMinutes: 30,
          bufferMinutes: 0,
          priceCents: 0,
          currency: 'ARS',
          active: true,
        },
      ],
    },
    [`GET /businesses/${BIZ}/bookings`]: { status: 200, body: bookings },
  });
}

const booking = {
  id: '77777777-7777-4777-8777-777777777777',
  businessId: BIZ,
  locationId: LOC,
  staffId: MIA,
  serviceId: SVC,
  customer: { name: 'Juana Pérez', email: 'juana@example.com', phone: null },
  startsAt: '2030-01-07T13:30:00.000Z', // 10:30 en Buenos Aires
  endsAt: '2030-01-07T14:00:00.000Z',
  status: 'confirmed',
  cancelledAt: null,
  cancelReason: null,
  createdAt: '2029-12-01T00:00:00.000Z',
};

afterEach(() => vi.unstubAllGlobals());

describe('panel', () => {
  it('con un solo negocio entra directo a su agenda', async () => {
    mockBusiness();
    const { router } = renderApp('/panel');
    await waitFor(() => expect(router.state.location.pathname).toBe(`/panel/${BIZ}`));
    expect(await screen.findByRole('heading', { name: 'Barbería Sur' })).toBeInTheDocument();
  });

  it('muestra cada turno en la columna de su profesional, en hora local', async () => {
    mockBusiness([booking]);
    renderApp(`/panel/${BIZ}?fecha=2030-01-07`);
    const mia = await screen.findByRole('region', { name: 'Turnos de Mia' });
    const item = (await within(mia).findByText(/Juana Pérez/)).closest('li')!;
    expect(item).toHaveTextContent('10:30–11:00 Juana Pérez · Barba');
    const leo = screen.getByRole('region', { name: 'Turnos de Leo' });
    expect(within(leo).getByText('Sin turnos')).toBeInTheDocument();
  });

  it('pide los turnos del día local completo y cambia de día', async () => {
    const fetchMock = mockBusiness();
    const { router } = renderApp(`/panel/${BIZ}?fecha=2030-01-07`);
    await screen.findByRole('region', { name: 'Turnos de Leo' });
    const bookingUrl = () =>
      fetchMock.mock.calls
        .map((c) => String(c[0]))
        .filter((u) => u.includes('/bookings?'))
        .at(-1)!;
    // Medianoche en Buenos Aires = 03:00 UTC.
    expect(decodeURIComponent(bookingUrl())).toContain('from=2030-01-07T03:00:00.000Z');
    expect(decodeURIComponent(bookingUrl())).toContain('to=2030-01-08T03:00:00.000Z');

    await userEvent.click(screen.getByRole('button', { name: 'Día siguiente' }));
    await waitFor(() => expect(router.state.location.search).toBe('?fecha=2030-01-08'));
    await waitFor(() =>
      expect(decodeURIComponent(bookingUrl())).toContain('from=2030-01-08T03:00'),
    );
  });

  it('sin negocios, ofrece crear uno y arma la dirección desde el nombre', async () => {
    let created = false;
    mockApi({
      'GET /auth/me': () => ({
        status: 200,
        body: { user: ana, memberships: created ? [membership] : [] },
      }),
      'POST /businesses': (body) => {
        created = true;
        expect(body).toEqual({ name: 'Peluquería Ñandú', slug: 'peluqueria-nandu' });
        return {
          status: 201,
          body: { id: BIZ, slug: 'peluqueria-nandu', name: 'Peluquería Ñandú' },
        };
      },
      [`GET /businesses/${BIZ}`]: { status: 200, body: { id: BIZ, name: 'Peluquería Ñandú' } },
      [`GET /businesses/${BIZ}/locations`]: { status: 200, body: [] },
      [`GET /businesses/${BIZ}/staff`]: { status: 200, body: [] },
      [`GET /businesses/${BIZ}/services`]: { status: 200, body: [] },
    });
    const { router } = renderApp('/panel');
    await userEvent.type(await screen.findByLabelText('Nombre del negocio'), 'Peluquería Ñandú');
    expect(screen.getByLabelText('Dirección')).toHaveValue('peluqueria-nandu');
    await userEvent.click(screen.getByRole('button', { name: 'Crear negocio' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/panel/${BIZ}`));
    expect(await screen.findByText(/no tiene sucursales/)).toBeInTheDocument();
  });
});

describe('slugify', () => {
  it('saca acentos, eñes y símbolos', () => {
    expect(slugify('  Café & Té — Ñuñoa  ')).toBe('cafe-te-nunoa');
  });
});
