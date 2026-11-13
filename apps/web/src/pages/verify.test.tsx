import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ana, mockApi, renderApp } from '../test/render';

afterEach(() => vi.unstubAllGlobals());

describe('verificación de email', () => {
  it('el link del mail confirma el email una sola vez', async () => {
    const fetchMock = mockApi({
      'GET /auth/me': { status: 401, body: {} },
      'POST /auth/verify-email': { status: 200, body: { user: { ...ana, emailVerified: true } } },
    });
    renderApp('/verificar?token=un-token-firmado-que-llega-por-mail');
    expect(await screen.findByText(/Confirmamos tu email ana@example.com/)).toBeInTheDocument();
    const posts = fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST');
    expect(posts).toHaveLength(1);
  });

  it('avisa si el link venció', async () => {
    mockApi({
      'GET /auth/me': { status: 401, body: {} },
      'POST /auth/verify-email': {
        status: 400,
        body: { message: 'El link no es válido o venció. Pedí uno nuevo desde tu cuenta.' },
      },
    });
    renderApp('/verificar?token=un-token-firmado-que-ya-vencio-hace-rato');
    expect(await screen.findByRole('alert')).toHaveTextContent('venció');
  });

  it('las cuentas sin confirmar ven el aviso y pueden pedir el link de nuevo', async () => {
    mockApi({
      'GET /auth/me': { status: 200, body: { user: ana, memberships: [] } },
      'GET /me/bookings': { status: 200, body: [] },
      'POST /auth/resend-verification': { status: 204 },
    });
    renderApp('/mis-turnos');
    const banner = await screen.findByRole('region', { name: 'Confirmá tu email' });
    await userEvent.click(screen.getByRole('button', { name: 'Mandarlo de nuevo' }));
    expect(await screen.findByText('Listo, te lo mandamos de nuevo.')).toBeInTheDocument();
    expect(banner).toBeInTheDocument();
  });
});
