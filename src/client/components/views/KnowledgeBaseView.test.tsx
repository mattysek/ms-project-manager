// Testy KnowledgeBaseView — scénáře `docs/features/knowledge-base.feature`.
//
// Render přes `renderKb` harness (`knowledgeBaseViewHarness.tsx`) — stejný
// vzor jako `RizikaView.test.tsx`/`SeznamView.test.tsx`: view napojený na
// reálné command hooky s fake serverem, `dispatched` je odchozí strana.
//
// Poznámka k rolím: `KnowledgeBaseView` nedostává `role` prop vůbec — podle
// FR-ROLE-01 (PRD-03) mají PM i Dev na KB stránkách plné R/W, takže tu není
// co gatovat. Scénáře „(Dev)"/„PM může také…" proto ověřují STEJNOU cestu
// kódem, jen s jinými daty — cílem je dokázat, že přidání/smazání nic
// neblokuje, ne že existují dvě různé cesty.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import * as kbApi from '../../api/kbApi';
import { makeKbPage } from '../../state/testFixtures';
import { renderKb } from './knowledgeBaseViewHarness';

/** Zkratka nad `makeKbPage` — testy níž si přebíjejí jen pár polí. */
const page = makeKbPage;

/** Vylezme o `levels` úrovní výš od elementu — bez non-null assertion, s jasnou chybou. */
function ancestor(el: Element | undefined | null, levels: number): HTMLElement {
  let current: Element | null | undefined = el;
  for (let i = 0; i < levels && current; i++) current = current.parentElement;
  if (!current) throw new Error('Předek nenalezen — zkontroluj strukturu DOM v KnowledgeBaseView.');
  return current as HTMLElement;
}

/** Levý panel se seznamem stránek — po výběru stránky se stejný název objeví i v hlavičce obsahu. */
function sidebar(): HTMLElement {
  return ancestor(screen.getByText('📚 Dokumentace'), 2);
}

/** Otevře stránku kliknutím na její název v seznamu — voláno před výběrem, název je tam ještě unikátní. */
function openPage(title: string): void {
  fireEvent.click(within(sidebar()).getByText(title));
}

// ── Seznam a zobrazení stránek ───────────────────────────────────────────────

describe('KnowledgeBaseView — seznam a obsah stránek', () => {
  // @scenario: knowledge-base.feature > Zobrazení seznamu KB stránek
  it('zobrazí stránky v levém panelu seřazené dle data poslední úpravy (nejnovější nahoře)', () => {
    const older = makeKbPage({
      id: 'kb1',
      title: 'Nejstarší',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const newest = makeKbPage({
      id: 'kb2',
      title: 'Nejnovější',
      updatedAt: '2026-03-01T00:00:00.000Z',
    });
    const middle = makeKbPage({
      id: 'kb3',
      title: 'Prostřední',
      updatedAt: '2026-02-01T00:00:00.000Z',
    });
    renderKb({ kbPages: [older, newest, middle] });

    const text = sidebar().textContent ?? '';
    expect(text.indexOf('Nejnovější')).toBeLessThan(text.indexOf('Prostřední'));
    expect(text.indexOf('Prostřední')).toBeLessThan(text.indexOf('Nejstarší'));
  });

  // @scenario: knowledge-base.feature > Zobrazení obsahu KB stránky
  it('po kliknutí na stránku zobrazí obsah jako formátovaný markdown s H2', () => {
    const page = makeKbPage({
      id: 'kb1',
      title: 'Technická architektura',
      content: '## Přehled\n\nAplikace používá třívrstvou architekturu...',
    });
    renderKb({ kbPages: [page] });

    openPage('Technická architektura');

    expect(screen.getByRole('heading', { level: 2, name: 'Přehled' })).toBeInTheDocument();
    expect(screen.getByText(/Aplikace používá třívrstvou architekturu/)).toBeInTheDocument();
  });
});

// ── Přidání stránky ──────────────────────────────────────────────────────────

describe('KnowledgeBaseView — přidání stránky', () => {
  // @scenario: knowledge-base.feature > Přidání nové KB stránky (Dev)
  it('založí prázdnou stránku v editačním módu a po uložení ji zobrazí v seznamu', () => {
    const { commandsOf } = renderKb();

    fireEvent.click(screen.getByRole('button', { name: '+ Nová stránka' }));
    expect(screen.getByPlaceholderText('Markdown obsah...')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Název stránky...'), {
      target: { value: 'Deployment postup' },
    });
    fireEvent.change(screen.getByPlaceholderText('Markdown obsah...'), {
      target: {
        value: '## Kroky\n\n1. Build Docker image\n2. Push do registry\n3. Deploy na server',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: '✓ Uložit' }));

    expect(within(sidebar()).getByText('Deployment postup')).toBeInTheDocument();
    const added = commandsOf('add_kb_page')[0];
    const updateCommands = commandsOf('update_kb_page');
    const updated = updateCommands[updateCommands.length - 1];
    expect(added?.page.title).toBe('Nová stránka');
    expect(updated).toMatchObject({
      type: 'update_kb_page',
      pageId: added?.page.id,
      fields: { title: 'Deployment postup' },
    });
  });

  // @scenario: knowledge-base.feature > PM může také přidávat KB stránky
  it('přidání stránky funguje stejně bez ohledu na roli volajícího (žádné gatování v komponentě)', () => {
    const { commandsOf } = renderKb();

    fireEvent.click(screen.getByRole('button', { name: '+ Nová stránka' }));
    fireEvent.change(screen.getByPlaceholderText('Název stránky...'), {
      target: { value: 'Onboarding checklist' },
    });
    fireEvent.click(screen.getByRole('button', { name: '✓ Uložit' }));

    expect(within(sidebar()).getByText('Onboarding checklist')).toBeInTheDocument();
    expect(commandsOf('add_kb_page')).toHaveLength(1);
  });
});

// ── Editace stránky ──────────────────────────────────────────────────────────

describe('KnowledgeBaseView — editace stránky', () => {
  // @scenario: knowledge-base.feature > Editace KB stránky
  it('přejde do editačního módu, uloží doplněný obsah a pošle update_kb_page', () => {
    const page = makeKbPage({
      id: 'kb1',
      title: 'Technická architektura',
      content: '## Přehled\n\nAplikace používá třívrstvou architekturu...',
    });
    const { lastCommand } = renderKb({ kbPages: [page] });

    openPage('Technická architektura');
    fireEvent.click(screen.getByRole('button', { name: '✎ Upravit' }));
    const textarea = screen.getByPlaceholderText('Markdown obsah...');
    expect(textarea).toHaveValue(page.content);

    const newContent = `${page.content}\n\n## Databáze\n\nSQLite s WAL módem`;
    fireEvent.change(textarea, { target: { value: newContent } });
    fireEvent.click(screen.getByRole('button', { name: '✓ Uložit' }));

    expect(screen.getByRole('heading', { level: 2, name: 'Databáze' })).toBeInTheDocument();
    expect(screen.getByText('SQLite s WAL módem')).toBeInTheDocument();
    expect(lastCommand('update_kb_page')).toMatchObject({
      type: 'update_kb_page',
      pageId: 'kb1',
      fields: { content: newContent },
    });
  });
});

// ── Live preview ──────────────────────────────────────────────────────────────

describe('KnowledgeBaseView — live preview při editaci', () => {
  // @scenario: knowledge-base.feature > Live preview markdownu při editaci
  it('přepnutí na záložku Preview zobrazí naformátovaný HTML render aktuálního draftu', () => {
    const page = makeKbPage({
      id: 'kb1',
      title: 'Technická architektura',
      content: 'Původní obsah',
    });
    renderKb({ kbPages: [page] });

    openPage('Technická architektura');
    fireEvent.click(screen.getByRole('button', { name: '✎ Upravit' }));
    fireEvent.change(screen.getByPlaceholderText('Markdown obsah...'), {
      target: { value: '## Nadpis\n\n**Tučně** a odrážky:\n\n- Jedna\n- Dva' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    expect(screen.queryByPlaceholderText('Markdown obsah...')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Nadpis' })).toBeInTheDocument();
    expect(screen.getByText('Tučně').tagName).toBe('STRONG');
    expect(screen.getByText('Jedna')).toBeInTheDocument();
    expect(screen.getByText('Dva')).toBeInTheDocument();

    // Přepnutí zpět na Editor zachová draft (preview nic neuložilo).
    fireEvent.click(screen.getByRole('button', { name: 'Editor' }));
    expect(screen.getByPlaceholderText('Markdown obsah...')).toHaveValue(
      '## Nadpis\n\n**Tučně** a odrážky:\n\n- Jedna\n- Dva'
    );
  });
});

// ── Zrušení editace ───────────────────────────────────────────────────────────

describe('KnowledgeBaseView — zrušení editace bez uložení', () => {
  // @scenario: knowledge-base.feature > Zrušení editace bez uložení
  it('u rozepsaných změn se ptá na potvrzení a po potvrzení vrátí původní obsah', () => {
    const page = makeKbPage({
      id: 'kb1',
      title: 'Technická architektura',
      content: 'Původní obsah',
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { commandsOf } = renderKb({ kbPages: [page] });

    openPage('Technická architektura');
    fireEvent.click(screen.getByRole('button', { name: '✎ Upravit' }));
    fireEvent.change(screen.getByPlaceholderText('Markdown obsah...'), {
      target: { value: 'Rozepsaná, neuložená změna' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Zrušit' }));

    expect(confirmSpy).toHaveBeenCalledWith('Máte neuložené změny. Opravdu chcete zrušit?');
    expect(screen.getByText('Původní obsah')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Markdown obsah...')).not.toBeInTheDocument();
    expect(commandsOf('update_kb_page')).toEqual([]);
  });
});

// ── Smazání stránky ───────────────────────────────────────────────────────────

describe('KnowledgeBaseView — smazání stránky', () => {
  // @scenario: knowledge-base.feature > Smazání KB stránky
  it('po potvrzení dialogu s názvem stránky ji smaže a odešle delete_kb_page', () => {
    const page = makeKbPage({ id: 'kb1', title: 'Zastaralá dokumentace' });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { commandsOf } = renderKb({ kbPages: [page] });

    openPage('Zastaralá dokumentace');
    fireEvent.click(screen.getByRole('button', { name: '✕' }));

    expect(confirmSpy).toHaveBeenCalledWith('Opravdu smazat stránku Zastaralá dokumentace?');
    expect(screen.queryByText('Zastaralá dokumentace')).not.toBeInTheDocument();
    expect(commandsOf('delete_kb_page')).toEqual([{ type: 'delete_kb_page', pageId: 'kb1' }]);
  });

  // @scenario: knowledge-base.feature > Dev může smazat KB stránku
  it('smazání funguje stejně bez ohledu na roli volajícího (žádné gatování v komponentě)', () => {
    const page = makeKbPage({ id: 'kb1', title: 'Technická architektura' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { commandsOf } = renderKb({ kbPages: [page] });

    openPage('Technická architektura');
    fireEvent.click(screen.getByRole('button', { name: '✕' }));

    expect(commandsOf('delete_kb_page')).toEqual([{ type: 'delete_kb_page', pageId: 'kb1' }]);
  });
});

// ── Fulltext vyhledávání ──────────────────────────────────────────────────────

describe('KnowledgeBaseView — fulltextové vyhledávání', () => {
  // @scenario: knowledge-base.feature > Fulltext vyhledávání v KB
  it('zobrazí jen stránky obsahující hledaný výraz a zvýrazní ho v náhledu', () => {
    const withDocker1 = makeKbPage({
      id: 'kb1',
      title: 'CI/CD pipeline',
      content: 'Používáme Docker pro build.',
    });
    const withDocker2 = makeKbPage({
      id: 'kb2',
      title: 'Lokální vývoj',
      content: 'Spusťte Docker Compose.',
    });
    const others = [
      makeKbPage({ id: 'kb3', title: 'Onboarding', content: 'Vítejte v týmu.' }),
      makeKbPage({ id: 'kb4', title: 'Retro poznámky', content: 'Co se povedlo.' }),
      makeKbPage({ id: 'kb5', title: 'Architektura', content: 'Tři vrstvy.' }),
    ];
    renderKb({ kbPages: [withDocker1, withDocker2, ...others] });

    fireEvent.change(screen.getByPlaceholderText('Hledat...'), { target: { value: 'Docker' } });

    expect(screen.getByText('CI/CD pipeline')).toBeInTheDocument();
    expect(screen.getByText('Lokální vývoj')).toBeInTheDocument();
    for (const p of others) expect(screen.queryByText(p.title)).not.toBeInTheDocument();
    expect(screen.getAllByText('Docker').length).toBeGreaterThan(0);
    // Zvýraznění = <mark> element obsahující shodu.
    const marks = document.querySelectorAll('mark');
    expect(marks.length).toBeGreaterThan(0);
    expect([...marks].some((m) => m.textContent === 'Docker')).toBe(true);
  });

  // @scenario: knowledge-base.feature > Vyhledávání hledá v názvech i obsahu
  it('najde stránku podle výrazu, který je jen v obsahu, ne v názvu', () => {
    const page = makeKbPage({
      id: 'kb1',
      title: 'Deployment postup',
      content: '...použijeme Kubernetes cluster...',
    });
    renderKb({ kbPages: [page] });

    fireEvent.change(screen.getByPlaceholderText('Hledat...'), { target: { value: 'Kubernetes' } });

    expect(screen.getByText('Deployment postup')).toBeInTheDocument();
  });

  // @scenario: knowledge-base.feature > Vymazání vyhledávání zobrazí všechny stránky
  it('po vymazání vyhledávacího pole se zobrazí všechny stránky', () => {
    const withDocker = makeKbPage({ id: 'kb1', title: 'CI/CD pipeline', content: 'Docker build.' });
    const other = makeKbPage({ id: 'kb2', title: 'Onboarding', content: 'Vítejte.' });
    renderKb({ kbPages: [withDocker, other] });

    const search = screen.getByPlaceholderText('Hledat...');
    fireEvent.change(search, { target: { value: 'Docker' } });
    expect(screen.queryByText('Onboarding')).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: '' } });
    expect(screen.getByText('CI/CD pipeline')).toBeInTheDocument();
    expect(screen.getByText('Onboarding')).toBeInTheDocument();
  });
});

// ── Simultánní editace ────────────────────────────────────────────────────────

describe('KnowledgeBaseView — simultánní editace stejné stránky', () => {
  // @scenario: knowledge-base.feature > Simultánní editace stejné KB stránky
  it('upozorní na uložení jiným uživatelem a po "Obnovit" nahradí draft serverovou verzí', () => {
    const page = makeKbPage({
      id: 'kb1',
      title: 'Technická architektura',
      content: 'Původní obsah',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const { applyExternalKbUpdate } = renderKb({ kbPages: [page] });

    openPage('Technická architektura');
    fireEvent.click(screen.getByRole('button', { name: '✎ Upravit' }));
    fireEvent.change(screen.getByPlaceholderText('Markdown obsah...'), {
      target: { value: 'Moje rozepsaná verze' },
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // Simuluje diff od jiného uživatele, který mezitím stránku uložil (server broadcast).
    act(() => {
      applyExternalKbUpdate('kb1', {
        title: 'Technická architektura',
        content: 'Verze uložená kolegou',
        updatedAt: '2026-01-01T00:05:00.000Z',
      });
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Tato stránka byla upravena jiným uživatelem. Chcete obnovit obsah?'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Obnovit' }));

    expect(screen.getByPlaceholderText('Markdown obsah...')).toHaveValue('Verze uložená kolegou');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('po "Zachovat mé změny" zavře notifikaci a ponechá lokální draft beze změny', () => {
    const page = makeKbPage({
      id: 'kb1',
      title: 'Technická architektura',
      content: 'Původní obsah',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const { applyExternalKbUpdate } = renderKb({ kbPages: [page] });

    openPage('Technická architektura');
    fireEvent.click(screen.getByRole('button', { name: '✎ Upravit' }));
    fireEvent.change(screen.getByPlaceholderText('Markdown obsah...'), {
      target: { value: 'Moje rozepsaná verze' },
    });
    act(() => {
      applyExternalKbUpdate('kb1', {
        content: 'Verze uložená kolegou',
        updatedAt: '2026-01-01T00:05:00.000Z',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Zachovat mé změny' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Markdown obsah...')).toHaveValue('Moje rozepsaná verze');
  });
});

// ── Markdown rendering ────────────────────────────────────────────────────────

describe('KnowledgeBaseView — markdown rendering', () => {
  // @scenario: knowledge-base.feature > Markdown rendering — všechny základní elementy
  it('vykreslí nadpisy, tučný text, kurzívu, seznamy, inline kód a blok kódu', () => {
    const content = [
      '# Nadpis H1',
      '## Nadpis H2',
      '**Tučný text** a *kurzíva*',
      '- Odrážka 1',
      '- Odrážka 2',
      '1. Číslovka 1',
      '`inline code`',
      '```',
      'blok kódu',
      '```',
    ].join('\n');
    const page = makeKbPage({ id: 'kb1', title: 'Markdown test', content });
    renderKb({ kbPages: [page] });

    openPage('Markdown test');

    expect(screen.getByRole('heading', { level: 1, name: 'Nadpis H1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Nadpis H2' })).toBeInTheDocument();
    expect(screen.getByText('Tučný text').tagName).toBe('STRONG');
    expect(screen.getByText('kurzíva').tagName).toBe('EM');
    expect(screen.getByText('Odrážka 1').closest('ul')).toBeInTheDocument();
    expect(screen.getByText('Číslovka 1').closest('ol')).toBeInTheDocument();
    expect(screen.getByText('inline code').tagName).toBe('CODE');
    expect(screen.getByText('blok kódu').closest('pre')).toBeInTheDocument();
  });
});

describe('KnowledgeBaseView — štítky a historie', () => {
  // @scenario: knowledge-base.feature > Přidání štítků ke stránce
  it('štítky zadané při editaci se uloží a zobrazí u stránky', async () => {
    const { dispatched } = renderKb({
      kbPages: [page({ id: 'kb1', title: 'Deployment postup', content: '# Deployment' })],
    });
    await userEvent.click(screen.getByText('Deployment postup'));
    await userEvent.click(screen.getByText('✎ Upravit'));

    await userEvent.type(screen.getByLabelText('Štítky stránky'), 'provoz, docker');
    await userEvent.click(screen.getByText('✓ Uložit'));

    // Štítek se po uložení objeví dvakrát: pod názvem stránky a jako filtr
    // v postranním panelu — obojí je správně.
    await waitFor(() => expect(screen.getAllByText('provoz').length).toBeGreaterThan(0));
    expect(screen.getAllByText('docker').length).toBeGreaterThan(0);
    // Štítky jdou na server běžným update_kb_page, ne vlastním endpointem.
    expect(
      dispatched.some((cmd) => cmd.type === 'update_kb_page' && cmd.fields.tags?.includes('provoz'))
    ).toBe(true);
  });

  // @scenario: knowledge-base.feature > Filtrování stránek podle štítku
  it('klik na štítek zúží seznam, "Vše" filtr zruší', async () => {
    renderKb({
      kbPages: [
        page({ id: 'kb1', title: 'Deployment postup', tags: ['provoz'] }),
        page({ id: 'kb2', title: 'Onboarding', tags: ['lidi'] }),
        page({ id: 'kb3', title: 'Monitoring', tags: ['provoz'] }),
      ],
    });

    await userEvent.click(screen.getByRole('button', { name: 'provoz' }));

    expect(screen.getByText('Deployment postup')).toBeInTheDocument();
    expect(screen.getByText('Monitoring')).toBeInTheDocument();
    expect(screen.queryByText('Onboarding')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Vše' }));
    expect(screen.getByText('Onboarding')).toBeInTheDocument();
  });

  // @scenario: knowledge-base.feature > Obnovení starší verze stránky
  it('obnovení verze přepíše obsah a jde na server jako běžná editace', async () => {
    vi.spyOn(kbApi, 'listRevisions').mockResolvedValue([
      {
        id: 'r1',
        title: 'Technická architektura',
        content: '## Původní znění',
        savedAt: '2026-08-12T10:00:00Z',
        savedBy: 'Jan Novák',
      },
    ]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const { dispatched } = renderKb({
      kbPages: [page({ id: 'kb1', title: 'Technická architektura', content: '## Nové znění' })],
    });
    await userEvent.click(screen.getByText('Technická architektura'));
    await userEvent.click(screen.getByText('⟲ Historie'));

    await screen.findByText(/Jan Novák/);
    await userEvent.click(screen.getByText('Obnovit'));

    await waitFor(() =>
      expect(
        dispatched.some(
          (cmd) => cmd.type === 'update_kb_page' && cmd.fields.content === '## Původní znění'
        )
      ).toBe(true)
    );
  });
});
