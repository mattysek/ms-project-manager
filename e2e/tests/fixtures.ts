// Společné pomůcky E2E testů.
//
// Testy sdílí jednu instanci serveru s jednou SQLite databází, takže se
// nesmějí opírat o prázdný stav. Každý si proto zakládá vlastní účty
// a projekty s unikátním jménem (`unique`).
import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const ADMIN = { userName: 'admin', password: 'Admin5678', displayName: 'Administrátor' };

/** Jméno, které nemůže kolidovat s jiným testem ani opakovaným během. */
export function unique(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Zajistí, že v systému existuje admin. První běh proti čerstvé databázi
 * projde přes `/auth/setup`, další už jen zjistí, že setup není potřeba.
 */
export async function ensureAdmin(request: APIRequestContext): Promise<void> {
  const status = await request.get('/auth/setup-required');
  const { required } = (await status.json()) as { required: boolean };
  if (!required) return;

  const created = await request.post('/auth/setup', { data: ADMIN });
  expect(created.ok(), 'setup admina musí projít').toBeTruthy();
}

export interface TestUser {
  userName: string;
  password: string;
  displayName: string;
}

/**
 * Založí uživatelský účet pod adminem a vrátí jeho přihlašovací údaje.
 *
 * Zobrazované jméno dostane vlastní příponu: testy sdílí jednu databázi
 * a stejnojmenní uživatelé by dělali víceznačné lokátory (`getByText`
 * by v přísném režimu spadl na několika shodách).
 */
export async function createUser(
  request: APIRequestContext,
  displayName: string
): Promise<TestUser> {
  await ensureAdmin(request);
  const admin = await request.post('/auth/login', {
    data: { userName: ADMIN.userName, password: ADMIN.password },
  });
  expect(admin.ok(), 'přihlášení admina').toBeTruthy();

  const user: TestUser = {
    userName: unique('u'),
    password: 'Heslo1234',
    displayName: `${displayName} ${unique('').slice(1, 7)}`,
  };
  const created = await request.post('/admin/users', { data: user });
  expect(created.ok(), `vytvoření účtu ${displayName}`).toBeTruthy();
  return user;
}

/** Projde přihlašovacím formulářem a počká na seznam projektů. */
export async function loginAs(page: Page, user: TestUser): Promise<void> {
  await page.goto('/');
  await page.getByLabel(/uživatelské jméno/i).fill(user.userName);
  await page.getByLabel(/heslo/i).fill(user.password);
  await page.getByRole('button', { name: /přihlásit/i }).click();
  await expectSignedIn(page, user);
}

/**
 * Uživatelské menu v hlavičce. Hledá se přes `aria-label`, ne přes text:
 * stejné jméno se objevuje i v seznamu členů projektu.
 */
export async function expectSignedIn(page: Page, user: TestUser): Promise<void> {
  await expect(page.getByLabel(`Uživatelské menu — ${user.displayName}`)).toBeVisible();
}

/** Založí projekt přes UI a otevře ho. Vrací jeho název. */
export async function createProject(page: Page, name: string): Promise<string> {
  await page.getByRole('button', { name: /nový projekt/i }).click();
  await page.getByPlaceholder(/název projektu/i).fill(name);
  await page.getByRole('button', { name: /^vytvořit$/i }).click();
  await expectProjectOpen(page, name);
  return name;
}

/**
 * Počká, až je projekt otevřený.
 *
 * Záměrně se neopírá o název záložky: `TabBar` je stylovaný
 * `text-transform: uppercase`, takže přístupné jméno záložky se liší od
 * textu ve zdrojáku. Tlačítko „← Projekty" a název v hlavičce jsou stabilní.
 */
export async function expectProjectOpen(page: Page, name: string): Promise<void> {
  await expect(page.getByRole('button', { name: /← Projekty/ })).toBeVisible();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

/**
 * Přidá člena do otevřeného projektu (záložka Projekt, sekce Členové).
 *
 * Pořadí je významné: tlačítko „Přidat člena" je disabled, dokud není
 * v rozbalovacím seznamu někdo vybraný.
 */
export async function addMember(
  page: Page,
  member: TestUser,
  role: 'dev' | 'pm' = 'dev'
): Promise<void> {
  await page.getByRole('tab', { name: 'Projekt' }).click();
  await page.getByLabel('Uživatel k přidání').selectOption({ label: member.displayName });
  if (role === 'pm') await page.getByLabel('Role nového člena').selectOption('pm');
  await page.getByRole('button', { name: 'Přidat člena' }).click();
  await expect(page.getByText(member.displayName, { exact: false }).first()).toBeVisible();
}

/** Otevře projekt ze seznamu na LandingPage. */
export async function openProject(page: Page, name: string): Promise<void> {
  await page.getByText(name, { exact: true }).click();
  await expectProjectOpen(page, name);
}

/**
 * Otevře projekt a nastaví mu datumy.
 *
 * Bez datumů má projekt nula týdnů, takže Kapacita ani Harmonogram nemají do
 * čeho kreslit — `Milestone.weekIndex` i `Task.s`/`e` indexují do `Week[]`.
 */
export async function setProjectDates(
  page: Page,
  start = '2026-01-05',
  end = '2026-07-03'
): Promise<void> {
  await page.getByRole('tab', { name: 'Projekt' }).click();
  await page.getByLabel('Začátek').fill(start);
  await page.getByLabel('Konec').fill(end);
  // Počet týdnů si dopočítá `computeWeeks` — čekáme jen na to, že hlavička
  // nějaký počet ukazuje. Konkrétní číslo tu bylo natvrdo („26 týdnů") a
  // fixture tím šla použít jen s výchozím rozsahem.
  await expect(page.getByText(/\d+ týdnů/).first()).toBeVisible();
}

/**
 * Otevře panel Quick Notes, pokud ještě otevřený není.
 *
 * Stav panelu přežívá reload (`useQuickNotesPanelOpen`), takže bezpodmínečné
 * kliknutí na „📝 Poznámky" po `page.reload()` panel naopak ZAVŘE — a dokud je
 * otevřený, překrývá vlastní přepínací tlačítko, takže klik ani neprojde.
 */
export async function openNotesPanel(page: Page): Promise<void> {
  const panel = page.getByRole('dialog', { name: 'Quick Notes' });
  if (!(await panel.isVisible())) {
    await page.getByRole('button', { name: /Poznámky/ }).click();
  }
  await expect(panel).toBeVisible();
}

/** Přepne aplikaci do offline režimu a počká, až to UI zaregistruje. */
export async function goOffline(page: Page): Promise<void> {
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
}

export async function goOnline(page: Page): Promise<void> {
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
}
