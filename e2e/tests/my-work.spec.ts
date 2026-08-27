// Přehled práce napříč projekty (PRD-08, ADR-015) proti běžícímu serveru.
//
// Jediná obrazovka, která čte víc projektů najednou — a jediná, která obchází
// actory a čte `state_json`. Unit testy vidí buď jen serverovou projekci, nebo
// jen klientský rozpad do týdnů; že spolu ta dvě čísla souhlasí, ukáže teprve
// průchod přes skutečný server.
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  addMember,
  createProject,
  createUser,
  loginAs,
  openProject,
  setProjectDates,
  unique,
  type TestUser,
} from './fixtures';

/**
 * Počká, až se očekávaná hodnota objeví, a mezitím tluče na „Obnovit".
 *
 * Přehled se čte mimo actory (ADR-015) a actor persistuje po ticku
 * (`PersistInterval`, 5 s), takže čerstvě zadaný úkol v něm ještě nemusí být.
 * Není to nestabilita testu — je to vlastnost, kterou obrazovka přiznává
 * v podhlavičce a řeší tlačítkem.
 */
async function expectAfterRefresh(page: Page, locator: Locator): Promise<void> {
  await expect(async () => {
    await page.getByRole('button', { name: /Obnovit/ }).click();
    await expect(locator).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
}

/** Osoba v Kapacitě spárovaná s účtem — bez toho nemá uživatel nic „vlastního". */
async function addLinkedPerson(page: Page, member: TestUser): Promise<void> {
  await page.getByRole('tab', { name: 'Kapacita' }).click();
  await page.getByRole('button', { name: '+ Přidat člena' }).click();
  const nameField = page.getByLabel(/^Jméno — /).last();
  await nameField.fill(member.displayName);
  await nameField.blur();
  await expect(page.getByLabel(`Jméno — ${member.displayName}`)).toBeVisible();

  await page
    .getByLabel(`Účet — ${member.displayName}`)
    .selectOption({ label: member.displayName });
}

/** Úkol přiřazený osobě, se zadaným rozsahem týdnů a MD. */
async function addTask(
  page: Page,
  opts: { name: string; from: number; to: number; md: number }
): Promise<void> {
  await page.getByRole('tab', { name: 'Úkoly' }).click();
  await page.getByRole('button', { name: '+ Přidat úkol' }).first().click();
  const nameField = page.getByLabel(/^Název úkolu — /).last();
  await nameField.fill(opts.name);
  await nameField.blur();
  await expect(page.getByLabel(`Název úkolu — ${opts.name}`)).toBeVisible();

  await page.getByLabel(`Do týdne — ${opts.name}`).fill(String(opts.to));
  await page.getByLabel(`Od týdne — ${opts.name}`).fill(String(opts.from));
  await page.getByLabel(`MD — ${opts.name}`).fill(String(opts.md));
  await page.getByLabel(`MD — ${opts.name}`).blur();
}

/**
 * Projekt s Petřinou osobou a jedním jejím úkolem.
 *
 * Vrací název projektu; datumy jsou parametrem, protože jádro věci je, že W1
 * dvou projektů se stejným číslem týdne padne na různé kalendářní týdny.
 */
async function projectWithTask(
  page: Page,
  dev: TestUser,
  opts: { prefix: string; start: string; end: string; task: string; md: number }
): Promise<string> {
  const name = unique(opts.prefix);
  await createProject(page, name);
  await setProjectDates(page, opts.start, opts.end);
  await addMember(page, dev);
  await addLinkedPerson(page, dev);
  await addTask(page, { name: opts.task, from: 1, to: 1, md: opts.md });
  await page.getByRole('button', { name: /← Projekty/ }).click();
  return name;
}

test.describe('Moje práce', () => {
  // @scenario: my-work.feature > Úkoly ze všech projektů na jedné obrazovce
  // @scenario: my-work.feature > Úkoly jsou seskupené podle kalendářních týdnů
  // @scenario: my-work.feature > Proklik otevře detail toho úkolu
  test('sečte úkoly ze dvou projektů do kalendářních týdnů', async ({ browser, request }) => {
    const pm = await createUser(request, 'Jan Novák');
    const dev = await createUser(request, 'Petra Kolářová');

    const pmContext = await browser.newContext();
    const pmPage = await pmContext.newPage();
    await loginAs(pmPage, pm);

    // Dva projekty, které začínají v jiném týdnu. Oba mají úkol ve „svém" W1,
    // takže v přehledu musí skončit ve dvou různých kalendářních týdnech.
    await projectWithTask(pmPage, dev, {
      prefix: 'Backend',
      start: '2026-01-05',
      end: '2026-07-03',
      task: 'Refaktoring API',
      md: 3,
    });
    const mobile = await projectWithTask(pmPage, dev, {
      prefix: 'Mobil',
      start: '2026-02-02',
      end: '2026-07-03',
      task: 'Přihlášení v appce',
      md: 2,
    });

    const devContext = await browser.newContext();
    const devPage = await devContext.newPage();
    await loginAs(devPage, dev);
    await devPage.getByRole('button', { name: /Moje práce/ }).click();

    // Obojí je vidět na jednom místě, i když leží v různých projektech.
    // Čeká se na úkol z druhého projektu — ten se persistuje jako poslední,
    // takže jakmile je tam on, je tam i ten první.
    await expectAfterRefresh(devPage, devPage.getByText('Přihlášení v appce'));
    await expect(devPage.getByText('Refaktoring API')).toBeVisible();

    // …ale ve dvou různých týdnech: W1 dvou projektů není totéž.
    await expect(devPage.getByText('Týden od 5.1.2026')).toBeVisible();
    await expect(devPage.getByText('Týden od 2.2.2026')).toBeVisible();
    await expect(devPage.getByText('3 / 5 MD')).toBeVisible();
    await expect(devPage.getByText('2 / 5 MD')).toBeVisible();

    // Proklik otevře přímo detail úkolu — a to v projektu, kde leží.
    await devPage.getByText('Přihlášení v appce').click();
    await expect(devPage.getByText(mobile, { exact: false }).first()).toBeVisible();
    await expect(devPage.getByLabel('Popis úkolu')).toBeVisible();

    // Po zavření se detail sám neotevře znovu.
    await devPage.getByRole('button', { name: /Zrušit/ }).click();
    await expect(devPage.getByLabel('Popis úkolu')).toHaveCount(0);
    await expect(devPage.getByLabel('Název úkolu — Přihlášení v appce')).toBeVisible();

    await pmContext.close();
    await devContext.close();
  });

  // @scenario: my-work.feature > Přetížení napříč projekty je vidět
  test('práce ze dvou projektů ve stejném týdnu se sečte a svítí', async ({ browser, request }) => {
    const pm = await createUser(request, 'Jan Novák');
    const dev = await createUser(request, 'Petra Kolářová');

    const pmContext = await browser.newContext();
    const pmPage = await pmContext.newPage();
    await loginAs(pmPage, pm);

    // Stejný začátek, stejný týden — přesně situace „na dvou projektech po
    // 100 %", kterou uvnitř jednoho projektu nikdo neuvidí.
    for (const [prefix, task, md] of [
      ['Alfa', 'Úkol v Alfě', 3],
      ['Beta', 'Úkol v Betě', 4],
    ] as const) {
      await projectWithTask(pmPage, dev, {
        prefix,
        start: '2026-01-05',
        end: '2026-07-03',
        task,
        md,
      });
    }

    const devContext = await browser.newContext();
    const devPage = await devContext.newPage();
    await loginAs(devPage, dev);
    await devPage.getByRole('button', { name: /Moje práce/ }).click();

    // 7 MD proti pěti pracovním dnům — ani jeden z projektů o tom sám neví.
    await expectAfterRefresh(devPage, devPage.getByText('7 / 5 MD'));

    await pmContext.close();
    await devContext.close();
  });

  // @scenario: my-work.feature > Bez spárované osoby přehled vysvětlí, co chybí
  test('bez spárované osoby přehled poradí, co chybí', async ({ page, request }) => {
    const user = await createUser(request, 'Nový Kolega');
    await loginAs(page, user);
    await page.getByRole('button', { name: /Moje práce/ }).click();

    await expect(page.getByText(/musí vás PM v Kapacitě spárovat/)).toBeVisible();
  });

  // @scenario: my-work.feature > Archivované projekty se do přehledu nepočítají
  test('archivovaný projekt v přehledu není', async ({ browser, request }) => {
    const pm = await createUser(request, 'Jan Novák');
    const dev = await createUser(request, 'Petra Kolářová');

    const pmContext = await browser.newContext();
    const pmPage = await pmContext.newPage();
    await loginAs(pmPage, pm);
    const name = await projectWithTask(pmPage, dev, {
      prefix: 'Archiv',
      start: '2026-01-05',
      end: '2026-07-03',
      task: 'Úkol k archivaci',
      md: 3,
    });

    const devContext = await browser.newContext();
    const devPage = await devContext.newPage();
    await loginAs(devPage, dev);
    await devPage.getByRole('button', { name: /Moje práce/ }).click();
    await expectAfterRefresh(devPage, devPage.getByText('Úkol k archivaci'));

    pmPage.once('dialog', (dialog) => dialog.accept());
    await pmPage.getByTitle('Archivovat').first().click();
    await expect(pmPage.getByText(name, { exact: true })).toHaveCount(0);

    // Přehled je o rozdělané práci, ne o archivu.
    await devPage.getByRole('button', { name: /Obnovit/ }).click();
    await expect(devPage.getByText('Úkol k archivaci')).toHaveCount(0);

    await pmContext.close();
    await devContext.close();
  });
});
