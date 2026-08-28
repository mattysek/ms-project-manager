// Trezor hesel proti běžícímu serveru — PRD-09, ADR-016.
//
// Tahle vrstva je u trezoru výjimečně důležitá: jednotkové testy mají krypto
// skutečné, ale server zamockovaný, takže by nikdo nevšiml, že se blob na
// server vůbec nedostal nebo že ho server vrací jinak, než ho přijal. A hlavně
// — „reload zamkne trezor" je tvrzení o tom, že klíč NIKDE nepřežívá, což
// v jsdom nejde ověřit vůbec.
import { expect, test, type Page } from '@playwright/test';
import { createUser, loginAs, unique } from './fixtures';

const VAULT_PASSWORD = 'TrezorHeslo123';

/**
 * Otevře panel trezoru, pokud otevřený není.
 *
 * Volba panelu přežívá reload (`useOpenPanel`), takže bezpodmínečné kliknutí
 * po `page.reload()` panel naopak ZAVŘE — stejná past jako u `openNotesPanel`
 * ve `fixtures.ts`.
 */
async function openVault(page: Page): Promise<void> {
  const panel = page.getByRole('dialog', { name: 'Trezor hesel' });
  if (!(await panel.isVisible())) {
    await page.getByRole('button', { name: /trezor/i }).click();
  }
  await expect(panel).toBeVisible();
}

/** Založí trezor přihlášenému uživateli a nechá ho odemčený. */
async function createVault(page: Page, password = VAULT_PASSWORD): Promise<void> {
  await page.getByLabel(/^heslo k trezoru/i).fill(password);
  await page.getByLabel(/potvrzení hesla/i).fill(password);
  await page.getByRole('button', { name: 'Založit trezor' }).click();
  await expect(page.getByRole('button', { name: '+ Nový záznam' })).toBeVisible();
}

async function addEntry(page: Page, title: string, password: string): Promise<void> {
  await page.getByRole('button', { name: '+ Nový záznam' }).click();
  await page.getByLabel('Název').fill(title);
  await page.getByLabel('Uživatelské jméno').fill('svc_test');
  await page.getByLabel('Heslo', { exact: true }).fill(password);
  await page.getByLabel('URL').fill('https://test.firma.cz');
  await page.getByRole('button', { name: 'Uložit' }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
}

test('založení trezoru, uložení záznamu a jeho přečtení po odemčení', async ({ page, request }) => {
  const user = await createUser(request, 'Jan Novák');
  await loginAs(page, user);

  await openVault(page);
  await createVault(page);
  await addEntry(page, 'Testovací server', 'Tajne123');

  // Zamknout a odemknout: dokazuje, že se záznam opravdu uložil zašifrovaný
  // a zase dešifroval, ne že jen visí v paměti od zápisu.
  await page.getByRole('button', { name: 'Zamknout' }).click();
  await expect(page.getByText('Testovací server')).toBeHidden();

  await page.getByLabel('Heslo k trezoru').fill(VAULT_PASSWORD);
  await page.getByRole('button', { name: 'Odemknout' }).click();

  await expect(page.getByText('Testovací server')).toBeVisible();
  await page.getByLabel('Zobrazit heslo — Testovací server').click();
  await expect(page.getByText('Tajne123')).toBeVisible();
});

// @scenario: vault.feature > Reload stránky trezor zamkne
test('reload stránky trezor zamkne', async ({ page, request }) => {
  const user = await createUser(request, 'Jan Novák');
  await loginAs(page, user);
  await openVault(page);
  await createVault(page);
  await addEntry(page, 'Testovací server', 'Tajne123');

  await page.reload();
  await openVault(page);

  // Klíč žije jen v paměti záložky (ADR-016) — po reloadu musí být pryč,
  // včetně obsahu.
  await expect(page.getByLabel('Heslo k trezoru')).toBeVisible();
  await expect(page.getByText('Testovací server')).toBeHidden();
});

// @scenario: vault.feature > Odemčení špatným heslem
test('špatné heslo trezor neotevře', async ({ page, request }) => {
  const user = await createUser(request, 'Jan Novák');
  await loginAs(page, user);
  await openVault(page);
  await createVault(page);
  await addEntry(page, 'Testovací server', 'Tajne123');
  await page.getByRole('button', { name: 'Zamknout' }).click();

  await page.getByLabel('Heslo k trezoru').fill('SpatneHeslo999');
  await page.getByRole('button', { name: 'Odemknout' }).click();

  await expect(page.getByRole('alert')).toContainText('Nesprávné heslo k trezoru');
  await expect(page.getByText('Testovací server')).toBeHidden();
});

// @scenario: vault.feature > Server obsah trezoru nevidí
test('server dostane jen zašifrovaný blob', async ({ page, request }) => {
  const user = await createUser(request, 'Jan Novák');
  await loginAs(page, user);
  await openVault(page);
  await createVault(page);

  // Odposlech skutečného požadavku — tady se pozná, jestli šifrování opravdu
  // proběhlo před odesláním, nebo se jen tvářilo.
  const posted = page.waitForRequest(
    (req) => req.url().includes('/api/vault/entries') && req.method() === 'POST'
  );
  await addEntry(page, 'Testovací server', 'Tajne123');
  const body = (await posted).postData() ?? '';

  expect(body).not.toContain('Tajne123');
  expect(body).not.toContain('Testovací server');
  expect(body).not.toContain(VAULT_PASSWORD);

  // A co server vrací zpátky, je pořád jen blob.
  const stored = await page.request.get('/api/vault/entries');
  const raw = await stored.text();
  expect(raw).not.toContain('Tajne123');
  expect(raw).not.toContain('Testovací server');
});

// @scenario: vault.feature > Změna hesla k trezoru
test('po změně hesla platí nové a obsah zůstává čitelný', async ({ page, request }) => {
  const user = await createUser(request, 'Jan Novák');
  await loginAs(page, user);
  await openVault(page);
  await createVault(page);
  await addEntry(page, 'Testovací server', 'Tajne123');

  await page.getByRole('button', { name: 'Změnit heslo trezoru' }).click();
  await page.getByLabel('Stávající heslo').fill(VAULT_PASSWORD);
  await page.getByLabel(/^nové heslo/i).fill('NoveTrezorHeslo456');
  await page.getByLabel('Potvrzení nového hesla').fill('NoveTrezorHeslo456');
  // `exact`, protože Playwright matchuje přístupné jméno jako podřetězec —
  // „Změnit heslo“ by jinak sedělo i na patičkové „Změnit heslo trezoru“,
  // která zůstává vidět, a locator by spadl na dvou shodách.
  await page.getByRole('button', { name: 'Změnit heslo', exact: true }).click();
  await expect(page.getByRole('button', { name: '+ Nový záznam' })).toBeVisible();

  await page.getByRole('button', { name: 'Zamknout' }).click();
  await page.getByLabel('Heslo k trezoru').fill(VAULT_PASSWORD);
  await page.getByRole('button', { name: 'Odemknout' }).click();
  await expect(page.getByRole('alert')).toContainText('Nesprávné heslo k trezoru');

  await page.getByLabel('Heslo k trezoru').fill('NoveTrezorHeslo456');
  await page.getByRole('button', { name: 'Odemknout' }).click();

  // Přešifrovaný obsah musí být pod novým klíčem pořád ten samý.
  await expect(page.getByText('Testovací server')).toBeVisible();
  await page.getByLabel('Zobrazit heslo — Testovací server').click();
  await expect(page.getByText('Tajne123')).toBeVisible();
});

test('trezor je dostupný i na seznamu projektů', async ({ page, request }) => {
  const user = await createUser(request, 'Jan Novák');
  await loginAs(page, user);

  // Žádný otevřený projekt — a tlačítko tam musí být (stejně jako Poznámky).
  await expect(page.getByRole('button', { name: /nový projekt/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /trezor/i })).toBeVisible();
});

test('trezor jednoho uživatele nevidí druhý', async ({ page, browser, request }) => {
  const jan = await createUser(request, 'Jan Novák');
  const petra = await createUser(request, 'Petra Kolářová');

  await loginAs(page, jan);
  await openVault(page);
  await createVault(page);
  await addEntry(page, unique('Tajny zaznam'), 'Tajne123');

  const second = await browser.newContext();
  const petraPage = await second.newPage();
  await loginAs(petraPage, petra);
  await openVault(petraPage);

  // Petra má vlastní (neexistující) trezor, ne Janův zamčený.
  await expect(petraPage.getByRole('button', { name: 'Založit trezor' })).toBeVisible();
  await second.close();
});
