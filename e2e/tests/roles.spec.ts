// Role, členství, archivace a undo/redo — všechno cesty, které nejdou čistě
// přes command kanál a mají vlastní seam mezi REST a actorem.
//
// `role_changed` vzniká v REST vrstvě a míří na DOTČENÉHO uživatele, ne do
// skupiny (ADR-004 doplněk); archivace prochází `Retire` v registru actorů;
// undo/redo server odmítá a klient posílá inverzní command sám (ADR-007).
// Žádnou z těch tří věcí unit testy proti skutečnému serveru neověří.
import { expect, test, type Page } from '@playwright/test';
import {
  addMember,
  createProject,
  createUser,
  loginAs,
  openNotesPanel,
  openProject,
  setProjectDates,
  unique,
} from './fixtures';

/** Osoba v Kapacitě — předpoklad pro cokoli s úkoly. */
async function addPerson(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name: 'Kapacita' }).click();
  await page.getByRole('button', { name: '+ Přidat člena' }).click();
  await page.getByLabel(/^Jméno — /).last().fill(name);
  await expect(page.getByLabel(`Jméno — ${name}`)).toBeVisible();
}

test.describe('Role a členství', () => {
  test('povýšení na PM dorazí dotčenému uživateli bez reloadu', async ({ browser, request }) => {
    const pm = await createUser(request, 'Jan Novák');
    const dev = await createUser(request, 'Petra Kolářová');

    const pmContext = await browser.newContext();
    const pmPage = await pmContext.newPage();
    await loginAs(pmPage, pm);
    const name = unique('Role');
    await createProject(pmPage, name);
    await addMember(pmPage, dev);

    const devContext = await browser.newContext();
    const devPage = await devContext.newPage();
    await loginAs(devPage, dev);
    await openProject(devPage, name);
    await devPage.getByRole('tab', { name: 'Projekt' }).click();

    // Dev vidí u svého jména [Dev] a metadata jen ke čtení.
    await expect(devPage.getByLabel(`Uživatelské menu — ${dev.displayName}`)).toContainText('Dev');
    await expect(devPage.getByLabel('Název')).toHaveAttribute('readonly', /.*/);

    await pmPage.getByLabel(`Změnit roli — ${dev.displayName}`).selectOption('pm');

    // `role_changed` je adresovaný jednomu uživateli — musí dorazit bez reloadu
    // a UI se má hned odemknout.
    await expect(devPage.getByLabel(`Uživatelské menu — ${dev.displayName}`)).toContainText('PM', {
      timeout: 10_000,
    });
    await expect(devPage.getByLabel('Název')).not.toHaveAttribute('readonly', /.*/);

    await pmContext.close();
    await devContext.close();
  });

  test('projekt nelze nechat bez PM', async ({ page, request }) => {
    const pm = await createUser(request, 'Jan Novák');
    await loginAs(page, pm);
    await createProject(page, unique('SolePm'));
    await page.getByRole('tab', { name: 'Projekt' }).click();

    // Jediný PM se nesmí degradovat — jinak projekt osiří a nikdo ho nespraví
    // (Admin nemá projektová práva). Server to odmítne a sekce členů vypíše
    // chybu do `role="alert"`, žádný nativní dialog se nekoná.
    await page.getByLabel(`Změnit roli — ${pm.displayName}`).selectOption('dev');

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByLabel(`Změnit roli — ${pm.displayName}`)).toHaveValue('pm');
  });

  test('odebraný člen ztratí přístup k projektu', async ({ browser, request }) => {
    const pm = await createUser(request, 'Jan Novák');
    const dev = await createUser(request, 'Petra Kolářová');

    const pmContext = await browser.newContext();
    const pmPage = await pmContext.newPage();
    await loginAs(pmPage, pm);
    const name = unique('Odebrani');
    await createProject(pmPage, name);
    await addMember(pmPage, dev);

    const devContext = await browser.newContext();
    const devPage = await devContext.newPage();
    await loginAs(devPage, dev);
    await expect(devPage.getByText(name, { exact: true })).toBeVisible();

    pmPage.once('dialog', (dialog) => dialog.accept());
    await pmPage.getByLabel(`Odebrat — ${dev.displayName}`).click();
    // Ne podle jména: odebraný uživatel se hned objeví v nabídce „Uživatel k
    // přidání", takže jeho jméno na stránce zůstane. Zmizí až jeho řádek.
    await expect(pmPage.getByLabel(`Odebrat — ${dev.displayName}`)).toHaveCount(0);

    // Po odebrání projekt zmizí i ze seznamu bývalého člena.
    await devPage.reload();
    await expect(devPage.getByText(name, { exact: true })).toHaveCount(0);

    await pmContext.close();
    await devContext.close();
  });
});

test.describe('Archivace projektu', () => {
  test('archivovaný projekt se přesune do archivu a dá se vrátit', async ({ page, request }) => {
    const user = await createUser(request, 'Jan Novák');
    await loginAs(page, user);
    const name = unique('Archiv');
    await createProject(page, name);

    await page.getByRole('button', { name: /← Projekty/ }).click();
    await expect(page.getByText(name, { exact: true })).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTitle('Archivovat').first().click();

    // Archiv je sbalený, takže po archivaci projekt ze seznamu zmizí.
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: /Archiv \(/ }).click();
    await expect(page.getByText(name, { exact: true })).toBeVisible();

    await page.getByTitle('Vrátit z archivu').first().click();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  });

  test('smazat jde až archivovaný projekt', async ({ page, request }) => {
    const user = await createUser(request, 'Jan Novák');
    await loginAs(page, user);
    const name = unique('Smazani');
    const created = await page.request.post('/api/projects', { data: { name } });
    expect(created.ok()).toBeTruthy();
    const { id } = (await created.json()) as { id: string };

    // Nevratné mazání se schválně nedá spustit jedním klikem: server odmítne
    // cokoli, co není nejdřív archivované.
    const tooEarly = await page.request.delete(`/api/projects/${id}`);
    expect(tooEarly.status()).toBe(400);

    const archived = await page.request.post(`/api/projects/${id}/archive`);
    expect(archived.ok()).toBeTruthy();

    const deleted = await page.request.delete(`/api/projects/${id}`);
    expect(deleted.ok()).toBeTruthy();

    await page.reload();
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  });
});

test.describe('Archiv je jen ke čtení', () => {
  // @scenario: project-management.feature > Archivovaný projekt je jen ke čtení
  // @scenario: project-management.feature > Vrácení z archivu zápis zase povolí
  test('archivovaný projekt nejde editovat, po vrácení zase ano', async ({ page, request }) => {
    const user = await createUser(request, 'Jan Novák');
    await loginAs(page, user);
    const name = unique('Frozen');
    await createProject(page, name);
    await setProjectDates(page);
    await addPerson(page, 'Petra Kolářová');

    await page.getByRole('tab', { name: 'Úkoly' }).click();
    await page.getByRole('button', { name: '+ Přidat úkol' }).first().click();
    const md = page.getByLabel('MD — Nový úkol');
    await md.fill('7');
    await md.blur();
    await expect(md).toHaveValue('7');

    // Archivace ze seznamu projektů.
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /← Projekty/ }).click();
    await page.getByTitle('Archivovat').first().click();
    // Archiv je sbalený, takže projekt ze seznamu nejdřív zmizí — bez tohohle
    // čekání se kliká do karty, kterou React právě přesouvá mezi sekcemi.
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: /Archiv \(/ }).click();

    // Archivovaný projekt jde pořád otevřít — kvůli tomu se archivuje místo
    // mazání — ale musí to být na první pohled poznat.
    await page.getByText(name, { exact: true }).click();
    await expect(page.getByText(/Projekt je archivovaný — jen ke čtení/)).toBeVisible();

    await page.getByRole('tab', { name: 'Úkoly' }).click();
    await page.getByLabel('MD — Nový úkol').fill('12');
    await page.getByLabel('MD — Nový úkol').blur();

    // Server odmítne, klient vrátí zpět — a nově i řekne proč.
    await expect(page.getByRole('alert')).toContainText('archivovaný');
    await expect(page.getByLabel('MD — Nový úkol')).toHaveValue('7');

    // Vrácení z archivu zápis zase povolí. Bez invalidace cache v `setArchived`
    // by projekt zůstal zamčený, dokud si server cache sám nezahodí.
    await page.getByRole('button', { name: /← Projekty/ }).click();
    await page.getByRole('button', { name: /Archiv \(/ }).click();
    await page.getByTitle('Vrátit z archivu').first().click();
    await expect(page.getByRole('button', { name: /Archiv \(/ })).toHaveCount(0);

    await page.getByText(name, { exact: true }).click();
    await expect(page.getByText(/Projekt je archivovaný/)).toHaveCount(0);

    await page.getByRole('tab', { name: 'Úkoly' }).click();
    await page.getByLabel('MD — Nový úkol').fill('12');
    await page.getByLabel('MD — Nový úkol').blur();
    await page.reload();
    await page.getByRole('tab', { name: 'Úkoly' }).click();
    await expect(page.getByLabel('MD — Nový úkol')).toHaveValue('12');
  });
});

test.describe('Vazba osoby na účet (FR-ROLE-07)', () => {
  // @scenario: role-permissions.feature > Dev smí editovat úkol osoby, se kterou je spárovaný
  test('Dev smí editovat svůj úkol teprve po spárování osoby s účtem', async ({
    browser,
    request,
  }) => {
    const pm = await createUser(request, 'Jan Novák');
    const dev = await createUser(request, 'Petra Kolářová');

    const pmContext = await browser.newContext();
    const pmPage = await pmContext.newPage();
    await loginAs(pmPage, pm);
    const name = unique('Link');
    await createProject(pmPage, name);
    await setProjectDates(pmPage);
    await addMember(pmPage, dev);
    await addPerson(pmPage, dev.displayName);

    // Úkol té osoby — zatím bez vazby na účet.
    await pmPage.getByRole('tab', { name: 'Úkoly' }).click();
    await pmPage.getByRole('button', { name: '+ Přidat úkol' }).first().click();
    const taskName = pmPage.getByLabel(/^Název úkolu — /).last();
    await taskName.fill('Refaktoring API');
    await taskName.blur();
    await expect(pmPage.getByLabel('Název úkolu — Refaktoring API')).toBeVisible();

    const devContext = await browser.newContext();
    const devPage = await devContext.newPage();
    await loginAs(devPage, dev);
    await openProject(devPage, name);

    // Tohle je jádro věci: dokud osoba nemá účet, nemá Dev nic „vlastního"
    // a server mu editaci odmítne — pole se po reloadu vrátí na původní MD.
    await devPage.getByRole('tab', { name: 'Úkoly' }).click();
    await devPage.getByLabel('MD — Refaktoring API').fill('9');
    await devPage.getByLabel('MD — Refaktoring API').blur();
    await devPage.reload();
    await devPage.getByRole('tab', { name: 'Úkoly' }).click();
    await expect(devPage.getByLabel('MD — Refaktoring API')).toHaveValue('1');

    // PM osobu spáruje s účtem — volba, která do teď v UI vůbec nebyla.
    await pmPage.getByRole('tab', { name: 'Kapacita' }).click();
    await pmPage
      .getByLabel(`Účet — ${dev.displayName}`)
      .selectOption({ label: dev.displayName });

    // A od té chvíle Dev projde — ověřeno reloadem, ne optimistickou změnou.
    await devPage.getByLabel('MD — Refaktoring API').fill('9');
    await devPage.getByLabel('MD — Refaktoring API').blur();
    await devPage.reload();
    await devPage.getByRole('tab', { name: 'Úkoly' }).click();
    await expect(devPage.getByLabel('MD — Refaktoring API')).toHaveValue('9');

    await pmContext.close();
    await devContext.close();
  });

  // @scenario: role-permissions.feature > Odebrání člena z projektu zruší jeho vazbu na osobu
  test('odebrání člena zruší vazbu jeho osoby na účet', async ({ page, request }) => {
    const pm = await createUser(request, 'Jan Novák');
    const dev = await createUser(request, 'Petra Kolářová');

    await loginAs(page, pm);
    await createProject(page, unique('Unlink'));
    await setProjectDates(page);
    await addMember(page, dev);
    await addPerson(page, dev.displayName);

    await page.getByRole('tab', { name: 'Kapacita' }).click();
    const account = page.getByLabel(`Účet — ${dev.displayName}`);
    await account.selectOption({ label: dev.displayName });
    await expect(account).not.toHaveValue('');

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('tab', { name: 'Projekt' }).click();
    await page.getByLabel(`Odebrat — ${dev.displayName}`).click();

    // Osoba v Kapacitě zůstává (odchod z týmu není smazání kapacity), ale
    // vazbu ztratila — jinak by ji vrácený účet tiše zdědil zpátky.
    await page.reload();
    await page.getByRole('tab', { name: 'Kapacita' }).click();
    await expect(page.getByLabel(`Jméno — ${dev.displayName}`)).toBeVisible();
    await expect(page.getByLabel(`Účet — ${dev.displayName}`)).toHaveValue('');
  });
});

test.describe('Statusová zpráva', () => {
  // @scenario: risks-opportunities.feature > Rozepsaná statusová zpráva přežije přepnutí záložky
  test('rozepsaný text přežije přepnutí záložky i reload', async ({ page, request }) => {
    const user = await createUser(request, 'Jan Novák');
    await loginAs(page, user);
    await createProject(page, unique('Status'));
    await setProjectDates(page);

    await page.getByRole('tab', { name: 'Stav & Rizika' }).click();
    const report = page.getByLabel('Statusová zpráva');
    await report.fill('Sprint jede podle plánu, riziko u integrace.');

    // Přepnutí view komponentu odmountuje — dokud text žil v `useState`
    // uvnitř sekce, tenhle krok ho zahodil bez varování.
    await page.getByRole('tab', { name: 'Harmonogram' }).click();
    await page.getByRole('tab', { name: 'Stav & Rizika' }).click();
    await expect(page.getByLabel('Statusová zpráva')).toHaveValue(
      'Sprint jede podle plánu, riziko u integrace.'
    );

    // `sessionStorage` přežije i reload; skončí až se zavřením tabu.
    await page.reload();
    await page.getByRole('tab', { name: 'Stav & Rizika' }).click();
    await expect(page.getByLabel('Statusová zpráva')).toHaveValue(
      'Sprint jede podle plánu, riziko u integrace.'
    );
  });
});

test.describe('Undo / redo', () => {
  test('undo vrátí změnu na serveru, redo ji zase provede', async ({ page, request }) => {
    const user = await createUser(request, 'Jan Novák');
    await loginAs(page, user);
    await createProject(page, unique('Undo'));
    await setProjectDates(page);
    await addPerson(page, 'Petra Kolářová');

    await page.getByRole('tab', { name: 'Úkoly' }).click();
    await page.getByRole('button', { name: '+ Přidat úkol' }).click();
    const md = page.getByLabel('MD — Nový úkol');
    await md.fill('7');
    await md.blur();
    await expect(md).toHaveValue('7');

    // Server undo odmítá — klient posílá inverzní command (ADR-007), takže
    // tohle ověřuje `invertCommand` proti skutečnému reducerovi.
    await page.getByTitle('Zpět (Ctrl+Z)').click();
    await expect(page.getByLabel('MD — Nový úkol')).toHaveValue('1');

    await page.getByTitle('Znovu (Ctrl+Shift+Z)').click();
    await expect(page.getByLabel('MD — Nový úkol')).toHaveValue('7');

    // Teprve teď reload: obojí muselo doopravdy projít serverem, ne jen UI.
    await page.reload();
    await page.getByRole('tab', { name: 'Úkoly' }).click();
    await expect(page.getByLabel('MD — Nový úkol')).toHaveValue('7');
  });

  test('historie se reloadem vyprázdní — undo nesahá do minulé session', async ({
    page,
    request,
  }) => {
    const user = await createUser(request, 'Jan Novák');
    await loginAs(page, user);
    await createProject(page, unique('UndoReset'));
    await setProjectDates(page);
    await addPerson(page, 'Petra Kolářová');

    await page.getByRole('tab', { name: 'Úkoly' }).click();
    await page.getByRole('button', { name: '+ Přidat úkol' }).click();
    const md = page.getByLabel('MD — Nový úkol');
    await md.fill('7');
    await md.blur();
    await expect(md).toHaveValue('7');

    // ADR-007: historie je per-session a drží snímky stavu, které po novém
    // `full_state` nemusí sedět — proto se nesmí přenášet přes reload.
    await page.reload();
    await page.getByRole('tab', { name: 'Úkoly' }).click();
    await expect(page.getByTitle('Zpět (Ctrl+Z)')).toBeDisabled();
    await expect(page.getByTitle('Znovu (Ctrl+Shift+Z)')).toBeDisabled();
  });
});

test.describe('Poznámka → úkol', () => {
  // Dev dřív úkol z poznámky nevytvořil: nově napsaná poznámka zůstala v
  // editoru „neuložená" a tlačítko zašedlé. Test proto začíná na seznamu
  // projektů — převod musí sám otevřít projekt, ke kterému poznámka patří.
  test('Dev převede novou poznámku na úkol v jejím projektu', async ({ browser, request }) => {
    const pm = await createUser(request, 'Jan Novák');
    const dev = await createUser(request, 'Petra Kolářová');

    const pmContext = await browser.newContext();
    const pmPage = await pmContext.newPage();
    await loginAs(pmPage, pm);
    const name = unique('Poznamka');
    await createProject(pmPage, name);
    await addMember(pmPage, dev);

    const devContext = await browser.newContext();
    const page = await devContext.newPage();
    await loginAs(page, dev);
    await expect(page.getByText(name, { exact: true })).toBeVisible();

    await openNotesPanel(page);
    await page.getByRole('button', { name: /Nová poznámka/i }).click();
    const editor = page.getByPlaceholder('Napište poznámku…');
    await editor.fill('Doplnit audit log');
    await page.getByLabel('Přiřadit k projektu').selectOption({ label: name });
    await editor.blur();

    await page.getByRole('button', { name: '→ Přidat jako úkol' }).click();

    // Projekt poznámky se otevřel na Úkolech a nad nimi formulář nového úkolu.
    // Přesné jméno: řádek v seznamu má „Název úkolu — …", detail jen „Název úkolu".
    const detailName = page.getByRole('textbox', { name: 'Název úkolu', exact: true });
    await expect(page.getByText('← Projekty')).toBeVisible();
    await expect(detailName).toHaveValue('Doplnit audit log');
    await page.getByRole('button', { name: 'Uložit změny' }).click();

    // Po uložení je rovnou otevřený detail vytvořeného úkolu — a úkol už
    // stojí v seznamu pod ním.
    await expect(detailName).toHaveValue('Doplnit audit log');
    await expect(page.getByLabel('Název úkolu — Doplnit audit log')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Quick Notes' })).toHaveCount(0);

    // Server úkol přijal — po reloadu tam pořád je.
    await page.reload();
    await page.getByRole('tab', { name: 'Úkoly' }).click();
    await expect(page.getByLabel('Název úkolu — Doplnit audit log')).toBeVisible();

    await pmContext.close();
    await devContext.close();
  });
});
