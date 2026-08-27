// Časová osa projektu proti běžícímu serveru — indexování týdnů (ADR-014).
//
// Obě chyby, které tenhle soubor hlídá, byly neviditelné pro celý unit suite,
// protože obě strany se shodovaly samy se sebou: klientský test pro
// `useWeeklyLoad` sdílel s kódem 0-based konvenci a serverový test pro ořez
// úkolů zase tu svoji. Rozdíl je vidět teprve tam, kde se potkají — pruh
// v Ganttu, buňka v Kapacitě a `state_json` na serveru.
import { expect, test, type Page } from '@playwright/test';
import { createProject, createUser, loginAs, setProjectDates, unique } from './fixtures';

/** 5. 1. – 3. 7. 2026, tedy 26 týdnů (`setProjectDates`). */
const LAST_WEEK = 26;
const END_DATE = '2026-07-03';

async function freshProject(page: Page, request: Parameters<typeof createUser>[0]) {
  const user = await createUser(request, 'Jan Novák');
  await loginAs(page, user);
  await createProject(page, unique('Plan'));
  await setProjectDates(page);
  return user;
}

/** Osoba v Kapacitě; její jméno nese `aria-label` všech jejích polí. */
async function addPerson(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name: 'Kapacita' }).click();
  await page.getByRole('button', { name: '+ Přidat člena' }).click();

  const nameField = page.getByLabel(/^Jméno — /).last();
  await nameField.fill(name);
  await nameField.blur();
  await expect(page.getByLabel(`Jméno — ${name}`)).toBeVisible();
}

/**
 * Úkol přiřazený osobě, s rozsahem týdnů a MD.
 *
 * `aria-label` polí obsahuje aktuální název úkolu, takže se mění během psaní —
 * pole se hledá regulárním výrazem a přesné jméno slouží až k ověření.
 */
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

  // Pořadí je významné: `Od týdne` se validuje proti `Do týdne`, takže konec
  // musí být nastavený dřív, než se začátek posune za původní jedničku.
  await page.getByLabel(`Do týdne — ${opts.name}`).fill(String(opts.to));
  await page.getByLabel(`Od týdne — ${opts.name}`).fill(String(opts.from));
  await page.getByLabel(`MD — ${opts.name}`).fill(String(opts.md));
  await page.getByLabel(`MD — ${opts.name}`).blur();
}

test.describe('Časová osa', () => {
  // @scenario: project-management.feature > Úkol v posledním týdnu přežije uložení datumů projektu
  test('úkol v posledním týdnu přežije uložení stejného data konce', async ({ page, request }) => {
    await freshProject(page, request);
    await addPerson(page, 'Petra Kolářová');
    await addTask(page, { name: 'Nasazení', from: LAST_WEEK, to: LAST_WEEK, md: 3 });

    // Server ořezával `S`/`E` na `weekCount - 1`, takže tenhle krok — uložení
    // hodnoty, která už tam je — úkol tiše posunul o týden dopředu a poslal
    // to jako `task_updated`.
    await page.getByRole('tab', { name: 'Projekt' }).click();
    await page.getByLabel('Konec').fill(END_DATE);
    await page.getByLabel('Konec').blur();

    await page.reload();
    await page.getByRole('tab', { name: 'Úkoly' }).click();
    await expect(page.getByLabel('Od týdne — Nasazení')).toHaveValue(String(LAST_WEEK));
    await expect(page.getByLabel('Do týdne — Nasazení')).toHaveValue(String(LAST_WEEK));
  });

  test('zkrácení projektu ořízne úkol na nový poslední týden', async ({ page, request }) => {
    await freshProject(page, request);
    await addPerson(page, 'Petra Kolářová');
    await addTask(page, { name: 'Nasazení', from: LAST_WEEK, to: LAST_WEEK, md: 3 });

    // 5. 1. – 13. 2. 2026 = 6 týdnů.
    await page.getByRole('tab', { name: 'Projekt' }).click();
    await page.getByLabel('Konec').fill('2026-02-13');
    await page.getByLabel('Konec').blur();
    await expect(page.getByText(/6 týdnů/).first()).toBeVisible();

    await page.reload();
    await page.getByRole('tab', { name: 'Úkoly' }).click();
    await expect(page.getByLabel('Od týdne — Nasazení')).toHaveValue('6');
    await expect(page.getByLabel('Do týdne — Nasazení')).toHaveValue('6');
  });

  // @scenario: kapacita.feature > Přetížení sedí na stejném týdnu jako v Ganttu
  test('Kapacita označí přetížení ve stejném týdnu, kde úkol leží', async ({ page, request }) => {
    await freshProject(page, request);
    await addPerson(page, 'Petra Kolářová');
    // 8 MD do jednoho týdne proti kapacitě 5 MD (100 % alokace, 5 pracovních dní).
    await addTask(page, { name: 'Migrace', from: 3, to: 3, md: 8 });

    await page.getByRole('tab', { name: 'Kapacita' }).click();
    const cellOf = (week: number) =>
      page.getByLabel(`Alokace W${week} — Petra Kolářová`).locator('xpath=..');

    // Dokud Kapacita četla `s`/`e` jako indexy pole, svítil W4.
    await expect(cellOf(3)).toHaveAttribute('data-load', 'přetíženo');
    await expect(cellOf(4)).not.toHaveAttribute('data-load', 'přetíženo');
  });

  // @scenario: kapacita.feature > Zobrazení rozpočtu, naplánované práce a kapacity
  test('souhrn porovnává naplánovanou práci s rozpočtem, ne kapacitu', async ({
    page,
    request,
  }) => {
    await freshProject(page, request);
    await addPerson(page, 'Petra Kolářová');
    await addTask(page, { name: 'Migrace', from: 1, to: 4, md: 40 });

    // Výchozí rozpočet projektu; hlavička ho ukazuje jako „Budget: N MD".
    await page.getByRole('tab', { name: 'Kapacita' }).click();
    const summary = page.getByText(/Rozpočet: \d+ MD \| Naplánováno: 40 MD \| Kapacita: \d+ MD/);
    await expect(summary).toBeVisible();

    // Hlavička nese totéž číslo — obě místa berou `planned` ze stejné funkce.
    await expect(page.getByText(/^40 MD/).first()).toBeVisible();

    // A po změně MD se posune obojí, tedy se to opravdu počítá z úkolů.
    await page.getByRole('tab', { name: 'Úkoly' }).click();
    await page.getByLabel('MD — Migrace').fill('55');
    await page.getByLabel('MD — Migrace').blur();
    await page.getByRole('tab', { name: 'Kapacita' }).click();
    await expect(page.getByText(/Naplánováno: 55 MD/)).toBeVisible();
  });

  // @scenario: kapacita.feature > Práce v posledním týdnu projektu se započítá
  test('přetížení v posledním týdnu projektu je vidět', async ({ page, request }) => {
    await freshProject(page, request);
    await addPerson(page, 'Petra Kolářová');
    await addTask(page, { name: 'Finální ladění', from: LAST_WEEK, to: LAST_WEEK, md: 8 });

    await page.getByRole('tab', { name: 'Kapacita' }).click();
    // `Math.min(weeks.length - 1, task.e)` vyrobil u posledního týdne prázdný
    // rozpad MD, takže tahle buňka zůstávala neoznačená.
    await expect(
      page.getByLabel(`Alokace W${LAST_WEEK} — Petra Kolářová`).locator('xpath=..')
    ).toHaveAttribute('data-load', 'přetíženo');
  });
});
