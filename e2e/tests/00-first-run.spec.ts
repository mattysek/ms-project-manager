// První spuštění proti opravdu prázdné databázi — FR-AUTH-07.
//
// Číselná předpona v názvu souboru je funkční, ne kosmetická. `run.sh` startuje
// server nad čerstvou SQLite, ale databázi sdílí celá sada; první spec, který
// zavolá `ensureAdmin`, ji nenávratně naplní. Playwright řadí soubory
// abecedně a config drží `workers: 1` + `fullyParallel: false`, takže tenhle
// běží před `admin.spec.ts` a je jediný, který ještě vidí setup.
//
// Přesně tuhle obrazovku neuviděl žádný jiný test: scénář si nárokoval pouze
// serverový `AuthApiTests`, který končí u `POST /auth/setup`. Klient se přitom
// po úspěšném založení admina nepřepnul dál a zůstal viset na formuláři —
// účet vznikl, session platila, ale uživateli to připadalo, že tlačítko
// nereaguje.
import { expect, test } from '@playwright/test';
import { ADMIN } from './fixtures';

// @scenario: auth.feature > První spuštění — vytvoření admin účtu
test('prázdná databáze provede setupem a skončí na seznamu projektů', async ({ page, request }) => {
  const status = await request.get('/auth/setup-required');
  const { required } = (await status.json()) as { required: boolean };
  // Radši hlasitě spadnout než tiše projít: bez prázdné databáze tenhle test
  // netestuje nic. Když se sem dostane s hotovým setupem, rozešlo se pořadí
  // souborů (viz komentář nahoře), ne aplikace.
  expect(required, 'first-run spec musí běžet jako první, nad prázdnou databází').toBe(true);

  await page.goto('/projects/nejaky-hluboky-odkaz');

  // Prázdná DB má přednost před returnUrl — není kam se vracet.
  await expect(page.getByText('Vytvoření administrátorského účtu')).toBeVisible();
  await expect(page).toHaveURL(/\/setup$/);

  await page.getByLabel(/uživatelské jméno/i).fill(ADMIN.userName);
  await page.getByLabel(/display name/i).fill(ADMIN.displayName);
  await page.getByLabel(/heslo/i).fill(ADMIN.password);
  await page.getByRole('button', { name: 'Vytvořit' }).click();

  // Jádro regrese: formulář musí zmizet a uživatel být přihlášený na "/".
  await expect(page.getByLabel(`Uživatelské menu — ${ADMIN.displayName}`)).toBeVisible();
  await expect(page.getByText('Vytvoření administrátorského účtu')).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: /nový projekt/i })).toBeVisible();

  // Session je opravdová, ne jen stav v paměti komponenty.
  await page.reload();
  await expect(page.getByLabel(`Uživatelské menu — ${ADMIN.displayName}`)).toBeVisible();
});

// @scenario: auth.feature > Po dokončeném setupu se obrazovka prvního spuštění už nenabízí
test('po dokončeném setupu vede /setup na přihlášení', async ({ page }) => {
  const status = await page.request.get('/auth/setup-required');
  const { required } = (await status.json()) as { required: boolean };
  expect(required).toBe(false);

  await page.goto('/setup');

  await expect(page.getByRole('button', { name: 'Přihlásit se' })).toBeVisible();
  await expect(page.getByText('Vytvoření administrátorského účtu')).toBeHidden();
});
