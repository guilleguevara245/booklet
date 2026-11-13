import { expect, request as playwrightRequest, test, type Page } from '@playwright/test';
import { createBusiness, openAgenda, PASSWORD, pickSlot, uniqueEmail } from './helpers';

const API = 'http://localhost:3000';

async function ownerWithBusiness(request: import('@playwright/test').APIRequestContext) {
  const email = uniqueEmail();
  await request.post(`${API}/auth/register`, {
    data: { email, name: 'Dueña', password: PASSWORD },
  });
  return { email, b: await createBusiness(request, email) };
}

async function fillContact(page: Page, name: string) {
  await page.getByLabel('Nombre y apellido').fill(name);
  await page.getByLabel('Email').fill('cliente@example.com');
}

test('un cliente reserva sin cuenta y el turno aparece en vivo en el panel', async ({
  browser,
  page,
  request,
}) => {
  const { email, b } = await ownerWithBusiness(request);
  const panel = await openAgenda(browser, email, b.business.id);

  await pickSlot(page, b.business.slug, '10:30');
  await fillContact(page, 'Lucía Gómez');
  await page.getByRole('button', { name: 'Confirmar turno' }).click();

  await expect(
    page.getByRole('heading', { name: '¡Listo! Tu turno quedó reservado' }),
  ).toBeFocused();
  await expect(page.getByRole('link', { name: 'Agregar al calendario' })).toBeVisible();

  await expect(panel.getByRole('button', { name: /10:30–11:00 Lucía Gómez/ })).toBeVisible();
  await expect(panel.getByText('Nuevo turno: Lucía Gómez')).toBeVisible();
});

test('si dos personas eligen el mismo horario, la segunda recibe un aviso claro', async ({
  browser,
  request,
}) => {
  const { b } = await ownerWithBusiness(request);
  const primera = await (await browser.newContext()).newPage();
  const segunda = await (await browser.newContext()).newPage();

  await pickSlot(primera, b.business.slug, '11:00');
  await pickSlot(segunda, b.business.slug, '11:00');
  await fillContact(primera, 'Primera');
  await fillContact(segunda, 'Segunda');

  await primera.getByRole('button', { name: 'Confirmar turno' }).click();
  await expect(primera.getByRole('heading', { name: /Tu turno quedó reservado/ })).toBeVisible();

  await segunda.getByRole('button', { name: 'Confirmar turno' }).click();
  await expect(segunda.getByRole('alert')).toHaveText(
    'Ese horario se acaba de ocupar. Elegí otro.',
  );
  // Se borra la elección para volver a elegir. Las 11:00 pueden seguir libres con la otra
  // profesional, así que no se verifica que desaparezcan.
  await expect(segunda.getByRole('region', { name: 'Tus datos' })).toBeHidden();
  await expect(segunda.getByRole('button', { name: '11:30', exact: true })).toBeVisible();
});

test('con sesión, el turno queda en "Mis turnos" y se puede cancelar', async ({
  page,
  request,
}) => {
  const { b } = await ownerWithBusiness(request);
  const email = uniqueEmail();
  // La cuenta se crea por fuera del navegador: la persona todavía no inició sesión en la web.
  const other = await playwrightRequest.newContext();
  await other.post(`${API}/auth/register`, {
    data: { email, name: 'Marta Quiroga', password: PASSWORD },
  });
  await other.dispose();

  await page.goto(`/n/${b.business.slug}`);
  await page.getByRole('link', { name: 'Entrar' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  // Vuelve a la página del negocio, no al panel.
  await expect(page).toHaveURL(new RegExp(`/n/${b.business.slug}`));

  await pickSlot(page, b.business.slug, '12:00');
  await expect(page.getByLabel('Nombre y apellido')).toHaveValue('Marta Quiroga');
  await page.getByRole('button', { name: 'Confirmar turno' }).click();
  await page.getByRole('link', { name: 'Ver mis turnos' }).click();

  const proximos = page.getByRole('region', { name: 'Próximos' });
  await expect(proximos.getByText('Corte en Peluquería E2E')).toBeVisible();
  await proximos.getByRole('button', { name: 'Cancelar turno' }).click();
  await proximos.getByRole('button', { name: 'Sí, cancelar' }).click();
  await expect(
    page.getByRole('region', { name: 'Historial' }).getByText('Cancelado'),
  ).toBeVisible();
});
