// Přílohy (ADR-010) — nahrání přes REST multipart, stažení a bezpečnostní
// pravidla kolem `Content-Disposition`.
//
// Tahle část má vlastní soubor, protože jako jediná nejde přes command kanál:
// obsah putuje REST multipartem a ve stavu projektu zůstává jen `FileRef`.
// Pravidla „co smí ven inline" jsou navíc bezpečnostní — přílohy se servírují
// z originu aplikace, takže cokoli skriptovatelného zobrazené inline je uložené
// XSS. Unit testy hlídají F# funkce, tady jde o skutečné hlavičky po drátě.
import { expect, test, type Page } from '@playwright/test';
import { addMember, createProject, createUser, loginAs, openProject, unique } from './fixtures';

/**
 * Nahraje soubor přes skrytý `<input type="file">` v drop zóně a vrátí id,
 * které mu přidělil server.
 *
 * Id se bere z odpovědi na upload — v UI nikde není a REST endpoint pro výpis
 * příloh neexistuje (metadata chodí ve stavu projektu přes SignalR).
 */
async function uploadFile(
  page: Page,
  name: string,
  mimeType: string,
  body: string
): Promise<string | null> {
  await page.getByRole('tab', { name: 'Soubory' }).click();
  const uploaded = page.waitForResponse((r) => r.url().includes('/files') && r.request().method() === 'POST');
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name, mimeType, buffer: Buffer.from(body) });

  const response = await uploaded;
  if (!response.ok()) return null;
  const { file } = (await response.json()) as { file: { id: string } };
  return file.id;
}

async function openFilesProject(page: Page, request: Parameters<typeof createUser>[0]) {
  const user = await createUser(request, 'Jan Novák');
  await loginAs(page, user);
  const name = unique('Soubory');
  await createProject(page, name);
  return { user, name };
}

test.describe('Soubory', () => {
  // @scenario: files.feature > Ovládání náhledu není schované pod horní lištou
  test('ovládání náhledu je klikatelné, ne pod horní lištou', async ({ page, request }) => {
    await openFilesProject(page, request);
    await uploadFile(page, 'zapis.txt', 'text/plain', 'Zápis z porady');

    await page.getByTitle('Zobrazit náhled').first().click();

    // Klik, ne jen viditelnost: `TopBar` je `position: fixed` a s vyšším
    // z-indexem by tlačítka překryl — byla by „vidět" a přesto mrtvá.
    // Přesně tak dřív umřela tlačítka „⬆ Import" a „⬇ Export".
    // Scope na ovládání náhledu: „↓ Stáhnout" má i každý řádek v seznamu.
    const controls = page.getByRole('toolbar', { name: 'Náhled přílohy' });
    const close = controls.getByRole('button', { name: '✕ Zavřít' });
    await expect(controls.getByRole('button', { name: '↓ Stáhnout' })).toBeVisible();
    await close.click();

    await expect(close).toHaveCount(0);
  });

  test('nahraný soubor se objeví v seznamu a přežije reload', async ({ page, request }) => {
    await openFilesProject(page, request);

    await uploadFile(page, 'zapis.txt', 'text/plain', 'Zápis z porady');
    await expect(page.getByText('zapis.txt')).toBeVisible();

    await page.reload();
    await page.getByRole('tab', { name: 'Soubory' }).click();
    await expect(page.getByText('zapis.txt')).toBeVisible();
  });

  test('poznámka u souboru se uloží', async ({ page, request }) => {
    await openFilesProject(page, request);
    await uploadFile(page, 'zapis.txt', 'text/plain', 'Zápis z porady');
    await expect(page.getByText('zapis.txt')).toBeVisible();

    await page.getByTitle('Upravit poznámku').click();
    const note = page.getByPlaceholder('Poznámka...');
    await note.fill('Finální verze');
    await note.press('Enter');

    await page.reload();
    await page.getByRole('tab', { name: 'Soubory' }).click();
    await expect(page.getByText('Finální verze')).toBeVisible();
  });

  test('smazání souboru ho odstraní natrvalo', async ({ page, request }) => {
    await openFilesProject(page, request);
    await uploadFile(page, 'zapis.txt', 'text/plain', 'Zápis z porady');
    await expect(page.getByText('zapis.txt')).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTitle('Smazat').click();
    await expect(page.getByText('zapis.txt')).toHaveCount(0);

    await page.reload();
    await page.getByRole('tab', { name: 'Soubory' }).click();
    await expect(page.getByText('zapis.txt')).toHaveCount(0);
  });

  // @scenario: files.feature > Běžné projektové přílohy jdou nahrát
  test('markdown, archiv i neznámý typ se nahrají', async ({ page, request }) => {
    await openFilesProject(page, request);

    // Whitelist MIME typů odmítal přesně tohle a reálný export z provozu tím
    // přišel o polovinu příloh.
    for (const [name, mime] of [
      ['poznamky.md', 'text/markdown'],
      ['balik.zip', 'application/x-zip-compressed'],
      ['neznamy.dat', 'application/octet-stream'],
    ] as const) {
      const id = await uploadFile(page, name, mime, 'obsah');
      expect(id).not.toBeNull();
      await expect(page.getByText(name)).toBeVisible();
    }
  });

  // @scenario: files.feature > Skriptovatelný obsah se nikdy nepošle inline
  test('SVG se nahraje, ale ven jde vždy jako příloha ke stažení', async ({ page, request }) => {
    await openFilesProject(page, request);

    // Nahrát jde; záruka je v tom, co server pošle zpět (ADR-010, doplněk).
    const id = await uploadFile(
      page,
      'utok.svg',
      'image/svg+xml',
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    );
    expect(id).not.toBeNull();

    const disposition = await page.evaluate(async (fileId) => {
      const response = await fetch(`/api/files/${fileId}?inline=true`);
      return response.headers.get('content-disposition');
    }, id);

    expect(disposition).toContain('attachment');
  });

  test('povolený, ale neskriptovatelný typ jde ven jako attachment i při inline=true', async ({
    page,
    request,
  }) => {
    await openFilesProject(page, request);
    const id = await uploadFile(page, 'zapis.txt', 'text/plain', 'Zápis z porady');
    expect(id).toBeTruthy();

    const response = await page.request.get(`/api/files/${id}?inline=true`);
    expect(response.status()).toBe(200);
    // Celá pointa: `text/plain` není v `inlineSafeMimes`, takže si o náhled
    // říct může kdokoli a stejně dostane `attachment`.
    expect(response.headers()['content-disposition']).toContain('attachment');
  });

  test('obrázek se inline zobrazit smí', async ({ page, request }) => {
    await openFilesProject(page, request);
    // Rastrový obrázek je v `inlineSafeMimes` — skript v něm nevznikne.
    const id = await uploadFile(page, 'nahled.gif', 'image/gif', 'GIF89a');
    expect(id).toBeTruthy();

    // Server u povoleného náhledu `Content-Disposition` neposílá vůbec
    // (`Results.File` bez názvu souboru) — což prohlížeč bere jako inline.
    // Testuje se proto nepřítomnost `attachment`, ne přítomnost `inline`.
    const preview = await page.request.get(`/api/files/${id}?inline=true`);
    expect(preview.status()).toBe(200);
    expect(preview.headers()['content-disposition'] ?? '').not.toContain('attachment');

    // Bez `inline=true` je to naopak vždycky ke stažení.
    const download = await page.request.get(`/api/files/${id}`);
    expect(download.headers()['content-disposition']).toContain('attachment');
  });

  test('soubor nahraný jedním uživatelem vidí druhý bez reloadu', async ({ browser, request }) => {
    const pm = await createUser(request, 'Jan Novák');
    const dev = await createUser(request, 'Petra Kolářová');

    const pmContext = await browser.newContext();
    const pmPage = await pmContext.newPage();
    await loginAs(pmPage, pm);
    const name = unique('SouboryLive');
    await createProject(pmPage, name);
    await addMember(pmPage, dev);

    const devContext = await browser.newContext();
    const devPage = await devContext.newPage();
    await loginAs(devPage, dev);
    await openProject(devPage, name);
    await devPage.getByRole('tab', { name: 'Soubory' }).click();

    await uploadFile(pmPage, 'sdilene.txt', 'text/plain', 'Pro tým');

    // `add_file` je server-internal command (SERVER_INTERNAL v protokolové
    // bráně) — vzniká až v REST handleru a broadcastuje se jako `file_added`.
    await expect(devPage.getByText('sdilene.txt')).toBeVisible({ timeout: 10_000 });

    await pmContext.close();
    await devContext.close();
  });
});
