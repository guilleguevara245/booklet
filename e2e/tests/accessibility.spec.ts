import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createBusiness, openAgenda, PASSWORD, uniqueEmail } from './helpers';

const API = 'http://localhost:3000';

/** Revisa la página con axe contra WCAG 2.1 A y AA. */
async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect(summary).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`accesibilidad, tema ${scheme === 'light' ? 'claro' : 'oscuro'}`, () => {
    test.use({ colorScheme: scheme });

    test('portada, entrar y crear cuenta', async ({ page }) => {
      for (const path of ['/', '/entrar', '/registro']) {
        await page.goto(path);
        await page.getByRole('main').waitFor();
        await expectAccessible(page);
      }
    });

    test('reserva pública, de punta a punta', async ({ page, request }) => {
      const email = uniqueEmail();
      await request.post(`${API}/auth/register`, {
        data: { email, name: 'Dueña', password: PASSWORD },
      });
      const b = await createBusiness(request, email);
      await page.goto(`/n/${b.business.slug}`);
      await page.getByRole('radio', { name: /^Corte/ }).click();
      await page.getByRole('listitem').getByRole('button').nth(1).click();
      await page.getByRole('button', { name: '10:00', exact: true }).click();
      await page.getByLabel('Nombre y apellido').waitFor();
      await expectAccessible(page);

      await page.getByLabel('Nombre y apellido').fill('Ana');
      await page.getByLabel('Email').fill('ana@example.com');
      await page.getByRole('button', { name: 'Confirmar turno' }).click();
      await page.getByRole('heading', { name: /Tu turno quedó reservado/ }).waitFor();
      await expectAccessible(page);
    });

    test('panel con la agenda y el detalle de un turno', async ({ browser, request }) => {
      const email = uniqueEmail();
      await request.post(`${API}/auth/register`, {
        data: { email, name: 'Dueña', password: PASSWORD },
      });
      const b = await createBusiness(request, email);
      const page = await openAgenda(browser, email, b.business.id);
      await page.emulateMedia({ colorScheme: scheme });
      await expectAccessible(page);
    });
  });
}
