// Průchod jednotlivými view proti běžícímu serveru.
//
// Do doby, než se opravilo volání `SendCommand` (chyběl `projectId`), tady
// nemohlo projít nic: každý command server odmítal a UI se tvářilo, že se
// nic nestalo. Proto tyhle testy sahají hlavně na to, co něco **mění**, a
// skoro každý dělá `reload()` — teprve ten rozliší „vidím vlastní optimistickou
// změnu" od „server ji opravdu uložil".
import { expect, test, type Page } from '@playwright/test';
import {
  createProject,
  createUser,
  loginAs,
  openNotesPanel,
  setProjectDates,
  unique,
} from './fixtures';

/** Přihlášený uživatel s otevřeným čerstvým projektem. */
async function freshProject(page: Page, request: Parameters<typeof createUser>[0]) {
  const user = await createUser(request, 'Jan Novák');
  await loginAs(page, user);
  const name = unique('View');
  await createProject(page, name);
  return { user, name };
}

/** Reload + návrat na záložku — po reloadu se aplikace vrací na výchozí view. */
async function reloadTo(page: Page, tab: string): Promise<void> {
  await page.reload();
  await page.getByRole('tab', { name: tab }).click();
}

/** Osoba v Kapacitě; vrací jméno, které nese `aria-label` všech jejích polí. */
async function addPerson(page: Page, name: string): Promise<string> {
  await page.getByRole('tab', { name: 'Kapacita' }).click();
  await page.getByRole('button', { name: '+ Přidat člena' }).click();

  const nameField = page.getByLabel(/^Jméno — /).last();
  await nameField.fill(name);
  await nameField.blur();
  await expect(page.getByLabel(`Jméno — ${name}`)).toBeVisible();
  return name;
}

test.describe('Projekt', () => {
  test('změna názvu, datumů a rozpočtu se uloží a přežije reload', async ({ page, request }) => {
    const { name } = await freshProject(page, request);
    await page.getByRole('tab', { name: 'Projekt' }).click();

    const renamed = `${name}-v2`;
    await page.getByLabel('Název').fill(renamed);
    await page.getByLabel('Budget (MD)').fill('250');
    await setProjectDates(page);

    await reloadTo(page, 'Projekt');
    await expect(page.getByLabel('Název')).toHaveValue(renamed);
    await expect(page.getByLabel('Budget (MD)')).toHaveValue('250');
    await expect(page.getByLabel('Začátek')).toHaveValue('2026-01-05');
  });

  test('projekt bez datumů má nula týdnů a po jejich zadání se přepočítá', async ({
    page,
    request,
  }) => {
    await freshProject(page, request);

    await expect(page.getByText(/0 týdnů/).first()).toBeVisible();
    await setProjectDates(page);
    await expect(page.getByText(/26 týdnů/).first()).toBeVisible();

    // Zkrácení konce projektu musí počet týdnů snížit, ne jen přepsat datum.
    await page.getByLabel('Konec').fill('2026-04-03');
    await expect(page.getByText(/13 týdnů/).first()).toBeVisible();
  });

  test('milník se přidá, pojmenuje a dostane položku checklistu', async ({ page, request }) => {
    await freshProject(page, request);
    await setProjectDates(page);

    await page.getByRole('button', { name: '+ Přidat milník' }).click();
    // Popisek nese název milníku, který se mění při psaní — proto regex.
    await page.getByLabel(/^Název milníku — /).fill('Akceptace klientem');

    await page.getByRole('button', { name: '+ Přidat položku' }).click();
    await page.getByPlaceholder('Položka checklistu...').fill('Podepsaný protokol');

    await reloadTo(page, 'Projekt');
    await expect(page.getByLabel('Název milníku — Akceptace klientem')).toBeVisible();
    await expect(page.getByPlaceholder('Položka checklistu...').first()).toHaveValue(
      'Podepsaný protokol'
    );
  });

  test('milník se dá posunout na jiný týden', async ({ page, request }) => {
    await freshProject(page, request);
    await setProjectDates(page);

    await page.getByRole('button', { name: '+ Přidat milník' }).click();
    await page.getByLabel(/^Název milníku — /).fill('Akceptace klientem');

    const week = page.getByLabel('Týden milníku — Akceptace klientem');
    await week.selectOption({ index: 9 });

    await reloadTo(page, 'Projekt');
    await expect(page.getByLabel('Týden milníku — Akceptace klientem')).toHaveValue('9');
  });
});

test.describe('Kapacita', () => {
  test('přidaná osoba se objeví v tabulce a přežije reload', async ({ page, request }) => {
    await freshProject(page, request);
    await setProjectDates(page);
    await addPerson(page, 'Petra Kolářová');

    await reloadTo(page, 'Kapacita');
    await expect(page.getByLabel('Jméno — Petra Kolářová')).toBeVisible();
  });

  test('alokace se dá přepsat a přežije reload', async ({ page, request }) => {
    await freshProject(page, request);
    await setProjectDates(page);
    const person = await addPerson(page, 'Petra Kolářová');

    const week1 = page.getByLabel(`Alokace W1 — ${person}`);
    await week1.fill('50');
    await week1.blur();

    await reloadTo(page, 'Kapacita');
    await expect(page.getByLabel(`Alokace W1 — ${person}`)).toHaveValue('50');
  });

  test('snížení alokace sníží celkovou kapacitu v MD', async ({ page, request }) => {
    await freshProject(page, request);
    await setProjectDates(page);
    const person = await addPerson(page, 'Petra Kolářová');

    // Nový člen má výchozí alokaci 100 % ve všech týdnech, takže kapacita
    // odpovídá počtu pracovních dní projektu (svátky už jsou odečtené).
    const summary = page.getByText(/Kapacita: [\d.]+ MD/);
    const before = Number(/Kapacita: ([\d.]+) MD/.exec((await summary.innerText()) ?? '')?.[1]);
    expect(before).toBeGreaterThan(0);

    const week1 = page.getByLabel(`Alokace W1 — ${person}`);
    await week1.fill('0');
    await week1.blur();

    await expect
      .poll(async () => Number(/Kapacita: ([\d.]+) MD/.exec(await summary.innerText())?.[1]))
      .toBeLessThan(before);
  });

  test('odebrání osoby ji odstraní z tabulky natrvalo', async ({ page, request }) => {
    await freshProject(page, request);
    await setProjectDates(page);
    const person = await addPerson(page, 'Petra Kolářová');

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByLabel(`Odebrat — ${person}`).click();
    await expect(page.getByLabel(`Jméno — ${person}`)).toHaveCount(0);

    await reloadTo(page, 'Kapacita');
    await expect(page.getByLabel(`Jméno — ${person}`)).toHaveCount(0);
  });
});

test.describe('Úkoly', () => {
  test('úkol se založí u osoby, přejmenuje a přežije reload', async ({ page, request }) => {
    await freshProject(page, request);
    await setProjectDates(page);
    await addPerson(page, 'Petra Kolářová');

    await page.getByRole('tab', { name: 'Úkoly' }).click();
    await page.getByRole('button', { name: '+ Přidat úkol' }).click();

    // Regex, ne přesné jméno: popisek pole obsahuje aktuální název úkolu, takže
    // se mění s každým znakem — přesný lokátor by po prvním písmenu přestal sedět.
    await page.getByLabel(/^Název úkolu — /).fill('Návrh architektury');

    await reloadTo(page, 'Úkoly');
    await expect(page.getByLabel('Název úkolu — Návrh architektury')).toBeVisible();
  });

  test('změna MD úkolu se uloží', async ({ page, request }) => {
    await freshProject(page, request);
    await setProjectDates(page);
    await addPerson(page, 'Petra Kolářová');

    await page.getByRole('tab', { name: 'Úkoly' }).click();
    await page.getByRole('button', { name: '+ Přidat úkol' }).click();

    const md = page.getByLabel('MD — Nový úkol');
    await md.fill('5');
    await md.blur();

    await reloadTo(page, 'Úkoly');
    await expect(page.getByLabel('MD — Nový úkol')).toHaveValue('5');
  });

  test('rozsah týdnů úkolu se uloží', async ({ page, request }) => {
    await freshProject(page, request);
    await setProjectDates(page);
    await addPerson(page, 'Petra Kolářová');

    await page.getByRole('tab', { name: 'Úkoly' }).click();
    await page.getByRole('button', { name: '+ Přidat úkol' }).click();

    // Nejdřív konec, pak začátek: úkol vzniká na W1–W1, takže `s = 3` by v tu
    // chvíli znamenalo začátek za koncem a server by změnu odmítl.
    const from = page.getByLabel('Od týdne — Nový úkol');
    const to = page.getByLabel('Do týdne — Nový úkol');
    await to.fill('8');
    await to.blur();
    await from.fill('3');
    await from.blur();

    await reloadTo(page, 'Úkoly');
    await expect(page.getByLabel('Od týdne — Nový úkol')).toHaveValue('3');
    await expect(page.getByLabel('Do týdne — Nový úkol')).toHaveValue('8');
  });
});

test.describe('Harmonogram', () => {
  test('úkol založený v Úkolech se objeví i v Harmonogramu', async ({ page, request }) => {
    await freshProject(page, request);
    await setProjectDates(page);
    const person = await addPerson(page, 'Petra Kolářová');

    await page.getByRole('tab', { name: 'Úkoly' }).click();
    await page.getByRole('button', { name: '+ Přidat úkol' }).click();
    await page.getByLabel(/^Název úkolu — /).fill('Návrh architektury');

    await page.getByRole('tab', { name: 'Harmonogram' }).click();
    await expect(page.getByText('Návrh architektury').first()).toBeVisible();
    await expect(page.getByText(person).first()).toBeVisible();
  });
});

test.describe('Dokumentace (KB)', () => {
  test('stránka se založí, uloží a najde vyhledáváním', async ({ page, request }) => {
    await freshProject(page, request);
    await page.getByRole('tab', { name: 'Dokumentace' }).click();

    await page.getByRole('button', { name: /Nová stránka/i }).click();
    await page.getByPlaceholder(/Název stránky/i).fill('Deployment postup');
    await page.getByPlaceholder(/Markdown obsah/i).fill('# Kroky\n\nBuild a deploy pomocí Kubernetes.');
    await page.getByRole('button', { name: /Uložit/i }).click();

    await reloadTo(page, 'Dokumentace');
    await expect(page.getByText('Deployment postup').first()).toBeVisible();

    // Fulltext hledá i v obsahu, nejen v názvu.
    await page.getByPlaceholder('Hledat...').fill('Kubernetes');
    await expect(page.getByText('Deployment postup').first()).toBeVisible();

    await page.getByPlaceholder('Hledat...').fill('naprostoNic');
    await expect(page.getByText('Deployment postup')).toHaveCount(0);
  });

  test('štítky stránky se uloží a přežijí reload', async ({ page, request }) => {
    await freshProject(page, request);
    await page.getByRole('tab', { name: 'Dokumentace' }).click();

    await page.getByRole('button', { name: /Nová stránka/i }).click();
    await page.getByPlaceholder(/Název stránky/i).fill('Provozní příručka');
    await page.getByLabel('Štítky stránky').fill('provoz, docker');
    await page.getByRole('button', { name: /Uložit/i }).click();

    await reloadTo(page, 'Dokumentace');
    await page.getByText('Provozní příručka').first().click();
    await expect(page.getByText('provoz').first()).toBeVisible();
    await expect(page.getByText('docker').first()).toBeVisible();
  });
});

test.describe('TODO', () => {
  test('položka se přidá, odškrtne a přežije reload', async ({ page, request }) => {
    await freshProject(page, request);
    await page.getByRole('tab', { name: 'TODO' }).click();

    // Textarea, ne input: přidává se Ctrl+Enter (viz placeholder v TodoView).
    const input = page.getByPlaceholder(/Nový úkol/).first();
    await input.fill('Zkontrolovat pull request');
    await input.press('Control+Enter');

    // Přesně jednou: autor dostane vlastní `todo_added` diff zpátky, takže
    // dokud `applyDiff` nedělal upsert podle id, viděl položku dvakrát.
    await expect(page.getByText('Zkontrolovat pull request')).toHaveCount(1);

    await page.getByRole('checkbox').first().check();
    await reloadTo(page, 'TODO');
    await expect(page.getByText('Zkontrolovat pull request')).toHaveCount(1);
    await expect(page.getByRole('checkbox').first()).toBeChecked();
  });

  test('dvě položky zůstanou dvě a nejnovější je nahoře', async ({ page, request }) => {
    await freshProject(page, request);
    await page.getByRole('tab', { name: 'TODO' }).click();

    const input = page.getByPlaceholder(/Nový úkol/).first();
    for (const title of ['První úkol', 'Druhý úkol']) {
      await input.fill(title);
      await input.press('Control+Enter');
      await expect(page.getByText(title)).toHaveCount(1);
    }

    // Pořadí se nesmí reloadem převrátit: optimistická aplikace vkládá na
    // začátek, serverový reducer na konec — view proto třídí podle `createdAt`.
    await reloadTo(page, 'TODO');
    await expect(page.getByText('První úkol')).toHaveCount(1);
    await expect(page.getByText('Druhý úkol')).toHaveCount(1);
  });
});

test.describe('Stav & Rizika', () => {
  test('riziko se přidá se závažností a přežije reload', async ({ page, request }) => {
    await freshProject(page, request);
    await page.getByRole('tab', { name: 'Stav & Rizika' }).click();

    // Nové riziko se rovnou otevře v editaci (`isNew`), takže jsou vidět pole.
    await page.getByRole('button', { name: '+ Přidat riziko' }).click();
    await page.getByPlaceholder('Kdo…').fill('Jan Novák');
    await page.getByLabel('Název rizika').fill('Nedostupnost testovacího prostředí');
    await page.getByLabel('Detail rizika').fill('Blokuje akceptaci od klienta.');
    await page.getByLabel('Závažnost rizika').selectOption({ label: 'VYSOKÉ' });
    // `exact`, jinak by se trefilo i „+ Přidat riziko" / „+ Přidat záznam".
    await page.getByRole('button', { name: '+ Přidat', exact: true }).click();

    await reloadTo(page, 'Stav & Rizika');
    await expect(page.getByText('Nedostupnost testovacího prostředí')).toHaveCount(1);
    await expect(page.getByText('Blokuje akceptaci od klienta.')).toBeVisible();
    await expect(page.getByText(/1 vysoká/)).toBeVisible();
  });

  test('poznámky k projektu se ukládají průběžně', async ({ page, request }) => {
    await freshProject(page, request);
    await page.getByRole('tab', { name: 'Stav & Rizika' }).click();

    const notes = page.getByLabel('Poznámky k projektu');
    await notes.fill('Klient chce demo do konce května.');
    await notes.blur();

    await reloadTo(page, 'Stav & Rizika');
    await expect(page.getByLabel('Poznámky k projektu')).toHaveValue(
      'Klient chce demo do konce května.'
    );
  });

  test('záznam v changelogu se přidá Ctrl+Enter', async ({ page, request }) => {
    await freshProject(page, request);
    await page.getByRole('tab', { name: 'Stav & Rizika' }).click();

    const entry = page.getByPlaceholder(/Nový záznam/);
    await entry.fill('Dohodnut rozsah první iterace.');
    await entry.press('Control+Enter');

    await reloadTo(page, 'Stav & Rizika');
    await expect(page.getByText('Dohodnut rozsah první iterace.')).toHaveCount(1);
  });
});

test.describe('Quick Notes', () => {
  test('poznámka se uloží a přežije reload', async ({ page, request }) => {
    await freshProject(page, request);

    await openNotesPanel(page);
    await page.getByRole('button', { name: /Nová poznámka/i }).click();
    const editor = page.getByPlaceholder('Napište poznámku…');
    await editor.fill('Nápad z porady');
    await editor.blur();

    await page.reload();
    await openNotesPanel(page);
    await expect(page.getByText('Nápad z porady').first()).toBeVisible();
  });

  test('poznámky jsou soukromé — jiný uživatel je nevidí', async ({ browser, request }) => {
    const autor = await createUser(request, 'Jan Novák');
    const cizi = await createUser(request, 'Petra Kolářová');

    const autorContext = await browser.newContext();
    const autorPage = await autorContext.newPage();
    await loginAs(autorPage, autor);
    await openNotesPanel(autorPage);
    await autorPage.getByRole('button', { name: /Nová poznámka/i }).click();
    const editor = autorPage.getByPlaceholder('Napište poznámku…');
    await editor.fill('Tajná poznámka');
    await editor.blur();
    await expect(autorPage.getByText('Tajná poznámka').first()).toBeVisible();

    const ciziContext = await browser.newContext();
    const ciziPage = await ciziContext.newPage();
    await loginAs(ciziPage, cizi);
    await openNotesPanel(ciziPage);
    await expect(ciziPage.getByText('Tajná poznámka')).toHaveCount(0);

    await autorContext.close();
    await ciziContext.close();
  });
});
