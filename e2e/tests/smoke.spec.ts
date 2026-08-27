// Základní průchod aplikací: přihlášení, projekt, hlavičky.
//
// Tohle jsou věci, které unit testy nevidí — od cookie přes SPA fallback až
// po to, jestli se build vůbec naservíruje.
import { expect, test } from '@playwright/test';
import {
  createProject,
  createUser,
  expectProjectOpen,
  expectSignedIn,
  loginAs,
  unique,
} from './fixtures';

test('nepřihlášený uživatel skončí na přihlašovací stránce', async ({ page }) => {
  await page.goto('/projects/neexistujici');
  await expect(page.getByRole('button', { name: /přihlásit se/i })).toBeVisible();
});

test('špatné heslo neodhalí, jestli účet existuje', async ({ page, request }) => {
  const user = await createUser(request, 'Jan Novák');
  await page.goto('/');
  await page.getByLabel('Uživatelské jméno').fill(user.userName);
  await page.getByLabel('Heslo').fill('SpatneHeslo');
  await page.getByRole('button', { name: 'Přihlásit se' }).click();

  await expect(page.getByRole('alert')).toContainText('Nesprávné uživatelské jméno nebo heslo');
});

test('přihlášení, založení projektu a přežití reloadu', async ({ page, request }) => {
  const user = await createUser(request, 'Jan Novák');
  await loginAs(page, user);

  const name = unique('Projekt');
  await createProject(page, name);

  // Session i otevřený projekt musí přežít F5 (auth.feature: persistentní session).
  await page.reload();
  await expectProjectOpen(page, name);
  await expectSignedIn(page, user);
});

test('odpověď nese bezpečnostní hlavičky a neprozrazuje server', async ({ request }) => {
  const response = await request.get('/auth/setup-required');
  const headers = response.headers();

  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers.server).toBeUndefined();
});

test('SPA fallback se necachuje, hashované assety ano', async ({ request }) => {
  const spa = await request.get('/projekt/libovolna-cesta');
  expect(spa.headers()['cache-control']).toContain('no-store');

  const html = await (await request.get('/')).text();
  const asset = html.match(/\/assets\/[^"']+\.js/)?.[0];
  expect(asset, 'index.html musí odkazovat na hashovaný asset').toBeTruthy();

  const js = await request.get(asset as string);
  expect(js.headers()['cache-control']).toContain('immutable');
});
