// Základní průchod aplikací: přihlášení, projekt, hlavičky.
//
// Tohle jsou věci, které unit testy nevidí — od cookie přes SPA fallback až
// po to, jestli se build vůbec naservíruje.
import { expect, test } from '@playwright/test';
import {
  createProject,
  createUser,
  ensureAdmin,
  expectProjectOpen,
  expectSignedIn,
  loginAs,
  unique,
} from './fixtures';

test('nepřihlášený uživatel skončí na přihlašovací stránce', async ({ page, request }) => {
  // Bez admina by prázdná databáze nabídla první spuštění, ne přihlášení —
  // což potká každého, kdo si pustí jen tenhle spec (`run.sh smoke`).
  await ensureAdmin(request);

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

test('uživatelské menu jde ovládat i nad otevřeným panelem', async ({ page, request }) => {
  // Panel trezoru i poznámek se renderuje **uvnitř** `TopBar`, takže o pořadí
  // rozhoduje z-index v jeho stacking kontextu. Když měl dropdown menu nižší
  // číslo než panel, panel ho překryl a „Změna hesla" nešla kliknout —
  // Playwright to pozná sám: klik na zakrytý prvek se neprovede.
  const user = await createUser(request, 'Jan Novák');
  await loginAs(page, user);

  await page.getByRole('button', { name: /trezor/i }).click();
  await expect(page.getByRole('dialog', { name: 'Trezor hesel' })).toBeVisible();

  await page.getByLabel(`Uživatelské menu — ${user.displayName}`).click();
  await page.getByText('Změna hesla').click({ timeout: 5000 });

  await expect(page.getByRole('button', { name: /^Uložit/ })).toBeVisible();
});

test('otevřený je vždy jen jeden panel a lišta to ukazuje', async ({ page, request }) => {
  // Poznámky i trezor sedí na stejném místě obrazovky, takže dva otevřené se
  // překrývaly a spodní byl nedosažitelný.
  const user = await createUser(request, 'Jan Novák');
  await loginAs(page, user);

  const notes = page.getByRole('dialog', { name: 'Quick Notes' });
  const vault = page.getByRole('dialog', { name: 'Trezor hesel' });
  const notesButton = page.getByRole('button', { name: /Poznámky/ });
  const vaultButton = page.getByRole('button', { name: /Trezor/ });

  await notesButton.click();
  await expect(notes).toBeVisible();
  await expect(notesButton).toHaveAttribute('aria-pressed', 'true');
  await expect(vaultButton).toHaveAttribute('aria-pressed', 'false');

  await vaultButton.click();
  await expect(vault).toBeVisible();
  await expect(notes).toBeHidden();
  await expect(vaultButton).toHaveAttribute('aria-pressed', 'true');
  await expect(notesButton).toHaveAttribute('aria-pressed', 'false');

  // Volba přežije reload, stejně jako dřív u samotných poznámek (FR-QN-01).
  await page.reload();
  await expect(vault).toBeVisible();
  await expect(notes).toBeHidden();
});
