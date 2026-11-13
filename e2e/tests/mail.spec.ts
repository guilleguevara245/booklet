import { expect, test } from '@playwright/test';
import { createBusiness, PASSWORD, pickSlot, uniqueEmail } from './helpers';
import { linkIn, MAILPIT_URL, waitForMail } from './mailpit';

const API = 'http://localhost:3000';
const ORIGIN = 'http://localhost:5173';

test.skip(!MAILPIT_URL, 'Necesita Mailpit (MAILPIT_URL) y la API con MAIL_TRANSPORT=smtp');

test('el mail de confirmación trae el link para cancelar el turno sin cuenta', async ({
  page,
  request,
}) => {
  const owner = uniqueEmail();
  await request.post(`${API}/auth/register`, {
    data: { email: owner, name: 'Dueña', password: PASSWORD },
  });
  const b = await createBusiness(request, owner);
  const customer = uniqueEmail();

  await pickSlot(page, b.business.slug, '12:00');
  await page.getByLabel('Nombre y apellido').fill('Marta Ríos');
  await page.getByLabel('Email').fill(customer);
  await page.getByRole('button', { name: 'Confirmar turno' }).click();
  await expect(page.getByRole('heading', { name: /Tu turno quedó reservado/ })).toBeVisible();

  const confirmation = await waitForMail(customer, 'Turno confirmado en Peluquería E2E');
  expect(confirmation).toContain('Hola, Marta Ríos');

  // Se abre el link en otro navegador: no hace falta la sesión ni la pestaña de la reserva.
  const other = await (await page.context().browser()!.newContext()).newPage();
  await other.goto(linkIn(confirmation, '/turno/'));
  await expect(other.getByRole('heading', { name: 'Peluquería E2E' })).toBeVisible();
  await other.getByRole('button', { name: 'Cancelar turno' }).click();
  await other.getByRole('button', { name: 'Sí, cancelar' }).click();
  await expect(other.getByRole('status')).toHaveText('Listo: cancelamos tu turno.');

  await waitForMail(customer, 'Se canceló tu turno en Peluquería E2E');
});

test('la persona invitada recibe el mail, crea su cuenta y entra al panel del negocio', async ({
  page,
  request,
}) => {
  const owner = uniqueEmail();
  await request.post(`${API}/auth/register`, {
    data: { email: owner, name: 'Dueña', password: PASSWORD },
  });
  const b = await createBusiness(request, owner);
  const invited = uniqueEmail();
  const res = await request.post(`${API}/businesses/${b.business.id}/invitations`, {
    data: { email: invited, staffId: b.ana.id },
    headers: { origin: ORIGIN },
  });
  expect(res.ok()).toBe(true);

  const invitation = await waitForMail(invited, 'Te invitaron a Peluquería E2E');
  await page.goto(linkIn(invitation, '/invitacion/'));
  await expect(page.getByRole('heading', { name: 'Sumate a Peluquería E2E' })).toBeVisible();

  await page.getByRole('link', { name: 'Crear cuenta' }).click();
  await page.getByLabel('Nombre').fill('Ana Paz');
  await page.getByLabel('Email').fill(invited);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  // Vuelve a la invitación con la sesión nueva.
  await page.getByRole('button', { name: 'Aceptar invitación' }).click();
  await expect(page).toHaveURL(new RegExp(`/panel/${b.business.id}`));
  await expect(page.getByText('En vivo')).toBeVisible();

  // Al crear la cuenta también llegó el mail para confirmar el email.
  const verify = await waitForMail(invited, 'Confirmá tu email en Booklet');
  await page.goto(linkIn(verify, '/verificar'));
  await expect(page.getByText(`Confirmamos tu email ${invited}`)).toBeVisible();
});
