// Historie verzí KB stránek (knowledge-base.feature).
//
// Revize se drží MIMO `AppState` (tabulka `kb_page_revisions`, port
// `ProjectStore.ArchiveKbPage`) — stav se broadcastuje při každém `full_state`,
// kdežto historie se čte jen na vyžádání. Actor ji zapisuje PŘED každou
// změnou stránky. Obnovení není samostatný endpoint: klient pošle obyčejný
// `update_kb_page`, takže projde stejnou autorizací i offline frontou a samo
// se stane revizí.
import { expect, test, type Page } from '@playwright/test';
import { createProject, createUser, loginAs, unique } from './fixtures';

/** Založí KB stránku s daným obsahem a uloží ji. */
async function createPage(page: Page, title: string, content: string): Promise<void> {
  await page.getByRole('tab', { name: 'Dokumentace' }).click();
  await page.getByRole('button', { name: /Nová stránka/i }).click();
  await page.getByPlaceholder(/Název stránky/i).fill(title);
  await page.getByPlaceholder(/Markdown obsah/i).fill(content);
  await page.getByRole('button', { name: /Uložit/i }).click();
}

/** Přepíše obsah otevřené stránky a uloží. */
async function editContent(page: Page, content: string): Promise<void> {
  await page.getByRole('button', { name: /Upravit|✎/ }).first().click();
  await page.getByPlaceholder(/Markdown obsah/i).fill(content);
  await page.getByRole('button', { name: /Uložit/i }).click();
}

async function kbProject(page: Page, request: Parameters<typeof createUser>[0]) {
  const user = await createUser(request, 'Jan Novák');
  await loginAs(page, user);
  await createProject(page, unique('KB'));
  return user;
}

test.describe('Historie KB stránky', () => {
  test('každá úprava přidá verzi do historie', async ({ page, request }) => {
    await kbProject(page, request);
    await createPage(page, 'Provozní příručka', 'První verze');

    await editContent(page, 'Druhá verze');
    await editContent(page, 'Třetí verze');

    // Archivuje se stav PŘED změnou, takže v historii jsou obě starší znění.
    // Počet záznamů se schválně netvrdí: kolik `update_kb_page` odejde při
    // jednom uložení, je detail editoru, ne vlastnost historie.
    await page.getByRole('button', { name: /Historie/ }).click();
    const dialog = page.getByLabel('Historie stránky');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('První verze')).toBeVisible();
    await expect(dialog.getByText('Druhá verze')).toBeVisible();
    // Aktuální znění v historii být nemá — to je na stránce samotné.
    await expect(dialog.getByText('Třetí verze')).toHaveCount(0);
  });

  test('obnovení staré verze vrátí obsah a samo se stane revizí', async ({ page, request }) => {
    await kbProject(page, request);
    await createPage(page, 'Provozní příručka', 'Původní postup');
    await editContent(page, 'Přepsaný postup');

    await page.getByRole('button', { name: /Historie/ }).click();
    const dialog = page.getByLabel('Historie stránky');
    page.once('dialog', (nativeDialog) => nativeDialog.accept());
    await dialog.getByRole('button', { name: 'Obnovit' }).first().click();

    await expect(page.getByText('Původní postup')).toBeVisible();

    // Obnovení jde jako obyčejný `update_kb_page`, takže se musí uložit na
    // serveru — reload je jediný způsob, jak to odlišit od lokální změny.
    await page.reload();
    await page.getByRole('tab', { name: 'Dokumentace' }).click();
    await page.getByText('Provozní příručka').first().click();
    await expect(page.getByText('Původní postup')).toBeVisible();

    // A protože je to běžná úprava, přibyla i verze s přepsaným textem.
    await page.getByRole('button', { name: /Historie/ }).click();
    await expect(dialog.getByText('Přepsaný postup')).toBeVisible();
  });

  test('historie přežije reload — nežije v AppState', async ({ page, request }) => {
    await kbProject(page, request);
    await createPage(page, 'Provozní příručka', 'První verze');
    await editContent(page, 'Druhá verze');

    await page.reload();
    await page.getByRole('tab', { name: 'Dokumentace' }).click();
    await page.getByText('Provozní příručka').first().click();

    await page.getByRole('button', { name: /Historie/ }).click();
    await expect(page.getByLabel('Historie stránky').getByText('První verze')).toBeVisible();
  });
});
