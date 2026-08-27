// Export a import projektu (ADR-005).
//
// Export je čistě klientský — sestaví se v prohlížeči a stáhne. Import naopak
// soubor na klientovi jen naparsuje a pošle jako JEDEN `full_state_import`
// command, takže projde stejnou autorizací i reducerem jako cokoli jiného.
// Zvlášť stojí za pozornost cesta z LandingPage: tam projekt ještě není
// otevřený, takže se naparsovaná data odloží do `sessionStorage` a dopošlou
// se až po prvním `full_state` (viz `useAppLifecycleEffects`).
import { expect, test, type Page } from '@playwright/test';
import { createProject, createUser, loginAs, setProjectDates, unique } from './fixtures';

/** Stáhne export otevřeného projektu a vrátí jeho obsah jako text. */
async function exportProject(page: Page): Promise<string> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '⬇ Export' }).click();
  const file = await download;
  const stream = await file.createReadStream();

  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

test.describe('Export', () => {
  test('export otevřeného projektu stáhne JSON s jeho daty', async ({ page, request }) => {
    const user = await createUser(request, 'Jan Novák');
    await loginAs(page, user);
    const name = unique('Export');
    await createProject(page, name);
    await setProjectDates(page);

    await page.getByRole('tab', { name: 'Kapacita' }).click();
    await page.getByRole('button', { name: '+ Přidat člena' }).click();
    await page.getByLabel(/^Jméno — /).last().fill('Petra Kolářová');
    await expect(page.getByLabel('Jméno — Petra Kolářová')).toBeVisible();

    // Bez příloh se exportuje samotný JSON, ne ZIP.
    const content = await exportProject(page);
    const payload = JSON.parse(content) as {
      project: { name: string; startDate: string };
      people: { name: string }[];
      _exported?: string;
    };

    expect(payload.project.name).toBe(name);
    expect(payload.project.startDate).toBe('2026-01-05');
    expect(payload.people.map((p) => p.name)).toContain('Petra Kolářová');
    expect(payload._exported, 'export si značí čas pořízení').toBeTruthy();
  });
});

test.describe('Import', () => {
  test('import z LandingPage založí nový projekt i s daty', async ({ page, request }) => {
    const user = await createUser(request, 'Jan Novák');
    await loginAs(page, user);

    const zdroj = unique('ZdrojLanding');
    await createProject(page, zdroj);
    await setProjectDates(page);
    await page.getByRole('tab', { name: 'Kapacita' }).click();
    await page.getByRole('button', { name: '+ Přidat člena' }).click();
    await page.getByLabel(/^Jméno — /).last().fill('Petra Kolářová');
    await expect(page.getByLabel('Jméno — Petra Kolářová')).toBeVisible();
    const exported = await exportProject(page);

    await page.getByRole('button', { name: /← Projekty/ }).click();

    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '⬆ Import...' }).click();
    await (
      await chooser
    ).setFiles({
      name: 'zaloha.json',
      mimeType: 'application/json',
      buffer: Buffer.from(exported),
    });

    // LandingPage projekt nejdřív založí přes REST a data dopošle až po
    // `full_state` — tohle ověřuje právě ten odložený krok.
    await expect(page.getByRole('button', { name: /← Projekty/ })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('tab', { name: 'Kapacita' }).click();
    await expect(page.getByLabel('Jméno — Petra Kolářová')).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await page.getByRole('tab', { name: 'Kapacita' }).click();
    await expect(page.getByLabel('Jméno — Petra Kolářová')).toBeVisible();
  });
});
