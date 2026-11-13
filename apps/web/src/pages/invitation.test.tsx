import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ana, mockApi, renderApp } from '../test/render';

afterEach(() => vi.unstubAllGlobals());

const TOKEN = 'token-de-invitacion-que-llega-por-mail-000';
const BUSINESS_ID = '22222222-2222-4222-8222-222222222222';
const preview = (over: object = {}) => ({
  status: 200,
  body: {
    businessName: 'Estudio Norte',
    businessSlug: 'estudio-norte',
    email: ana.email,
    role: 'staff',
    status: 'pending',
    ...over,
  },
});

describe('invitación al equipo', () => {
  it('sin sesión ofrece entrar o crear la cuenta y vuelve a la invitación', async () => {
    mockApi({
      'GET /auth/me': { status: 401, body: {} },
      [`GET /invitations/${TOKEN}`]: preview(),
    });
    const { router } = renderApp(`/invitacion/${TOKEN}`);
    expect(
      await screen.findByRole('heading', { name: 'Sumate a Estudio Norte' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/como profesional/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Ya tengo cuenta' }));
    expect(router.state.location.pathname).toBe('/entrar');
    expect(router.state.location.state).toEqual({ from: `/invitacion/${TOKEN}` });
  });

  it('con la cuenta invitada la acepta y lleva a la agenda del negocio', async () => {
    const fetchMock = mockApi({
      'GET /auth/me': { status: 200, body: { user: ana, memberships: [] } },
      [`GET /invitations/${TOKEN}`]: preview(),
      [`POST /invitations/${TOKEN}/accept`]: {
        status: 200,
        body: {
          businessId: BUSINESS_ID,
          slug: 'estudio-norte',
          name: 'Estudio Norte',
          role: 'staff',
        },
      },
    });
    const { router } = renderApp(`/invitacion/${TOKEN}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Aceptar invitación' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/panel/${BUSINESS_ID}`));
    const posts = fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST');
    expect(posts).toHaveLength(1);
  });

  it('con otra cuenta avisa y no deja aceptar', async () => {
    mockApi({
      'GET /auth/me': { status: 200, body: { user: ana, memberships: [] } },
      [`GET /invitations/${TOKEN}`]: preview({ email: 'beto@example.com' }),
    });
    renderApp(`/invitacion/${TOKEN}`);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Entraste como ana@example.com. Para aceptar, entrá con la cuenta de beto@example.com.',
    );
    expect(screen.queryByRole('button', { name: 'Aceptar invitación' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar con otra cuenta' })).toBeInTheDocument();
  });

  it('avisa si la invitación venció', async () => {
    mockApi({
      'GET /auth/me': { status: 401, body: {} },
      [`GET /invitations/${TOKEN}`]: preview({ status: 'expired' }),
    });
    renderApp(`/invitacion/${TOKEN}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta invitación venció');
  });

  it('avisa si la invitación no existe', async () => {
    mockApi({
      'GET /auth/me': { status: 401, body: {} },
      [`GET /invitations/${TOKEN}`]: { status: 404, body: { message: 'No existe' } },
    });
    renderApp(`/invitacion/${TOKEN}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('No encontramos esta invitación');
  });
});
