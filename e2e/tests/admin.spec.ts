// Správa uživatelů (FR-AUTH-05) — jediná část aplikace mimo projekty.
//
// Admin nemá žádná projektová práva (ADR-006), takže deaktivace účtu je jeho
// jediná páka na přístup — a právě proto ji server odmítne u uživatele, který
// je někde jediným PM: jinak by projekt osiřel a nikdo by ho už neodemkl.
import { expect, test, type Page } from '@playwright/test';
import { ADMIN, createProject, createUser, loginAs, unique } from './fixtures';

/** Přihlásí admina a otevře správu uživatelů z uživatelského menu. */
async function openAdminUsers(page: Page): Promise<void> {
  await loginAs(page, { ...ADMIN, password: ADMIN.password });
  await page.getByLabel(`Uživatelské menu — ${ADMIN.displayName}`).click();
  await page.getByRole('button', { name: 'Správa uživatelů' }).click();
  await expect(page.getByText('Správa uživatelů')).toBeVisible();
}

test.describe('Správa uživatelů', () => {
  test('admin založí účet a ten se dá rovnou přihlásit', async ({ page, request, browser }) => {
    // `ensureAdmin` běží uvnitř `createUser`; tenhle řádek jen zaručí, že admin
    // existuje i kdyby tenhle test běžel jako první.
    await createUser(request, 'Rozehrávka');
    await openAdminUsers(page);

    const userName = unique('novy');
    await page.getByRole('button', { name: 'Přidat uživatele' }).click();
    await page.getByPlaceholder('Uživatelské jméno').fill(userName);
    await page.getByPlaceholder('Display name').fill('Nový Kolega');
    await page.getByPlaceholder('Dočasné heslo').fill('Heslo1234');
    await page.getByRole('button', { name: 'Vytvořit' }).click();

    await expect(page.getByText(userName)).toBeVisible();

    const context = await browser.newContext();
    const fresh = await context.newPage();
    await loginAs(fresh, { userName, password: 'Heslo1234', displayName: 'Nový Kolega' });
    await context.close();
  });

  test('deaktivovaný uživatel se nepřihlásí a po obnovení zase ano', async ({
    page,
    request,
    browser,
  }) => {
    const user = await createUser(request, 'Petra Kolářová');
    await openAdminUsers(page);

    // Deaktivace se potvrzuje nativním `confirm`.
    const row = page.getByRole('row').filter({ hasText: user.userName });
    page.once('dialog', (dialog) => dialog.accept());
    await row.getByRole('button', { name: 'Deaktivovat' }).click();
    await expect(row.getByText('Deaktivován')).toBeVisible();

    const blocked = await browser.newContext();
    const blockedPage = await blocked.newPage();
    await blockedPage.goto('/');
    await blockedPage.getByLabel(/uživatelské jméno/i).fill(user.userName);
    await blockedPage.getByLabel(/heslo/i).fill(user.password);
    await blockedPage.getByRole('button', { name: /přihlásit/i }).click();
    await expect(blockedPage.getByRole('alert')).toBeVisible();
    await blocked.close();

    await row.getByRole('button', { name: 'Obnovit' }).click();
    await expect(row.getByText('Aktivní')).toBeVisible();

    const restored = await browser.newContext();
    const restoredPage = await restored.newPage();
    await loginAs(restoredPage, user);
    await restored.close();
  });

  test('nelze deaktivovat účet, který je někde jediným PM', async ({ page, request, browser }) => {
    const pm = await createUser(request, 'Jan Novák');

    // Zakladatel projektu je automaticky jeho PM a jiného tam nikdo nepřidá.
    const pmContext = await browser.newContext();
    const pmPage = await pmContext.newPage();
    await loginAs(pmPage, pm);
    await createProject(pmPage, unique('JedinyPm'));
    await pmContext.close();

    await openAdminUsers(page);
    const row = page.getByRole('row').filter({ hasText: pm.userName });
    page.once('dialog', (dialog) => dialog.accept());
    await row.getByRole('button', { name: 'Deaktivovat' }).click();

    // Server to odmítne — `Members.projectsWhereSolePm`. Admin sám projekt
    // odemknout nemůže, takže by se stal nedostupným pro všechny.
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(row.getByText('Aktivní')).toBeVisible();
  });

  test('reset hesla vygeneruje heslo, kterým se jde přihlásit', async ({
    page,
    request,
    browser,
  }) => {
    const user = await createUser(request, 'Petra Kolářová');
    await openAdminUsers(page);

    const row = page.getByRole('row').filter({ hasText: user.userName });
    await row.getByRole('button', { name: 'Reset hesla' }).click();

    const nove = 'ZcelaNove1234';
    await page.getByPlaceholder('Nové heslo').fill(nove);
    await page.getByRole('button', { name: 'Resetovat' }).click();
    await expect(page.getByText('Heslo bylo resetováno')).toBeVisible();
    await page.getByRole('button', { name: 'Zavřít' }).click();

    const context = await browser.newContext();
    const fresh = await context.newPage();
    await loginAs(fresh, { ...user, password: nove });
    await context.close();
  });
});
