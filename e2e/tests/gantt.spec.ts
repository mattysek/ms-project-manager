// Tažení pruhů v Ganttu proti běžícímu serveru.
//
// Přeřazení úkolu na jiného člena je geometrie: kde v layoutu leží který
// řádek. jsdom nemá layout, takže tohle jednotkově ověřit nejde — `elementFromPoint`
// tam neexistuje vůbec a `test/setup.ts` ho jen zaslepuje. Původní implementace
// si pozici řádků dopočítávala z odhadu výšky záhlaví a vlastní kopie vzorce
// z `PersonRow`; jednotkové testy na to nemohly sáhnout a v prohlížeči to
// vycházelo jednou tak, jednou onak.
import { expect, test, type Page } from '@playwright/test';
import { createProject, createUser, loginAs, setProjectDates, unique } from './fixtures';

/** Osoba v Kapacitě. */
async function addPerson(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name: 'Kapacita' }).click();
  await page.getByRole('button', { name: '+ Přidat člena' }).click();
  const nameField = page.getByLabel(/^Jméno — /).last();
  await nameField.fill(name);
  await nameField.blur();
  await expect(page.getByLabel(`Jméno — ${name}`)).toBeVisible();
}

test.describe('Harmonogram — tažení pruhů', () => {
  // @scenario: gantt.feature > Kliknutí myší na pruh otevře TaskDetailModal
  test('klik myší na pruh otevře detail úkolu', async ({ page, request }) => {
    const user = await createUser(request, 'Jan Novák');
    await loginAs(page, user);
    await createProject(page, unique('Klik'));
    await setProjectDates(page);
    await addPerson(page, 'Petra Kolářová');

    await page.getByRole('tab', { name: 'Úkoly' }).click();
    await page.getByRole('button', { name: '+ Přidat úkol' }).first().click();
    const taskName = page.getByLabel(/^Název úkolu — /).last();
    await taskName.fill('Refaktoring API');
    await taskName.blur();

    await page.getByRole('tab', { name: 'Harmonogram' }).click();

    // Skutečné kliknutí myší, ne `dispatchEvent`: jádro věci je, že po
    // `pointer-events: none` na taženém pruhu prohlížeč `click` nevyvolá,
    // takže se detail otevírá až z `mouseup`.
    await page.getByText('Refaktoring API').click();

    await expect(page.getByText('Detail úkolu')).toBeVisible();
    await expect(page.getByLabel('Název úkolu')).toHaveValue('Refaktoring API');
  });

  // @scenario: gantt.feature > Přetažení úkolu na jiného člena týmu
  test('přetažení na jiný řádek přeřadí úkol a zvýrazní cíl', async ({ page, request }) => {
    const user = await createUser(request, 'Jan Novák');
    await loginAs(page, user);
    await createProject(page, unique('Gantt'));
    await setProjectDates(page);

    await addPerson(page, 'Petra Kolářová');
    await addPerson(page, 'Jan Novák');

    // Úkol vznikne u Petry (první sekce v Úkolech).
    await page.getByRole('tab', { name: 'Úkoly' }).click();
    await page.getByRole('button', { name: '+ Přidat úkol' }).first().click();
    const taskName = page.getByLabel(/^Název úkolu — /).last();
    await taskName.fill('Refaktoring API');
    await taskName.blur();
    await expect(page.getByLabel('Název úkolu — Refaktoring API')).toBeVisible();

    await page.getByRole('tab', { name: 'Harmonogram' }).click();

    const petraRow = page.locator('[data-person-id]').first();
    const janRow = page.locator('[data-person-id]').last();
    const bar = petraRow.getByText('Refaktoring API');
    await expect(bar).toBeVisible();

    const barBox = await bar.boundingBox();
    const targetBox = await janRow.boundingBox();
    if (!barBox || !targetBox) throw new Error('Pruh nebo cílový řádek nemá rozměry');

    // Tažení po krocích: jeden `mouse.move` prohlížeč nemusí poslat jako
    // mousemove nad mezilehlými prvky a náhled by se nepřepočítal.
    await page.mouse.move(barBox.x + barBox.width / 2, barBox.y + barBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(barBox.x + barBox.width / 2, targetBox.y + targetBox.height / 2, {
      steps: 10,
    });

    // Zvýrazněný musí být CÍLOVÝ řádek. Dřív se sem posílal vlastník taženého
    // úkolu, takže svítil zdroj — a vypadalo to správně jen uvnitř téhož řádku.
    await expect(janRow.locator('[data-drop-target="true"]')).toHaveCount(1);
    await expect(petraRow.locator('[data-drop-target="true"]')).toHaveCount(0);

    // A náhled pruhu se musí přestěhovat s ním. Pruhy se kreslí podle
    // uloženého `task.p`, takže tažený úkol zůstával viset ve zdrojovém řádku
    // — cíl svítil, ale „držený" pruh byl pořád vzadu.
    await expect(janRow.getByText('Refaktoring API')).toBeVisible();
    await expect(petraRow.getByText('Refaktoring API')).toBeHidden();

    await page.mouse.up();

    // Po puštění je úkol v Janově řádku doopravdy, ne jen vizuálně.
    await expect(janRow.getByText('Refaktoring API')).toBeVisible();
    await expect(petraRow.getByText('Refaktoring API')).toHaveCount(0);

    // …a je to na serveru, ne jen optimisticky.
    await page.reload();
    await page.getByRole('tab', { name: 'Harmonogram' }).click();
    await expect(page.locator('[data-person-id]').last().getByText('Refaktoring API')).toBeVisible();
  });
});
