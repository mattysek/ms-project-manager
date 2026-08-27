// Offline režim a dohrání změn po návratu spojení (PRD-05, ADR-009).
//
// Tohle jsou testy, které v unit vrstvě nejdou napsat poctivě: potřebují
// skutečnou IndexedDB, skutečný SignalR, který se rozpadne, a skutečný server,
// který mezitím může stav změnit pod rukama. `useOfflineSync` má vlastní unit
// testy, ale ty si server i frontu mockují — právě proto sem patří i zdánlivě
// triviální ověření, že se command po reconnectu opravdu dostane do databáze.
import { expect, test, type Page } from '@playwright/test';
import {
  addMember,
  createProject,
  createUser,
  goOffline,
  goOnline,
  loginAs,
  openNotesPanel,
  openProject,
  setProjectDates,
  unique,
  type TestUser,
} from './fixtures';

const OFFLINE_BANNER = /Offline — pracujete bez připojení/;

/** Přihlášený PM s otevřeným projektem, datumy a jedním člověkem v Kapacitě. */
async function projectWithPerson(page: Page, request: Parameters<typeof createUser>[0]) {
  const user = await createUser(request, 'Jan Novák');
  await loginAs(page, user);
  const name = unique('Offline');
  await createProject(page, name);
  await setProjectDates(page);

  await page.getByRole('tab', { name: 'Kapacita' }).click();
  await page.getByRole('button', { name: '+ Přidat člena' }).click();
  await page.getByLabel(/^Jméno — /).last().fill('Petra Kolářová');
  await expect(page.getByLabel('Jméno — Petra Kolářová')).toBeVisible();

  return { user, name };
}

/** Úkol s výchozím názvem u první osoby — společný základ offline scénářů. */
async function addTask(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Úkoly' }).click();
  await page.getByRole('button', { name: '+ Přidat úkol' }).click();
  await expect(page.getByLabel('MD — Nový úkol')).toBeVisible();
}

test.describe('Offline režim', () => {
  test('banner se objeví při výpadku a zmizí po obnovení spojení', async ({ page, request }) => {
    await projectWithPerson(page, request);

    await goOffline(page);
    await expect(page.getByText(OFFLINE_BANNER)).toBeVisible();

    await goOnline(page);
    await expect(page.getByText(OFFLINE_BANNER)).toHaveCount(0);
  });

  test('změna provedená offline je vidět hned a banner počítá čekající změny', async ({
    page,
    request,
  }) => {
    await projectWithPerson(page, request);
    await addTask(page);

    await goOffline(page);
    await expect(page.getByText(OFFLINE_BANNER)).toBeVisible();

    const md = page.getByLabel('MD — Nový úkol');
    await md.fill('7');
    await md.blur();

    // Optimistická aplikace: hodnota je na obrazovce bez ohledu na server.
    await expect(md).toHaveValue('7');
    await expect(page.getByText(/1 čekající změna/)).toBeVisible();
  });

  test('víc změn se ve frontě kumuluje a text se skloňuje', async ({ page, request }) => {
    await projectWithPerson(page, request);
    await addTask(page);

    await goOffline(page);
    await expect(page.getByText(OFFLINE_BANNER)).toBeVisible();

    const md = page.getByLabel('MD — Nový úkol');
    for (const value of ['2', '3']) {
      await md.fill(value);
      await md.blur();
    }
    await expect(page.getByText(/2 čekající změny/)).toBeVisible();

    for (const value of ['4', '5', '6']) {
      await md.fill(value);
      await md.blur();
    }
    await expect(page.getByText(/5 čekajících změn/)).toBeVisible();
  });

  // POZOR: `offline.feature` má i scénář „Pending commandy přežijí reload
  // stránky při offline". Ten se tady napsat nedá a v prohlížeči ho nesplní ani
  // aplikace: bez service workeru se `index.html` ani assety offline nenačtou
  // (`ERR_INTERNET_DISCONNECTED`), takže není co obnovit. Že fronta přežívá v
  // IndexedDB, drží unit testy `storage/offlineQueue`; skutečný „zavři a otevři
  // záložku offline" bude proveditelný, až aplikace dostane service worker.

  test('po reconnectu se změna dohraje na server a přežije reload', async ({ page, request }) => {
    await projectWithPerson(page, request);
    await addTask(page);

    await goOffline(page);
    const md = page.getByLabel('MD — Nový úkol');
    await md.fill('8');
    await md.blur();
    await expect(page.getByText(/1 čekající změna/)).toBeVisible();

    await goOnline(page);
    await expect(page.getByText(/Synchronizováno/)).toBeVisible({ timeout: 20_000 });

    // Teprve reload dokáže, že hodnota je opravdu na serveru a ne jen v UI.
    await page.reload();
    await page.getByRole('tab', { name: 'Úkoly' }).click();
    await expect(page.getByLabel('MD — Nový úkol')).toHaveValue('8');
  });

  test('offline změna dorazí i druhému uživateli, jakmile se první vrátí online', async ({
    browser,
    request,
  }) => {
    const pm = await createUser(request, 'Jan Novák');
    const dev = await createUser(request, 'Petra Kolářová');

    const pmContext = await browser.newContext();
    const pmPage = await pmContext.newPage();
    await loginAs(pmPage, pm);
    const name = unique('OfflineSync');
    await createProject(pmPage, name);
    await setProjectDates(pmPage);
    await addMember(pmPage, dev);

    await pmPage.getByRole('tab', { name: 'Kapacita' }).click();
    await pmPage.getByRole('button', { name: '+ Přidat člena' }).click();
    await pmPage.getByLabel(/^Jméno — /).last().fill('Petra Kolářová');
    await expect(pmPage.getByLabel('Jméno — Petra Kolářová')).toBeVisible();
    await addTask(pmPage);

    const devContext = await browser.newContext();
    const devPage = await devContext.newPage();
    await loginAs(devPage, dev);
    await openProject(devPage, name);
    await devPage.getByRole('tab', { name: 'Úkoly' }).click();
    await expect(devPage.getByLabel('MD — Nový úkol')).toHaveValue('1');

    await goOffline(pmPage);
    const md = pmPage.getByLabel('MD — Nový úkol');
    await md.fill('4');
    await md.blur();
    await expect(pmPage.getByText(/1 čekající změna/)).toBeVisible();

    // Dokud je PM offline, druhý klient nesmí nic vidět — command nikam nešel.
    await expect(devPage.getByLabel('MD — Nový úkol')).toHaveValue('1');

    await goOnline(pmPage);
    await expect(devPage.getByLabel('MD — Nový úkol')).toHaveValue('4', { timeout: 20_000 });

    await pmContext.close();
    await devContext.close();
  });

  test('souběžná změna téhož pole skončí dialogem konfliktů', async ({ browser, request }) => {
    const pm = await createUser(request, 'Jan Novák');
    // Druhý účet musí být taky PM: úkol patří osobě bez navázaného účtu, a Dev
    // smí podle ADR-006 editovat jen úkoly osoby s `userId` rovným tomu svému —
    // jeho zápis by server zamítl a k žádnému konfliktu by nedošlo.
    const dev = await createUser(request, 'Petra Kolářová');

    const pmContext = await browser.newContext();
    const pmPage = await pmContext.newPage();
    await loginAs(pmPage, pm);
    const name = unique('Konflikt');
    await createProject(pmPage, name);
    await setProjectDates(pmPage);
    await addMember(pmPage, dev, 'pm');

    await pmPage.getByRole('tab', { name: 'Kapacita' }).click();
    await pmPage.getByRole('button', { name: '+ Přidat člena' }).click();
    await pmPage.getByLabel(/^Jméno — /).last().fill('Petra Kolářová');
    await expect(pmPage.getByLabel('Jméno — Petra Kolářová')).toBeVisible();
    await addTask(pmPage);

    const devContext = await browser.newContext();
    const devPage = await devContext.newPage();
    await loginAs(devPage, dev);
    await openProject(devPage, name);
    await devPage.getByRole('tab', { name: 'Úkoly' }).click();
    await expect(devPage.getByLabel('MD — Nový úkol')).toBeVisible();

    // PM upraví úkol offline…
    await goOffline(pmPage);
    const pmMd = pmPage.getByLabel('MD — Nový úkol');
    await pmMd.fill('10');
    await pmMd.blur();
    await expect(pmPage.getByText(/1 čekající změna/)).toBeVisible();

    // …zatímco Dev mění totéž pole online.
    const devMd = devPage.getByLabel('MD — Nový úkol');
    await devMd.fill('3');
    await devMd.blur();
    await devPage.reload();
    await devPage.getByRole('tab', { name: 'Úkoly' }).click();
    await expect(devPage.getByLabel('MD — Nový úkol')).toHaveValue('3');

    await goOnline(pmPage);
    await expect(pmPage.getByText(OFFLINE_BANNER)).toHaveCount(0);

    // `detectConflicts` porovná frontu proti serverovému stavu po reconnectu.
    const dialog = pmPage.getByText(/konflikt/i).first();
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    // `exact`, jinak by se trefilo i hromadné „Ponechat vše serverové".
    await pmPage.getByRole('button', { name: 'Ponechat serverovou', exact: true }).click();

    // Počkat na potvrzení, ne hned reloadovat: zahození commandu je zápis do
    // IndexedDB a hláška „Synchronizováno" se objeví až po něm. Reload o
    // milisekundu dřív stránku zabil uprostřed transakce, command ve frontě
    // přežil a nová session ho po připojení přehrála — na serveru pak skončila
    // offline hodnota, přestože uživatel vybral serverovou.
    await expect(pmPage.getByText(/Synchronizováno/)).toBeVisible();

    await pmPage.reload();
    await pmPage.getByRole('tab', { name: 'Úkoly' }).click();
    await expect(pmPage.getByLabel('MD — Nový úkol')).toHaveValue('3');

    await pmContext.close();
    await devContext.close();
  });

  test('Quick Notes se dají psát offline a nahrají se po návratu', async ({ page, request }) => {
    const user: TestUser = await createUser(request, 'Jan Novák');
    await loginAs(page, user);

    // Quick Notes jedou přes REST, ne přes command kanál — mají vlastní frontu
    // (`storage/noteQueue.ts`), a právě proto je potřeba testovat zvlášť.
    await goOffline(page);
    await openNotesPanel(page);
    await page.getByRole('button', { name: /Nová poznámka/i }).click();
    const editor = page.getByPlaceholder('Napište poznámku…');
    await editor.fill('Nápad z porady offline');
    await editor.blur();

    await goOnline(page);

    // Reload je jediný poctivý důkaz: po něm se seznam načte ze serveru.
    await page.waitForTimeout(2000);
    await page.reload();
    await openNotesPanel(page);
    await expect(page.getByText('Nápad z porady offline').first()).toBeVisible({ timeout: 20_000 });
  });

  test('import projektu je offline zakázaný', async ({ page, request }) => {
    const user = await createUser(request, 'Jan Novák');
    await loginAs(page, user);

    await goOffline(page);

    // Tlačítko zůstává klikatelné a odmítne se až v handleru — dřív blokujícím
    // `alert()`, teď pruhem s `role="alert"` (viz `NoticeBanner`).
    await page.getByRole('button', { name: '⬆ Import...' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Import projektu vyžaduje připojení k serveru'
    );
  });
});
