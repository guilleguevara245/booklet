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
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Corte con Mia, martes 8 de enero a las 11:30.',
    );
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
