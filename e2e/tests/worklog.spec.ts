// Vykazování práce proti běžícímu serveru — PRD-10, ADR-017.
//
// Dvě věci, které jednotkové testy neuvidí ani nemůžou:
//
// - **Routing z hlavního menu.** V jsdom by z proklikání zbyla jen kontrola,
//   že se zavolal callback; že vznikne skutečná adresa a že se z ní dá vrátit
//   tlačítkem zpět, je vidět až v prohlížeči.
// - **Běžící stopky přežijí reload.** To je tvrzení o tom, že běžící činnost
//   drží server, ne prohlížeč — přesný opak trezoru, který se reloadem zamyká
//   (ADR-016). S mockovaným serverem se ověřit nedá.
import { expect, test, type Page } from '@playwright/test';
import { createUser, loginAs, unique } from './fixtures';

/**
 * Otevře panel výkazů, pokud otevřený není.
 *
 * Volba panelu přežívá reload (`useOpenPanel`), takže bezpodmínečné kliknutí
 * po `page.reload()` panel naopak ZAVŘE — stejná past jako u trezoru.
 */
async function openWorkLogPanel(page: Page): Promise<void> {
  const panel = page.getByRole('dialog', { name: 'Výkazy práce' });
  if (!(await panel.isVisible())) {
    await page.getByRole('button', { name: /^výkazy/i }).click();
  }
  await expect(panel).toBeVisible();
}

// @scenario: worklog.feature > Výkazy jsou dostupné z hlavního menu
test('výkazy mají vlastní adresu a tlačítko zpět vrátí na projekty', async ({ page, request }) => {
  const user = await createUser(request, 'Petra Kolářová');
  await loginAs(page, user);

  await page.getByRole('button', { name: '⏱ Výkazy práce' }).click();

  await expect(page).toHaveURL(/\/vykazy$/);
  await expect(page.getByText('⏱ Výkazy práce')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Záznamy' })).toBeVisible();

  await page.goBack();

  await expect(page.getByRole('button', { name: '+ Nový projekt' })).toBeVisible();
});

// @scenario: worklog.feature > Běžící stopky přežijí reload stránky
test('běžící činnost drží server, takže přežije reload', async ({ page, request }) => {
  const user = await createUser(request, 'Petra Kolářová');
  await loginAs(page, user);

  const title = unique('Ladění importu');
  await openWorkLogPanel(page);
  await page.getByLabel('Co teď děláš?').fill(title);
  await page.getByRole('button', { name: '▶ Start' }).click();

  await expect(page.getByRole('button', { name: '⏹ Stop' })).toBeVisible();

  await page.reload();

  // Po reloadu je klient prázdný — běžící činnost může přijít jen ze serveru.
  await expect(page.getByRole('button', { name: new RegExp(`^Výkazy — běží ${title}`) })).toBeVisible();

  await openWorkLogPanel(page);
  await page.getByRole('button', { name: '⏹ Stop' }).click();

  await expect(page.getByLabel('Co teď děláš?')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Výkazy — běží/ })).toHaveCount(0);
});
