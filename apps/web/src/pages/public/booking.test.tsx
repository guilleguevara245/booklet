import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BIZ, business, LEO, LOC2, location, MIA, services, staff, SVC } from '../../test/fixtures';
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

describe('elegir día y horario', () => {
  // Lunes 7 de enero de 2030, 9:00 en Buenos Aires.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-01-07T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  const slot = (iso: string, staffId: string) => ({
    start: iso,
    end: iso,
    staffId,
    locationId: location.id,
  });

  /** Disponibilidad armada a mano: el martes 8 hay lugar; el resto de la semana, no. */
  function mockWithSlots() {
    const fetchMock = mockPublic();
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname.endsWith('/availability')) {
        const onlyMia = url.searchParams.get('staffId') === MIA;
        const slots = [
          slot('2030-01-08T13:00:00.000Z', LEO), // 10:00
          slot('2030-01-08T13:00:00.000Z', MIA), // 10:00 también con Mia
          slot('2030-01-08T14:30:00.000Z', MIA), // 11:30
        ].filter((s) => !onlyMia || s.staffId === MIA);
        return new Response(JSON.stringify({ serviceId: SVC, from: '', to: '', slots }));
      }
      return original(input, init);
    });
    return fetchMock;
  }

  const availabilityUrls = (fetchMock: ReturnType<typeof mockApi>) =>
    fetchMock.mock.calls
      .map((c) => new URL(String(c[0]), 'http://localhost'))
      .filter((u) => u.pathname.endsWith('/availability'));

  it('pide la semana entera, deshabilita los días sin lugar y elige el primero con lugar', async () => {
    const fetchMock = mockWithSlots();
    renderApp(`/n/barberia-sur?servicio=${SVC}`);

    const martes = await screen.findByRole('button', { name: 'martes 8 de enero' });
    await waitFor(() => expect(martes).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByRole('button', { name: 'lunes 7 de enero, sin horarios' })).toBeDisabled();

    const url = availabilityUrls(fetchMock).at(-1)!;
    expect(url.searchParams.get('from')).toBe('2030-01-07');
    expect(url.searchParams.get('to')).toBe('2030-01-13');
    expect(url.searchParams.get('locationId')).toBe(location.id);
    expect(url.searchParams.has('staffId')).toBe(false);

    // Con "cualquiera", las 10:00 aparecen una sola vez aunque estén libres con dos personas.
    expect(screen.getAllByRole('button', { name: '10:00' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: '11:30' }));
    const datos = await screen.findByRole('region', { name: 'Tus datos' });
    expect(datos).toHaveTextContent('Corte con Mia');
    expect(datos).toHaveTextContent('martes 8 de enero a las 11:30');
  });

  it('filtra por profesional', async () => {
    const fetchMock = mockWithSlots();
    renderApp(`/n/barberia-sur?servicio=${SVC}`);
    await userEvent.click(await screen.findByRole('radio', { name: 'Mia' }));
    await waitFor(() =>
      expect(availabilityUrls(fetchMock).at(-1)!.searchParams.get('staffId')).toBe(MIA),
    );
  });

  it('pasa a la semana siguiente y no deja volver antes de hoy', async () => {
    const fetchMock = mockWithSlots();
    const { router } = renderApp(`/n/barberia-sur?servicio=${SVC}`);
    expect(await screen.findByRole('button', { name: 'Semana anterior' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Semana siguiente' }));
    await waitFor(() => expect(router.state.location.search).toContain('desde=2030-01-14'));
    await waitFor(() =>
      expect(availabilityUrls(fetchMock).at(-1)!.searchParams.get('from')).toBe('2030-01-14'),
    );
    expect(screen.getByText(/No hay horarios libres esta semana/)).toBeInTheDocument();
  });
});

describe('confirmar la reserva', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-01-07T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  const START = '2030-01-08T13:00:00.000Z';
  const url = `/n/barberia-sur?servicio=${SVC}&dia=2030-01-08&hora=${encodeURIComponent(START)}&con=${LEO}`;
  const created = {
    id: '77777777-7777-4777-8777-777777777777',
    businessId: BIZ,
    locationId: location.id,
    staffId: LEO,
    serviceId: SVC,
    customer: { name: 'Juana Pérez', email: 'juana@example.com', phone: null },
    startsAt: START,
    endsAt: '2030-01-08T13:30:00.000Z',
    status: 'confirmed',
    cancelledAt: null,
    cancelReason: null,
    createdAt: '2030-01-07T12:00:00.000Z',
  };

  function mockBooking(post: { status: number; body?: unknown }, me: unknown = null) {
    const posted: unknown[] = [];
    const fetchMock = mockPublic({
      'GET /auth/me': me ? { status: 200, body: me } : { status: 401, body: {} },
    });
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      const path = new URL(String(input), 'http://localhost').pathname;
      if (path.endsWith('/availability')) {
        const slots = [{ start: START, end: START, staffId: LEO, locationId: location.id }];
        return new Response(JSON.stringify({ serviceId: SVC, from: '', to: '', slots }));
      }
      if (init?.method === 'POST' && path.endsWith('/bookings')) {
        posted.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify(post.body ?? {}), { status: post.status });
      }
      return original(input, init);
    });
    return posted;
  }

  it('reserva con los datos de contacto y muestra la confirmación', async () => {
    const posted = mockBooking({ status: 201, body: created });
    renderApp(url);
    await userEvent.type(await screen.findByLabelText('Nombre y apellido'), 'Juana Pérez');
    await userEvent.type(screen.getByLabelText('Email'), 'juana@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar turno' }));

    const done = await screen.findByRole('heading', { name: '¡Listo! Tu turno quedó reservado' });
    expect(done).toHaveFocus();
    expect(posted).toEqual([
      {
        serviceId: SVC,
        staffId: LEO,
        locationId: location.id,
        startsAt: START,
        customer: { name: 'Juana Pérez', email: 'juana@example.com', phone: null },
      },
    ]);
    expect(screen.getByRole('link', { name: 'Agregar al calendario' })).toHaveAttribute(
      'download',
      'turno.ics',
    );
  });

  it('si el horario se ocupó en el medio, avisa y pide elegir otro', async () => {
    mockBooking({ status: 409, body: { message: 'Ese horario ya fue tomado. Elegí otro.' } });
    const { router } = renderApp(url);
    await userEvent.type(await screen.findByLabelText('Nombre y apellido'), 'Juana');
    await userEvent.type(screen.getByLabelText('Email'), 'juana@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar turno' }));
    await waitFor(() => expect(router.state.location.search).not.toContain('hora='));
    expect(screen.queryByRole('region', { name: 'Tus datos' })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Ese horario se acaba de ocupar');
  });

  it('con sesión, completa nombre y email', async () => {
    mockBooking(
      { status: 201, body: created },
      {
        user: {
          id: 'u',
          email: 'ana@example.com',
          name: 'Ana',
          emailVerified: true,
          hasPassword: true,
          hasGoogle: false,
        },
        memberships: [],
      },
    );
    renderApp(url);
    await waitFor(() => expect(screen.getByLabelText('Nombre y apellido')).toHaveValue('Ana'));
    expect(screen.getByLabelText('Email')).toHaveValue('ana@example.com');
  });
});
