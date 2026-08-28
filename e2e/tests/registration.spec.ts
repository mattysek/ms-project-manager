// Samoobslužná registrace proti běžícímu serveru — FR-AUTH-08, ADR-003 (doplněk).
//
// Unit testy mají server zamockovaný, takže by nechytily to podstatné: že
// odpověď na registraci opravdu nese session cookie, že vzniklý účet jde použít
// k přihlášení a že **není admin**. Poslední bod je bezpečnostní — kdyby
// registrace omylem přidala roli, na klientovi by to nebylo vidět nikde.
import { expect, test, type Page } from '@playwright/test';
import { ADMIN, ensureAdmin, expectSignedIn, unique, type TestUser } from './fixtures';

/** Účet k registraci; jméno je unikátní, sadu sdílí jedna databáze. */
function candidate(): TestUser {
  return {
    userName: unique('reg'),
    password: 'Heslo1234',
    displayName: `Nováček ${unique('').slice(1, 7)}`,
  };
}

/** Projde registračním formulářem z přihlašovací stránky. */
async function registerVia(page: Page, user: TestUser): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Zaregistrovat se' }).click();
  await expect(page.getByText('Registrace nového účtu')).toBeVisible();

  await page.getByLabel(/uživatelské jméno/i).fill(user.userName);
  await page.getByLabel(/display name/i).fill(user.displayName);
  await page.getByLabel(/^heslo/i).fill(user.password);
  await page.getByLabel(/potvrzení hesla/i).fill(user.password);
  await page.getByRole('button', { name: 'Zaregistrovat se' }).click();
}

test('registrace založí účet, přihlásí a skončí na seznamu projektů', async ({ page, request }) => {
  await ensureAdmin(request);
  const user = candidate();

  await registerVia(page, user);

  await expectSignedIn(page, user);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: /nový projekt/i })).toBeVisible();

  // Session je opravdová, ne jen stav v paměti komponenty.
  await page.reload();
  await expectSignedIn(page, user);
});

test('registrovaný účet není admin a nemá žádný projekt', async ({ page, request }) => {
  await ensureAdmin(request);
  const user = candidate();
  await registerVia(page, user);
  await expectSignedIn(page, user);

  // Správa uživatelů je jen pro admina — registrací se jím nikdo nestává.
  await page.getByLabel(`Uživatelské menu — ${user.displayName}`).click();
  await expect(page.getByText('Změna hesla')).toBeVisible();
  await expect(page.getByText('Správa uživatelů')).toHaveCount(0);

  // A do žádného projektu ho nikdo nepřidal.
  const projects = await page.request.get('/api/projects');
  expect(await projects.json()).toEqual([]);
});

test('registrovaný účet se po odhlášení přihlásí svým heslem', async ({ page, request }) => {
  await ensureAdmin(request);
  const user = candidate();
  await registerVia(page, user);
  await expectSignedIn(page, user);

  await page.getByLabel(`Uživatelské menu — ${user.displayName}`).click();
  await page.getByText('Odhlásit').click();
  await expect(page.getByRole('button', { name: 'Přihlásit se' })).toBeVisible();

  await page.getByLabel(/uživatelské jméno/i).fill(user.userName);
  await page.getByLabel(/heslo/i).fill(user.password);
  await page.getByRole('button', { name: 'Přihlásit se' }).click();

  await expectSignedIn(page, user);
});

test('obsazené uživatelské jméno registraci odmítne', async ({ page, request }) => {
  await ensureAdmin(request);

  await page.goto('/register');
  await page.getByLabel(/uživatelské jméno/i).fill(ADMIN.userName);
  await page.getByLabel(/display name/i).fill('Někdo jiný');
  await page.getByLabel(/^heslo/i).fill('Heslo1234');
  await page.getByLabel(/potvrzení hesla/i).fill('Heslo1234');
  await page.getByRole('button', { name: 'Zaregistrovat se' }).click();

  await expect(page.getByRole('alert')).toContainText('Uživatelské jméno je již obsazeno');
  await expect(page.getByText('Registrace nového účtu')).toBeVisible();
});

test('neshodná hesla se na server neposílají', async ({ page, request }) => {
  await ensureAdmin(request);
  const user = candidate();

  let attempted = false;
  page.on('request', (req) => {
    if (req.url().includes('/auth/register')) attempted = true;
  });

  await page.goto('/register');
  await page.getByLabel(/uživatelské jméno/i).fill(user.userName);
  await page.getByLabel(/display name/i).fill(user.displayName);
  await page.getByLabel(/^heslo/i).fill('Heslo1234');
  await page.getByLabel(/potvrzení hesla/i).fill('JineHeslo9');
  await page.getByRole('button', { name: 'Zaregistrovat se' }).click();

  await expect(page.getByRole('alert')).toContainText('Hesla se neshodují');
  expect(attempted).toBe(false);
});
