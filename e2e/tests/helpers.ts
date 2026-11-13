import { randomUUID } from 'node:crypto';
import {
  request as playwrightRequest,
  type APIRequestContext,
  type Browser,
  type Page,
} from '@playwright/test';
import { DateTime } from 'luxon';

export const TZ = 'America/Argentina/Buenos_Aires';
const API = 'http://localhost:3000';
const ORIGIN = 'http://localhost:5173';
export const PASSWORD = 'contraseña segura';

/** Mañana en Buenos Aires: siempre en el futuro y con más de una hora de anticipación. */
export const tomorrow = () => DateTime.now().setZone(TZ).plus({ days: 1 }).toISODate()!;

export const uniqueEmail = () => `e2e-${randomUUID().slice(0, 8)}@example.com`;

/**
 * Arma un negocio listo para reservar, directo contra la API: sucursal, servicio de 30
 * minutos y dos profesionales que atienden todos los días de 8 a 20.
 */
export async function createBusiness(request: APIRequestContext, ownerEmail: string) {
  // La API exige el origen de la web para usar la cookie de sesión (protección CSRF).
  const headers = { origin: ORIGIN };
  const login = await request.post(`${API}/auth/login`, {
    data: { email: ownerEmail, password: PASSWORD },
    headers,
  });
  if (!login.ok()) throw new Error(`login ${login.status()}`);
  const post = async (path: string, data: unknown, method: 'post' | 'put' = 'post') => {
    const res = await request[method](`${API}${path}`, { data, headers });
    if (!res.ok()) throw new Error(`${path} ${res.status()} ${await res.text()}`);
    return res.json();
  };
  const business = await post('/businesses', {
    slug: `e2e-${randomUUID().slice(0, 8)}`,
    name: 'Peluquería E2E',
  });
  const base = `/businesses/${business.id}`;
  const location = await post(`${base}/locations`, { name: 'Centro' });
  const service = await post(`${base}/services`, { name: 'Corte', durationMinutes: 30 });
  const rules = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: '08:00', end: '20:00' }));
  const staff = [];
  for (const name of ['Ana', 'Bruno']) {
    const s = await post(`${base}/staff`, { name, serviceIds: [service.id] });
    await post(`${base}/staff/${s.id}/schedule`, { locationId: location.id, rules }, 'put');
    staff.push(s);
  }
  return { business, location, service, ana: staff[0], bruno: staff[1] };
}

/** Reserva como lo haría un cliente desde la página pública: sin sesión, con su propio contexto. */
export async function bookAsCustomer(
  b: Awaited<ReturnType<typeof createBusiness>>,
  staffId: string,
  time: string,
  name: string,
) {
  const request = await playwrightRequest.newContext();
  const res = await request.post(`${API}/businesses/${b.business.id}/bookings`, {
    data: {
      serviceId: b.service.id,
      staffId,
      locationId: b.location.id,
      startsAt: DateTime.fromISO(`${tomorrow()}T${time}`, { zone: TZ }).toISO(),
      customer: { name, email: 'cliente@example.com' },
    },
  });
  if (!res.ok()) throw new Error(`reserva ${res.status()} ${await res.text()}`);
  const booking = await res.json();
  await request.dispose();
  return booking;
}

/** Inicia sesión desde la pantalla de la web. */
export async function loginInBrowser(page: Page, email: string) {
  await page.goto('/entrar');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  // Quien administra un negocio va al panel; quien no, a sus turnos.
  await page.waitForURL(/\/(panel|mis-turnos)/);
}

/** Abre un navegador aparte con la sesión de esa persona, en la agenda de mañana. */
export async function openAgenda(browser: Browser, email: string, businessId: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginInBrowser(page, email);
  await page.goto(`/panel/${businessId}?fecha=${tomorrow()}`);
  await page.getByText('En vivo').waitFor();
  return page;
}

/** Elige servicio, mañana y un horario en la página pública. */
export async function pickSlot(page: Page, slug: string, time: string) {
  await page.goto(`/n/${slug}`);
  await page.getByRole('radio', { name: /^Corte/ }).click();
  await page.getByRole('button', { name: 'Semana siguiente' }).waitFor();
  // El primer día con lugar queda elegido solo; se pasa a mañana para no depender de la hora.
  const tomorrow = page.getByRole('listitem').getByRole('button').nth(1);
  await tomorrow.click();
  await page.getByRole('button', { name: time, exact: true }).click();
}
