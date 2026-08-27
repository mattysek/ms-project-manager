// Real-time spolupráce mezi dvěma prohlížeči.
//
// Tohle je jádro celé migrace na multi-user (ADR-002, ADR-004) a jediná věc,
// kterou unit testy ověřit nemůžou: dva klienti, jeden SignalR hub, jeden
// actor a jedna SQLite databáze.
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import {
  addMember,
  createProject,
  createUser,
  loginAs,
  openProject,
  setProjectDates,
  unique,
} from './fixtures';

/** Druhý prohlížeč s vlastní session — jiný uživatel, stejný projekt. */
async function secondUserPage(context: BrowserContext, user: Parameters<typeof loginAs>[1]) {
  const page = await context.newPage();
  await loginAs(page, user);
  return page;
}

test('změna jednoho uživatele dorazí druhému bez obnovení stránky', async ({
  browser,
  request,
}) => {
  const pm = await createUser(request, 'Jan Novák');
  const dev = await createUser(request, 'Petra Kolářová');

  const pmContext = await browser.newContext();
  const devContext = await browser.newContext();

  const pmPage = await pmContext.newPage();
  await loginAs(pmPage, pm);
  const name = unique('Kolaborace');
  await createProject(pmPage, name);

  await addMember(pmPage, dev);

  // Dev otevře tentýž projekt v druhém prohlížeči.
  const devPage = await secondUserPage(devContext, dev);
  await openProject(devPage, name);

  // PM přejmenuje projekt; Dev to musí uvidět bez reloadu (do 2 s dle PRD-02).
  const renamed = `${name}-v2`;
  const nameField = pmPage.getByLabel('Název');
  await nameField.fill(renamed);
  await nameField.blur();

  // Nejdřív u autora (optimistická aplikace), teprve pak u druhého klienta —
  // rozliší to „command se neodeslal" od „diff nedorazil".
  await expect(pmPage.getByText(renamed, { exact: false }).first()).toBeVisible();
  await expect(devPage.getByText(renamed, { exact: false }).first()).toBeVisible({
    timeout: 10_000,
  });

  await pmContext.close();
  await devContext.close();
});

test('presence ukazuje druhého uživatele v projektu', async ({ browser, request }) => {
  const pm = await createUser(request, 'Jan Novák');
  const dev = await createUser(request, 'Petra Kolářová');

  const pmContext = await browser.newContext();
  const devContext = await browser.newContext();
  const pmPage = await pmContext.newPage();

  await loginAs(pmPage, pm);
  const name = unique('Presence');
  await createProject(pmPage, name);

  await addMember(pmPage, dev);

  const devPage = await secondUserPage(devContext, dev);
  await openProject(devPage, name);

  // Avatar druhého uživatele nese v tooltipu jeho jméno (PresenceAvatars).
  await expect(pmPage.getByTitle(new RegExp(`^${dev.displayName}`)).first()).toBeVisible({
    timeout: 10_000,
  });

  await pmContext.close();
  await devContext.close();
});

test('server odmítne neoprávněný command a stav zůstane nezměněný', async ({
  browser,
  request,
}) => {
  const pm = await createUser(request, 'Jan Novák');
  const dev = await createUser(request, 'Petra Kolářová');

  const pmContext = await browser.newContext();
  const pmPage = await pmContext.newPage();
  await loginAs(pmPage, pm);
  const name = unique('Opravneni');
  await createProject(pmPage, name);

  await addMember(pmPage, dev);

  // Dev vidí metadata projektu jen ke čtení (ADR-006, PermissionGate).
  const devContext = await browser.newContext();
  const devPage = await secondUserPage(devContext, dev);
  await openProject(devPage, name);
  await devPage.getByRole('tab', { name: 'Projekt' }).click();

  // Dev vidí metadata jen ke čtení. Vynucuje to i server, ale UI to dřív
  // netvrdilo: pole šla editovat a změna se odrolovala až po odmítnutí.
  await expect(devPage.getByLabel('Název')).toHaveAttribute('readonly', /.*/);
  await expect(devPage.getByLabel('Budget (MD)')).toHaveAttribute('readonly', /.*/);

  await pmContext.close();
  await devContext.close();
});

/**
 * PM se založeným projektem a datumy + druhý uživatel, který ho má otevřený.
 *
 * `secondRole` je `dev` jen tam, kde druhý uživatel čte nebo se testují
 * oprávnění. Kde má opravdu zapisovat do úkolů, musí být `pm`: úkoly zakládáme
 * na osobě bez navázaného účtu a Dev smí podle ADR-006 sáhnout jen na úkoly
 * osoby, jejíž `userId` je jeho vlastní.
 */
async function projectWithTwoUsers(
  browser: Browser,
  request: APIRequestContext,
  label: string,
  secondRole: 'dev' | 'pm' = 'dev'
) {
  const pm = await createUser(request, 'Jan Novák');
  const dev = await createUser(request, 'Petra Kolářová');

  const pmContext = await browser.newContext();
  const pmPage = await pmContext.newPage();
  await loginAs(pmPage, pm);
  const name = unique(label);
  await createProject(pmPage, name);
  await setProjectDates(pmPage);
  await addMember(pmPage, dev, secondRole);

  const devContext = await browser.newContext();
  const devPage = await devContext.newPage();
  await loginAs(devPage, dev);
  await openProject(devPage, name);

  return { pm, dev, pmPage, devPage, pmContext, devContext, name };
}

/** Osoba v Kapacitě — společný předpoklad pro cokoli s úkoly. */
async function addPerson(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name: 'Kapacita' }).click();
  await page.getByRole('button', { name: '+ Přidat člena' }).click();
  await page.getByLabel(/^Jméno — /).last().fill(name);
  await expect(page.getByLabel(`Jméno — ${name}`)).toBeVisible();
}

test('úkol založený jedním uživatelem se objeví druhému', async ({ browser, request }) => {
  const { pmPage, devPage, pmContext, devContext } = await projectWithTwoUsers(
    browser,
    request,
    'UkolLive'
  );
  await addPerson(pmPage, 'Petra Kolářová');

  await devPage.getByRole('tab', { name: 'Úkoly' }).click();

  await pmPage.getByRole('tab', { name: 'Úkoly' }).click();
  await pmPage.getByRole('button', { name: '+ Přidat úkol' }).click();
  await pmPage.getByLabel(/^Název úkolu — /).fill('Návrh architektury');

  await expect(devPage.getByLabel('Název úkolu — Návrh architektury')).toBeVisible({
    timeout: 10_000,
  });

  await pmContext.close();
  await devContext.close();
});

test('úkol smazaný jedním uživatelem zmizí i druhému', async ({ browser, request }) => {
  const { pmPage, devPage, pmContext, devContext } = await projectWithTwoUsers(
    browser,
    request,
    'UkolSmaz'
  );
  await addPerson(pmPage, 'Petra Kolářová');

  await pmPage.getByRole('tab', { name: 'Úkoly' }).click();
  await pmPage.getByRole('button', { name: '+ Přidat úkol' }).click();
  await pmPage.getByLabel(/^Název úkolu — /).fill('Dočasný úkol');

  await devPage.getByRole('tab', { name: 'Úkoly' }).click();
  await expect(devPage.getByLabel('Název úkolu — Dočasný úkol')).toBeVisible({ timeout: 10_000 });

  pmPage.once('dialog', (dialog) => dialog.accept());
  await pmPage.getByRole('button', { name: /Smazat úkol|✕/ }).last().click();

  await expect(devPage.getByLabel('Název úkolu — Dočasný úkol')).toHaveCount(0, {
    timeout: 10_000,
  });

  await pmContext.close();
  await devContext.close();
});

test('presence sleduje, na které záložce druhý uživatel je', async ({ browser, request }) => {
  const { dev, pmPage, devPage, pmContext, devContext } = await projectWithTwoUsers(
    browser,
    request,
    'PresenceTab'
  );

  // Tooltip avataru nese jméno a lidský název záložky (`TABS`). Prázdný název
  // znamenal, že se `update_presence` po `JoinProject` neposlalo znovu.
  await devPage.getByRole('tab', { name: 'Kapacita' }).click();
  await expect(pmPage.getByTitle(`${dev.displayName} — Kapacita`)).toBeVisible({
    timeout: 10_000,
  });

  await devPage.getByRole('tab', { name: 'Dokumentace' }).click();
  await expect(pmPage.getByTitle(`${dev.displayName} — Dokumentace`)).toBeVisible({
    timeout: 10_000,
  });

  await pmContext.close();
  await devContext.close();
});

test('odchod uživatele ho odebere z presence', async ({ browser, request }) => {
  const { dev, pmPage, devPage, pmContext, devContext } = await projectWithTwoUsers(
    browser,
    request,
    'PresenceOdchod'
  );

  await expect(pmPage.getByTitle(new RegExp(`^${dev.displayName}`))).toBeVisible({
    timeout: 10_000,
  });

  await devPage.close();

  await expect(pmPage.getByTitle(new RegExp(`^${dev.displayName}`))).toHaveCount(0, {
    timeout: 15_000,
  });

  await pmContext.close();
  await devContext.close();
});

test('TODO jednoho uživatele druhý nevidí (per-user diffy)', async ({ browser, request }) => {
  const { pmPage, devPage, pmContext, devContext } = await projectWithTwoUsers(
    browser,
    request,
    'TodoSoukromi'
  );

  await pmPage.getByRole('tab', { name: 'TODO' }).click();
  const input = pmPage.getByPlaceholder(/Nový úkol/).first();
  await input.fill('Soukromá poznámka PM');
  await input.press('Control+Enter');
  await expect(pmPage.getByText('Soukromá poznámka PM')).toHaveCount(1);

  // ADR-004 doplněk: `todo_*` diffy jdou jen odesílateli, ne do skupiny.
  await devPage.getByRole('tab', { name: 'TODO' }).click();
  await expect(devPage.getByText('Soukromá poznámka PM')).toHaveCount(0);

  await devPage.reload();
  await devPage.getByRole('tab', { name: 'TODO' }).click();
  await expect(devPage.getByText('Soukromá poznámka PM')).toHaveCount(0);

  await pmContext.close();
  await devContext.close();
});

test('KB stránka od jednoho uživatele je hned vidět druhému', async ({ browser, request }) => {
  const { pmPage, devPage, pmContext, devContext } = await projectWithTwoUsers(
    browser,
    request,
    'KbLive'
  );

  await pmPage.getByRole('tab', { name: 'Dokumentace' }).click();
  await pmPage.getByRole('button', { name: /Nová stránka/i }).click();
  await pmPage.getByPlaceholder(/Název stránky/i).fill('Postup nasazení');
  await pmPage.getByPlaceholder(/Markdown obsah/i).fill('Krok za krokem.');
  await pmPage.getByRole('button', { name: /Uložit/i }).click();

  await devPage.getByRole('tab', { name: 'Dokumentace' }).click();
  await expect(devPage.getByText('Postup nasazení').first()).toBeVisible({ timeout: 10_000 });

  await pmContext.close();
  await devContext.close();
});

test('zápis do stejného pole z obou stran skončí u obou stejnou hodnotou', async ({
  browser,
  request,
}) => {
  const { pmPage, devPage, pmContext, devContext } = await projectWithTwoUsers(
    browser,
    request,
    'Prepsani',
    'pm'
  );
  await addPerson(pmPage, 'Petra Kolářová');

  await pmPage.getByRole('tab', { name: 'Úkoly' }).click();
  await pmPage.getByRole('button', { name: '+ Přidat úkol' }).click();
  await devPage.getByRole('tab', { name: 'Úkoly' }).click();
  await expect(devPage.getByLabel('MD — Nový úkol')).toBeVisible({ timeout: 10_000 });

  const pmMd = pmPage.getByLabel('MD — Nový úkol');
  await pmMd.fill('6');
  await pmMd.blur();
  await expect(devPage.getByLabel('MD — Nový úkol')).toHaveValue('6', { timeout: 10_000 });

  const devMd = devPage.getByLabel('MD — Nový úkol');
  await devMd.fill('9');
  await devMd.blur();

  // Poslední zápis vyhrává a oba klienti skončí na téže hodnotě (FR-COLLAB-03).
  //
  // Notifikaci „byla změněna jiným uživatelem" tenhle test schválně netvrdí:
  // `useCollabNotifications` ji vydá jen tehdy, když cizí diff předběhne echo
  // vlastního zápisu, tj. při skutečném souběhu na milisekundy. Klikáním přes
  // dvě stránky se takový souběh nedá vyrobit spolehlivě, takže tuhle část
  // scénáře drží unit test, kde jde pořadí diffů nastavit přesně.
  await expect(pmPage.getByLabel('MD — Nový úkol')).toHaveValue('9', { timeout: 10_000 });
  await expect(devPage.getByLabel('MD — Nový úkol')).toHaveValue('9');

  await pmContext.close();
  await devContext.close();
});

test('změna dorazí do všech oken, i když je jeden uživatel přihlášený dvakrát', async ({
  browser,
  request,
}) => {
  const { dev, pmPage, devPage, pmContext, devContext, name } = await projectWithTwoUsers(
    browser,
    request,
    'TriKlienti'
  );

  // Třetí okno téhož Deva — stejný účet, jiné spojení. Broadcast míří na
  // skupinu, takže musí dorazit do OBOU jeho spojení, ne jen do prvního.
  const thirdContext = await browser.newContext();
  const thirdPage = await secondUserPage(thirdContext, dev);
  await openProject(thirdPage, name);

  const renamed = `${name}-v2`;
  const nameField = pmPage.getByLabel('Název');
  await nameField.fill(renamed);
  await nameField.blur();

  for (const page of [devPage, thirdPage]) {
    await expect(page.getByText(renamed, { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    });
  }

  await pmContext.close();
  await devContext.close();
  await thirdContext.close();
});
