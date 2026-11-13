import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ana, mockApi, renderApp } from '../test/render';

afterEach(() => vi.unstubAllGlobals());

describe('inicio de sesión', () => {
  it('entra y lleva al panel', async () => {
    let loggedIn = false;
    mockApi({
      'GET /auth/me': () =>
        loggedIn
          ? { status: 200, body: { user: ana, memberships: [] } }
          : { status: 401, body: {} },
      'POST /auth/login': () => {
        loggedIn = true;
        return { status: 200, body: { user: ana } };
      },
      'GET /health': { status: 503, body: {} },
    });
    const { router } = renderApp('/entrar');
    await userEvent.type(screen.getByLabelText('Email'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'contraseña segura');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/panel'));
    expect(await screen.findByText('Hola, Ana')).toBeInTheDocument();
  });

  it('muestra el error si la contraseña está mal', async () => {
    mockApi({
      'GET /auth/me': { status: 401, body: {} },
      'POST /auth/login': { status: 401, body: { message: 'Email o contraseña incorrectos.' } },
    });
    renderApp('/entrar');
    await userEvent.type(screen.getByLabelText('Email'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mal');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email o contraseña incorrectos.');
  });
});

describe('registro', () => {
  it('marca cada campo que la API rechazó', async () => {
    mockApi({
      'GET /auth/me': { status: 401, body: {} },
      'POST /auth/register': {
        status: 400,
        body: {
          message: 'Datos inválidos',
          issues: [{ path: 'password', message: 'Mínimo 10 caracteres' }],
        },
      },
    });
    renderApp('/registro');
    await userEvent.type(screen.getByLabelText('Nombre'), 'Ana');
    await userEvent.type(screen.getByLabelText('Email'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'corta');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    const password = screen.getByLabelText('Contraseña');
    await waitFor(() => expect(password).toHaveAttribute('aria-invalid', 'true'));
    expect(password).toHaveAccessibleDescription('Mínimo 10 caracteres');
  });
});

describe('rutas protegidas', () => {
  it('sin sesión, el panel lleva a /entrar', async () => {
    mockApi({ 'GET /auth/me': { status: 401, body: {} } });
    const { router } = renderApp('/panel');
    await waitFor(() => expect(router.state.location.pathname).toBe('/entrar'));
  });
});
