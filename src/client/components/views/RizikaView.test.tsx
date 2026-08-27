// Testy RizikaView — scénáře `docs/features/risks-opportunities.feature`.
//
// Render přes `renderRizika` harness (`rizikaViewHarness.tsx`) — stejný vzor
// jako `SeznamView.test.tsx`: view napojený na reálné command hooky s fake
// serverem, `dispatched` je odchozí strana (co by šlo na server).
//
// Poznámka k „je viditelné i petra.kolarova": tenhle harness má jednoho
// klienta, ne dva prohlížeče. „Viditelnost pro druhého uživatele" ověřujeme
// jako proxy — že byl odeslán command, který server broadcastne všem v
// projektu (FR-COLLAB-05). Skutečné doručení diffu druhému klientovi pokrývá
// `applyDiff.test.ts` / `useProjectChannel.test.ts`.

import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeOpportunity, makeRisk, makeTask } from '../../state/testFixtures';
import { generateStatusReport } from './rizika/statusReport';
import { renderRizika } from './rizikaViewHarness';

// ── Pomocné dotazy ───────────────────────────────────────────────────────────

/** Vylezme o `levels` úrovní výš od elementu — bez non-null assertion, s jasnou chybou. */
function ancestor(el: Element | undefined | null, levels: number): HTMLElement {
  let current: Element | null | undefined = el;
  for (let i = 0; i < levels && current; i++) current = current.parentElement;
  if (!current) throw new Error('Předek nenalezen — zkontroluj strukturu DOM v RizikaView.');
  return current as HTMLElement;
}

/** Karta rizika v needitujícím stavu — název je prostý text, ne input. */
function riskCard(title: string): HTMLElement {
  return ancestor(screen.getByText(title), 1);
}

/** Karta příležitosti v needitujícím stavu. */
function oppCard(title: string): HTMLElement {
  return ancestor(screen.getByText(title), 1);
}

function risksSection(): HTMLElement {
  return ancestor(screen.getByText('⚠ Rizika'), 2);
}

function oppsSection(): HTMLElement {
  return ancestor(screen.getByText('✦ Příležitosti'), 2);
}

function fillNewRisk(
  sev: 'high' | 'med' | 'low',
  who: string,
  title: string,
  detail: string
): void {
  fireEvent.change(screen.getByLabelText('Závažnost rizika'), { target: { value: sev } });
  fireEvent.change(screen.getByPlaceholderText('Kdo…'), { target: { value: who } });
  fireEvent.change(screen.getByLabelText('Název rizika'), { target: { value: title } });
  fireEvent.change(screen.getByLabelText('Detail rizika'), { target: { value: detail } });
  fireEvent.click(screen.getByRole('button', { name: '+ Přidat' }));
}

// ── Přidání rizika ───────────────────────────────────────────────────────────

describe('RizikaView — přidání rizika', () => {
  // @scenario: risks-opportunities.feature > Přidání rizika se závažností HIGH
  it('vytvoří riziko se závažností HIGH a označí ho červeným štítkem VYSOKÉ', () => {
    const { commandsOf } = renderRizika();

    fireEvent.click(screen.getByRole('button', { name: '+ Přidat riziko' }));
    fillNewRisk(
      'high',
      'Jan Novák',
      'Zpoždění externího dodavatele',
      'Dodavatel API komponent má skluz 3 týdny, ovlivňuje W8-W12'
    );

    const card = riskCard('Zpoždění externího dodavatele');
    const badge = within(card).getByText('VYSOKÉ');
    expect(badge).toHaveStyle({ color: '#fca5a5' });
    expect(within(card).getByText(/Dodavatel API komponent má skluz/)).toBeInTheDocument();

    // Proxy za „je viditelné i petra.kolarova" — commandy šly na server, který
    // je broadcastne (add_risk založí riziko, update_risk doplní zadané hodnoty).
    expect(commandsOf('add_risk')).toHaveLength(1);
    const updates = commandsOf('update_risk');
    expect(updates.some((c) => c.fields.sev === 'high')).toBe(true);
    expect(updates.some((c) => c.fields.title === 'Zpoždění externího dodavatele')).toBe(true);
  });

  // @scenario: risks-opportunities.feature > Přidání rizika se závažností MEDIUM
  it('vytvoří riziko se závažností MEDIUM a označí ho oranžovým štítkem STŘEDNÍ', () => {
    renderRizika();

    fireEvent.click(screen.getByRole('button', { name: '+ Přidat riziko' }));
    fillNewRisk('med', '', 'Fluktuace v týmu', '');

    const badge = within(riskCard('Fluktuace v týmu')).getByText('STŘEDNÍ');
    expect(badge).toHaveStyle({ color: '#fcd34d' });
  });

  // @scenario: risks-opportunities.feature > Přidání rizika se závažností LOW
  it('vytvoří riziko se závažností LOW a označí ho zeleným štítkem NÍZKÉ', () => {
    renderRizika();

    fireEvent.click(screen.getByRole('button', { name: '+ Přidat riziko' }));
    fillNewRisk('low', '', 'Drobné technické dluhy', '');

    const badge = within(riskCard('Drobné technické dluhy')).getByText('NÍZKÉ');
    expect(badge).toHaveStyle({ color: '#6ee7b7' });
  });
});

// ── Editace a mazání rizika ──────────────────────────────────────────────────

describe('RizikaView — editace a mazání rizika', () => {
  // @scenario: risks-opportunities.feature > Editace existujícího rizika
  it('uloží novou závažnost a detail jako update_risk commandy', () => {
    const risk = makeRisk({ id: 'r1', sev: 'high', title: 'Zpoždění externího dodavatele' });
    const { commandsOf } = renderRizika({ risks: [risk] });

    fireEvent.click(
      within(riskCard('Zpoždění externího dodavatele')).getByRole('button', { name: '✎ Edit' })
    );
    fireEvent.change(screen.getByLabelText('Závažnost rizika'), { target: { value: 'med' } });
    fireEvent.change(screen.getByLabelText('Detail rizika'), {
      target: { value: 'Skluz byl upraven na 1 týden, dopad minimální' },
    });
    fireEvent.click(screen.getByRole('button', { name: '✓ Uložit' }));

    const card = riskCard('Zpoždění externího dodavatele');
    expect(within(card).getByText('STŘEDNÍ')).toBeInTheDocument();
    expect(
      within(card).getByText('Skluz byl upraven na 1 týden, dopad minimální')
    ).toBeInTheDocument();

    const updates = commandsOf('update_risk');
    expect(updates.some((c) => c.fields.sev === 'med')).toBe(true);
    expect(
      updates.some((c) => c.fields.detail === 'Skluz byl upraven na 1 týden, dopad minimální')
    ).toBe(true);
    expect(updates.every((c) => c.riskId === 'r1')).toBe(true);
  });

  // @scenario: risks-opportunities.feature > Smazání rizika (PM)
  it('po potvrzení dialogu smaže riziko a odešle delete_risk', () => {
    const risk = makeRisk({ id: 'r1', title: 'Obsoletní riziko' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { commandsOf } = renderRizika({ risks: [risk] });

    fireEvent.click(within(riskCard('Obsoletní riziko')).getByRole('button', { name: '✕' }));

    expect(screen.queryByText('Obsoletní riziko')).not.toBeInTheDocument();
    expect(commandsOf('delete_risk')).toEqual([{ type: 'delete_risk', riskId: 'r1' }]);
  });
});

// ── Role Dev na rizikách ─────────────────────────────────────────────────────

describe('RizikaView — Dev nemůže spravovat rizika', () => {
  // @scenario: risks-opportunities.feature > Dev nemůže přidávat ani mazat rizika
  it('tlačítko Přidat riziko je neaktivní a ikony editace/smazání u rizik chybí', () => {
    const risk = makeRisk({ id: 'r1', title: 'Existující riziko' });
    renderRizika({ risks: [risk], role: 'dev' });

    expect(screen.getByRole('button', { name: '+ Přidat riziko' })).toBeDisabled();
    const card = riskCard('Existující riziko');
    expect(within(card).queryByRole('button', { name: '✎ Edit' })).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: '✕' })).not.toBeInTheDocument();
  });
});

// ── Příležitosti ──────────────────────────────────────────────────────────────

describe('RizikaView — příležitosti', () => {
  // @scenario: risks-opportunities.feature > Přidání příležitosti
  it('vytvoří příležitost s názvem a detailem', () => {
    const { commandsOf } = renderRizika();

    fireEvent.click(screen.getByRole('button', { name: '+ Přidat příležitost' }));
    fireEvent.change(screen.getByLabelText('Název příležitosti'), {
      target: { value: 'Zrychlení nasazení pomocí nového CI/CD' },
    });
    fireEvent.change(screen.getByLabelText('Detail příležitosti'), {
      target: { value: 'Přechod na GitHub Actions zkrátí deployment z 30 min na 5 min' },
    });
    fireEvent.click(within(oppsSection()).getByRole('button', { name: '+ Přidat' }));

    expect(
      within(oppCard('Zrychlení nasazení pomocí nového CI/CD')).getByText(
        'Přechod na GitHub Actions zkrátí deployment z 30 min na 5 min'
      )
    ).toBeInTheDocument();
    expect(commandsOf('add_opportunity')).toHaveLength(1);
    const updates = commandsOf('update_opportunity');
    expect(updates.some((c) => c.fields.title === 'Zrychlení nasazení pomocí nového CI/CD')).toBe(
      true
    );
    expect(
      updates.some(
        (c) => c.fields.detail === 'Přechod na GitHub Actions zkrátí deployment z 30 min na 5 min'
      )
    ).toBe(true);
  });

  // @scenario: risks-opportunities.feature > Editace příležitosti
  it('uloží nový název příležitosti jako update_opportunity', () => {
    const opp = makeOpportunity({ id: 'o1', title: 'Nová knihovna pro testování' });
    const { lastCommand } = renderRizika({ opps: [opp] });

    fireEvent.click(
      within(oppCard('Nová knihovna pro testování')).getByRole('button', { name: '✎ Edit' })
    );
    fireEvent.change(screen.getByLabelText('Název příležitosti'), {
      target: { value: 'Nová testovací knihovna — 30% méně kódu' },
    });
    fireEvent.click(screen.getByRole('button', { name: '✓ Uložit' }));

    expect(screen.getByText('Nová testovací knihovna — 30% méně kódu')).toBeInTheDocument();
    expect(lastCommand('update_opportunity')).toEqual({
      type: 'update_opportunity',
      oppId: 'o1',
      fields: { title: 'Nová testovací knihovna — 30% méně kódu' },
    });
  });

  // @scenario: risks-opportunities.feature > Smazání příležitosti (PM)
  it('po potvrzení dialogu smaže příležitost a odešle delete_opportunity', () => {
    const opp = makeOpportunity({ id: 'o1', title: 'Zastaralá příležitost' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { commandsOf } = renderRizika({ opps: [opp] });

    fireEvent.click(within(oppCard('Zastaralá příležitost')).getByRole('button', { name: '✕' }));

    expect(screen.queryByText('Zastaralá příležitost')).not.toBeInTheDocument();
    expect(commandsOf('delete_opportunity')).toEqual([{ type: 'delete_opportunity', oppId: 'o1' }]);
  });
});

// ── Poznámky k projektu ──────────────────────────────────────────────────────

describe('RizikaView — poznámky k projektu', () => {
  // @scenario: risks-opportunities.feature > Editace poznámek k projektu (PM)
  it('commituje poznámky na blur jako update_project', () => {
    const { lastCommand } = renderRizika();

    const textarea = screen.getByLabelText('Poznámky k projektu');
    fireEvent.change(textarea, {
      target: { value: 'Sprint 5 proběhl dle plánu. Tým pracuje dobře.' },
    });
    fireEvent.blur(textarea);

    expect(lastCommand('update_project')).toEqual({
      type: 'update_project',
      fields: { notes: 'Sprint 5 proběhl dle plánu. Tým pracuje dobře.' },
    });
  });

  // @scenario: risks-opportunities.feature > Poznámky k projektu jsou Markdown
  it('náhled vysází markdown a zpět ukáže zdroj', () => {
    renderRizika();

    const textarea = screen.getByLabelText('Poznámky k projektu');
    fireEvent.change(textarea, {
      target: { value: '## Kontakty\n\n- [Wiki](https://wiki.firma.cz)' },
    });

    // Přepnutí do náhledu je zároveň opuštění pole — bez commitu by se náhled
    // vysázel ze starého (ještě neuloženého) textu.
    fireEvent.click(screen.getByRole('button', { name: '👁 Náhled' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Kontakty' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Wiki' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '✎ Zdroj' }));
    expect(screen.getByLabelText('Poznámky k projektu')).toHaveValue(
      '## Kontakty\n\n- [Wiki](https://wiki.firma.cz)'
    );
  });

  // @scenario: risks-opportunities.feature > Editace poznámek k projektu (PM)
  it('Dev vidí uložené poznámky, ale pole je pro něj read-only', () => {
    renderRizika({ notes: 'Sprint 5 proběhl dle plánu. Tým pracuje dobře.', role: 'dev' });

    const textarea = screen.getByLabelText('Poznámky k projektu');
    expect(textarea).toHaveValue('Sprint 5 proběhl dle plánu. Tým pracuje dobře.');
    expect(textarea).toHaveAttribute('readonly');
  });

  // @scenario: risks-opportunities.feature > Dev nemůže editovat poznámky k projektu
  it('pole Poznámky k projektu je pro Dev read-only', () => {
    renderRizika({ role: 'dev' });

    expect(screen.getByLabelText('Poznámky k projektu')).toHaveAttribute('readonly');
  });
});

// ── Changelog / meeting log ──────────────────────────────────────────────────

describe('RizikaView — changelog', () => {
  // @scenario: risks-opportunities.feature > Přidání záznamu do changelogu / meeting logu
  it('přidá záznam s dnešním datem na vrchol seznamu', () => {
    const { lastCommand } = renderRizika();
    const today = new Date().toLocaleDateString('cs-CZ', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    fireEvent.change(screen.getByPlaceholderText(/Nový záznam/), {
      target: { value: 'Sprint planning 11.8.2026 — dohodnut scope pro Q3' },
    });
    fireEvent.click(screen.getByRole('button', { name: '+ Přidat záznam' }));

    const entry = screen.getByText('Sprint planning 11.8.2026 — dohodnut scope pro Q3');
    expect(entry).toBeInTheDocument();
    expect(screen.getByText(today)).toBeInTheDocument();

    const changelog = lastCommand('update_project')?.fields.changelog;
    expect(changelog).toHaveLength(1);
    expect(changelog?.[0]).toMatchObject({
      text: 'Sprint planning 11.8.2026 — dohodnut scope pro Q3',
    });
  });

  // @scenario: risks-opportunities.feature > Záznamy changelogu jsou chronologicky seřazeny
  it('seřadí záznamy nejnovější nahoře bez ohledu na pořadí ve stavu', () => {
    renderRizika({
      changelog: [
        { id: 'c1', date: '2026-08-01', text: 'Záznam 1.8.' },
        { id: 'c2', date: '2026-08-10', text: 'Záznam 10.8.' },
        { id: 'c3', date: '2026-08-05', text: 'Záznam 5.8.' },
      ],
    });

    // DOM pořadí musí být: 10.8. → 5.8. → 1.8. (nejnovější nahoře).
    const container = ancestor(screen.getByText('Changelog / Meeting log'), 2);
    const allText = container.textContent ?? '';
    expect(allText.indexOf('Záznam 10.8.')).toBeLessThan(allText.indexOf('Záznam 5.8.'));
    expect(allText.indexOf('Záznam 5.8.')).toBeLessThan(allText.indexOf('Záznam 1.8.'));
  });

  // @scenario: risks-opportunities.feature > Dev vidí changelog ale nemůže přidávat záznamy
  it('Dev vidí existující záznamy, ale tlačítko Přidat záznam je neaktivní', () => {
    renderRizika({
      role: 'dev',
      changelog: [{ id: 'c1', date: '2026-08-05', text: 'Záznam viditelný pro Dev' }],
    });

    expect(screen.getByText('Záznam viditelný pro Dev')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Přidat záznam' })).toBeDisabled();
  });
});

// ── Statusová zpráva ──────────────────────────────────────────────────────────

describe('RizikaView — statusová zpráva', () => {
  // @scenario: risks-opportunities.feature > Automatické vygenerování statusové zprávy
  it('vygeneruje shrnutí stavu a umožní ho před uložením upravit', () => {
    const risks = [
      makeRisk({ id: 'r1', sev: 'high', title: 'Riziko A' }),
      makeRisk({ id: 'r2', sev: 'med', title: 'Riziko B' }),
      makeRisk({ id: 'r3', sev: 'low', title: 'Riziko C' }),
    ];
    const opps = [
      makeOpportunity({ id: 'o1', title: 'Příležitost A' }),
      makeOpportunity({ id: 'o2', title: 'Příležitost B' }),
    ];
    // md=100, progress=45 → overallProgress přesně 45 %.
    const tasks = [makeTask({ id: 't1', md: 100, progress: 45 })];
    renderRizika({ risks, opps, tasks });

    fireEvent.click(screen.getByRole('button', { name: 'AUTO' }));

    const expected = generateStatusReport(risks, opps, 45);
    const textarea = screen.getByLabelText('Statusová zpráva');
    expect(textarea).toHaveValue(expected);
    expect(expected).toContain('45 %');
    expect(expected).toContain('Riziko A');
    expect(expected).toContain('Příležitost A');

    // Text lze před uložením upravit — je to obyčejný textarea, ne read-only pole.
    fireEvent.change(textarea, { target: { value: 'Ruční úprava reportu' } });
    expect(textarea).toHaveValue('Ruční úprava reportu');
  });

  // @scenario: risks-opportunities.feature > Rozepsaná statusová zpráva přežije přepnutí záložky
  it('rozepsaný text přežije odmountování view', () => {
    // Přepnutí záložky v `AppViews` komponentu odmountuje. Dokud text žil
    // v `useState` uvnitř sekce, zmizel bez varování — přitom se generuje
    // právě proto, aby si pro čísla člověk došel jinam.
    const { unmount } = renderRizika({});

    fireEvent.change(screen.getByLabelText('Statusová zpráva'), {
      target: { value: 'Rozepsaný report' },
    });
    unmount();

    renderRizika({});
    expect(screen.getByLabelText('Statusová zpráva')).toHaveValue('Rozepsaný report');
  });

  it('koncept je per projekt, cizí se nepřenese', () => {
    // Předchozí test nechal koncept `proj-1` v `sessionStorage` — schválně,
    // je to tatáž trvanlivost, kterou ověřuje.
    sessionStorage.clear();
    sessionStorage.setItem('statusReport:jiny-projekt', 'Report jiného projektu');
    renderRizika({});

    expect(screen.getByLabelText('Statusová zpráva')).toHaveValue('');
  });
});

// ── Řazení rizik ─────────────────────────────────────────────────────────────

describe('RizikaView — řazení rizik', () => {
  // @scenario: risks-opportunities.feature > Rizika jsou seřazena dle závažnosti
  it('zobrazí rizika v pořadí HIGH → MEDIUM → LOW bez ohledu na pořadí ve stavu', () => {
    const risks = [
      makeRisk({ id: 'r1', sev: 'low', title: 'Drobný problém' }),
      makeRisk({ id: 'r2', sev: 'high', title: 'Kritický problém' }),
      makeRisk({ id: 'r3', sev: 'med', title: 'Středně závažný' }),
    ];
    renderRizika({ risks });

    const allText = risksSection().textContent ?? '';
    expect(allText.indexOf('Kritický problém')).toBeLessThan(allText.indexOf('Středně závažný'));
    expect(allText.indexOf('Středně závažný')).toBeLessThan(allText.indexOf('Drobný problém'));
  });
});
