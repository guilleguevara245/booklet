import { expect, test } from '@playwright/test';
import {
  bookAsCustomer,
  createBusiness,
  loginInBrowser,
  openAgenda,
  PASSWORD,
  uniqueEmail,
} from './helpers';

const API = 'http://localhost:3000';

/** Crea una cuenta por la API y devuelve el email. */
async function registerOwner(request: import('@playwright/test').APIRequestContext) {
  const email = uniqueEmail();
  const res = await request.post(`${API}/auth/register`, {
    data: { email, name: 'Dueña E2E', password: PASSWORD },
  });
  expect(res.status()).toBe(201);
  return email;
}

test('una persona nueva crea su cuenta y su negocio desde la web', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Crear cuenta' }).click();
  await page.getByLabel('Nombre').fill('Carla');
  await page.getByLabel('Email').fill(uniqueEmail());
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  await expect(page.getByRole('heading', { name: 'Creá tu negocio' })).toBeVisible();
  await page.getByLabel('Nombre del negocio').fill(`Estudio Carla ${Date.now()}`);
  await page.getByRole('button', { name: 'Crear negocio' }).click();

  await expect(page.getByRole('heading', { name: /Estudio Carla/ })).toBeVisible();
  await expect(page.getByText('todavía no tiene sucursales')).toBeVisible();
});

test('sin sesión, el panel lleva a la pantalla de inicio de sesión', async ({ page }) => {
  await page.goto('/panel');
  await expect(page).toHaveURL(/\/entrar$/);
});

test.describe('agenda en vivo con dos navegadores', () => {
  test('una reserva nueva aparece en los dos paneles sin recargar', async ({
    browser,
    request,
  }) => {
    const email = await registerOwner(request);
    const b = await createBusiness(request, email);
    const recepcion = await openAgenda(browser, email, b.business.id);
    const celular = await openAgenda(browser, email, b.business.id);

    await bookAsCustomer(b, b.ana.id, '10:00', 'Lucía Gómez');

    for (const page of [recepcion, celular]) {
      const ana = page.getByRole('region', { name: 'Turnos de Ana' });
      await expect(ana.getByRole('button', { name: /10:00–10:30 Lucía Gómez/ })).toBeVisible();
      await expect(page.getByText('Nuevo turno: Lucía Gómez')).toBeVisible();
    }
  });

  test('cancelar en un panel lo saca del otro', async ({ browser, request }) => {
    const email = await registerOwner(request);
    const b = await createBusiness(request, email);
    await bookAsCustomer(b, b.ana.id, '11:00', 'Martín Ruiz');
    const recepcion = await openAgenda(browser, email, b.business.id);
    const celular = await openAgenda(browser, email, b.business.id);
    const turno = /Martín Ruiz/;
    await expect(celular.getByRole('button', { name: turno })).toBeVisible();

    await recepcion.getByRole('button', { name: turno }).click();
    const dialog = recepcion.getByRole('dialog', { name: 'Martín Ruiz' });
    await dialog.getByRole('button', { name: 'Cancelar turno' }).click();
    await dialog.getByLabel('Motivo (opcional)').fill('Avisó que no viene');
    await dialog.getByRole('button', { name: 'Sí, cancelar turno' }).click();

    await expect(recepcion.getByRole('dialog')).toBeHidden();
    await expect(celular.getByRole('button', { name: turno })).toBeHidden();
    await expect(celular.getByText('Turno cancelado: Martín Ruiz')).toBeVisible();
  });

  test('reprogramar a otro profesional lo mueve de columna en el otro panel', async ({
    browser,
    request,
  }) => {
    const email = await registerOwner(request);
    const b = await createBusiness(request, email);
    await bookAsCustomer(b, b.ana.id, '12:00', 'Sofía Díaz');
    const recepcion = await openAgenda(browser, email, b.business.id);
    const celular = await openAgenda(browser, email, b.business.id);

    await recepcion.getByRole('button', { name: /Sofía Díaz/ }).click();
    const dialog = recepcion.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Reprogramar' }).click();
    await dialog
      .getByRole('group', { name: 'Bruno' })
      .getByRole('button', { name: '15:00' })
      .click();
    await dialog.getByRole('button', { name: 'Mover a las 15:00 con Bruno' }).click();

    const bruno = celular.getByRole('region', { name: 'Turnos de Bruno' });
    await expect(bruno.getByRole('button', { name: /15:00–15:30 Sofía Díaz/ })).toBeVisible();
    await expect(
      celular
        .getByRole('region', { name: 'Turnos de Ana' })
        .getByRole('button', { name: /Sofía Díaz/ }),
    ).toBeHidden();
  });
});

test('el login desde la web muestra el error de credenciales', async ({ page, request }) => {
  const email = await registerOwner(request);
  await page.goto('/entrar');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill('una contraseña equivocada');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toHaveText('Email o contraseña incorrectos.');
  // Y con la correcta, entra.
  await loginInBrowser(page, email);
});
