// Testy KapacitaView — scénáře `docs/features/kapacita.feature`. Views
// zůstávají tenké prezentační komponenty (ADR-005); commandy se ověřují jako
// spy nad fake kanálem, stejný vzor jako GanttView.test.tsx/SeznamView.test.tsx.
//
// „Viditelnost pro druhého uživatele" (add_person, delete_person, …) ověřujeme
// jako proxy — že byl odeslán command, který server broadcastne (FR-COLLAB-05).
// Skutečné doručení diffu druhému klientovi pokrývá `applyDiff.test.ts` a — u
// alokace navíc — regresní test níž přes `remoteDiff` harnessu (ADR-004
// doplněk zdokumentoval, že `alloc_updated` klient donedávna vůbec neznal).
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { computeWeeks, injectWeeks, personTotalMD } from '../../utils';
import { makeTask } from '../../state/testFixtures';
import type { Person } from '../../types';
import {
  JAN,
  PETRA,
  NUM_WEEKS,
  START_DATE,
  END_DATE,
  renderKapacita,
  renderKapacitaClean,
} from './kapacitaViewHarness';

/** Úkol s daným počtem MD; rozsah týdnů je pro součty nepodstatný. */
function taskOf(id: string, personId: string, md: number) {
  return makeTask({ id, p: personId, md, s: 1, e: 1 });
}

function personRow(name: string): HTMLElement {
  const row = screen.getByLabelText(`Jméno — ${name}`).closest('tr');
  if (!row) throw new Error(`Řádek osoby „${name}" nenalezen — zkontroluj strukturu tabulky.`);
  return row as HTMLElement;
}

// ── Zobrazení ────────────────────────────────────────────────────────────────

describe('KapacitaView — zobrazení alokační tabulky', () => {
  // @scenario: kapacita.feature > Zobrazení alokační tabulky
  it('zobrazí řádky osob, 26 týdenních sloupců s default 100 % a skupiny měsíců', () => {
    renderKapacita();

    expect(personRow(JAN.name)).toBeInTheDocument();
    expect(personRow(PETRA.name)).toBeInTheDocument();
    expect(screen.getAllByLabelText(/^Alokace W\d+ — Jan Novák$/)).toHaveLength(NUM_WEEKS);
    expect(screen.getByLabelText('Alokace W1 — Jan Novák')).toHaveValue(100);
    expect(screen.getByLabelText('Alokace W1 — Petra Kolářová')).toHaveValue(100);
    expect(screen.getByText('LEDEN')).toBeInTheDocument();
  });
});

// ── Přidání a smazání osoby ─────────────────────────────────────────────────

describe('KapacitaView — správa osob', () => {
  // @scenario: kapacita.feature > Přidání nové osoby
  it('přidá nový řádek s defaultní 100% alokací a uloží osobu commandem', () => {
    const { commandsOf } = renderKapacita();

    fireEvent.click(screen.getByRole('button', { name: '+ Přidat člena' }));
    expect(commandsOf('add_person')).toHaveLength(1);

    fireEvent.change(screen.getByDisplayValue('Nový člen'), {
      target: { value: 'Tomáš Vondráček' },
    });
    fireEvent.change(screen.getByLabelText('Role — Tomáš Vondráček'), {
      target: { value: 'BE' },
    });
    fireEvent.change(screen.getByLabelText('Barva — Tomáš Vondráček'), {
      target: { value: '#fbbf24' },
    });

    const row = personRow('Tomáš Vondráček');
    expect(within(row).getByLabelText('Role — Tomáš Vondráček')).toHaveValue('BE');
    expect(within(row).getByLabelText('Barva — Tomáš Vondráček')).toHaveValue('#fbbf24');
    expect(within(row).getByLabelText('Alokace W1 — Tomáš Vondráček')).toHaveValue(100);
  });

  // @scenario: kapacita.feature > Smazání osoby (PM)
  it('odebere osobu po potvrzení a přesun úkolů do backlogu nechá na serveru', () => {
    const task = makeTask({ id: 't1', p: PETRA.id, name: 'Migrace DB' });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { commandsOf, lastCommand, remoteDiff } = renderKapacita({ tasks: [task] });

    fireEvent.click(screen.getByLabelText(`Odebrat — ${PETRA.name}`));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Opravdu odebrat Petra Kolářová z projektu? Přiřazené úkoly přejdou do backlogu.'
    );
    expect(screen.queryByLabelText(`Jméno — ${PETRA.name}`)).not.toBeInTheDocument();
    expect(lastCommand('delete_person')?.personId).toBe(PETRA.id);

    // Klient přeřazení nedosílá — kdyby ano, stačil by zavřený tab a úkoly by
    // zůstaly viset na neexistující osobě. Dělá to reducer v `delete_person`
    // (viz test „delete_person přesune úkoly smazané osoby do backlogu").
    expect(commandsOf('update_task')).toHaveLength(0);

    // Přeřazení dorazí jako diff ze serveru a projeví se ve stavu.
    remoteDiff({ op: 'task_updated', taskId: 't1', fields: { p: '' } });
    expect(screen.queryByLabelText(`Jméno — ${PETRA.name}`)).not.toBeInTheDocument();
  });
});

// ── Editace alokace ──────────────────────────────────────────────────────────

/** Součet MD pro `person` s `weekAlloc[weekIdx]` přepsaným na `pct` — nad reálnými týdny harnessu. */
function totalWithOverride(personId: string, weekIdx: number, pct: number): number {
  const weeks = computeWeeks(START_DATE, END_DATE);
  const base = personId === JAN.id ? JAN : PETRA;
  const [withWeeks] = injectWeeks([{ ...base, weekAlloc: [] }], weeks);
  withWeeks.weekAlloc[weekIdx] = pct;
  return personTotalMD(withWeeks);
}

describe('KapacitaView — editace alokace (PM)', () => {
  // @scenario: kapacita.feature > Editace alokace po týdnech (PM)
  it('uloží novou hodnotu, pošle update_alloc a přepočítá celkový MD', () => {
    const { lastCommand } = renderKapacita();

    fireEvent.change(screen.getByLabelText('Alokace W5 — Petra Kolářová'), {
      target: { value: '50' },
    });

    expect(screen.getByLabelText('Alokace W5 — Petra Kolářová')).toHaveValue(50);
    expect(lastCommand('update_alloc')).toEqual({
      type: 'update_alloc',
      personId: PETRA.id,
      weekIdx: 4,
      pct: 50,
    });
    const expectedTotal = totalWithOverride(PETRA.id, 4, 50);
    expect(within(personRow(PETRA.name)).getByText(String(expectedTotal))).toBeInTheDocument();
  });

  // @scenario: kapacita.feature > Editace alokace — 0% (nepřítomnost)
  it('0 % zobrazí buňku jako prázdnou/šedou a týden do MD nepřispívá', () => {
    renderKapacita();

    fireEvent.change(screen.getByLabelText('Alokace W10 — Jan Novák'), {
      target: { value: '0' },
    });

    const cell = screen.getByLabelText('Alokace W10 — Jan Novák').closest('td');
    expect(cell).not.toBeNull();
    expect(within(cell as HTMLElement).getByText('–')).toBeInTheDocument();

    const expectedTotal = totalWithOverride(JAN.id, 9, 0);
    expect(within(personRow(JAN.name)).getByText(String(expectedTotal))).toBeInTheDocument();
  });

  // @scenario: kapacita.feature > Editace alokace — neplatná hodnota
  it('150 zobrazí chybu a ponechá předchozí hodnotu', () => {
    renderKapacita();

    fireEvent.change(screen.getByLabelText('Alokace W3 — Jan Novák'), {
      target: { value: '150' },
    });

    expect(screen.getByText('Alokace musí být mezi 0 a 100')).toBeInTheDocument();
    expect(screen.getByLabelText('Alokace W3 — Jan Novák')).toHaveValue(100);
  });
});

describe('KapacitaView — přiřazení účtu k osobě (FR-ROLE-07)', () => {
  // @scenario: kapacita.feature > PM přiřadí osobě uživatelský účet
  // @scenario: kapacita.feature > Přiřazení účtu přebere jméno z účtu
  it('PM vybere účet a odešle update_person s userId', () => {
    const externista: Person = {
      id: 'p3',
      userId: null,
      name: 'Externista',
      role: 'FE',
      color: '#f59e0b',
      weekAlloc: Array(NUM_WEEKS).fill(100),
    };
    const { lastCommand } = renderKapacita({ people: [JAN, PETRA, externista] });

    const select = screen.getByLabelText('Účet — Externista');
    expect(select).toHaveValue('');

    fireEvent.change(select, { target: { value: 'u-tomas' } });

    // Spolu s účtem se přebírá i jméno z účtu — řádek vzniká jako „Nový člen"
    // a přepisovat po spárování ručně to, co systém zná, nemá smysl.
    expect(lastCommand('update_person')).toEqual({
      type: 'update_person',
      personId: 'p3',
      fields: { userId: 'u-tomas', name: 'Tomáš Vondráček' },
    });
    expect(screen.getByLabelText('Jméno — Tomáš Vondráček')).toBeInTheDocument();
  });

  // @scenario: kapacita.feature > PM zruší přiřazení účtu
  // @scenario: kapacita.feature > Zrušení vazby jméno nemění
  it('PM zruší vazbu volbou „bez účtu" a pošle userId null', () => {
    const { lastCommand } = renderKapacita();

    fireEvent.change(screen.getByLabelText(`Účet — ${PETRA.name}`), { target: { value: '' } });

    // Jméno zůstává — osoba v plánu nezmizela, jen ji nikdo nevlastní.
    expect(screen.getByLabelText(`Jméno — ${PETRA.name}`)).toBeInTheDocument();

    // `null`, ne vynechané pole: `PersonFields.UserId` je vnořeně volitelný,
    // takže chybějící klíč by znamenal „nesahat na to".
    expect(lastCommand('update_person')).toEqual({
      type: 'update_person',
      personId: PETRA.id,
      fields: { userId: null },
    });
  });

  // @scenario: kapacita.feature > Volbu účtu vidí Dev jen ke čtení
  it('Dev vidí přiřazený účet jako text, bez rozbalovacího seznamu', () => {
    renderKapacita({ role: 'dev', currentUserId: 'u-petra' });

    expect(screen.queryByLabelText(`Účet — ${PETRA.name}`)).not.toBeInTheDocument();
    expect(screen.getByText(`👤 ${PETRA.name}`)).toBeInTheDocument();
  });

  it('účet, který přestal být členem, se nepřepíše na „bez účtu"', () => {
    // Bez zvláštní volby by select spadl na prázdnou hodnotu a lhal by o tom,
    // co je doopravdy ve stavu — přesně jako u role smazané z `roles`.
    const { dispatched } = renderKapacita({ members: [] });

    // Obě osoby fixtures mají účet, takže „neznámý" je u obou — stačí, že
    // select drží skutečnou hodnotu a volbu k ní nabízí.
    const select = screen.getByLabelText(`Účet — ${PETRA.name}`);
    expect(select).toHaveValue(PETRA.userId);
    expect(within(select).getByText('— neznámý účet —')).toBeInTheDocument();
    expect(dispatched).toHaveLength(0);
  });
});

describe('KapacitaView — oprávnění Dev na alokaci (ADR-006 doplněk)', () => {
  // @scenario: kapacita.feature > Dev uživatel může editovat pouze vlastní alokaci
  it('Dev může upravit alokaci osoby namapované na jeho účet', () => {
    const { lastCommand } = renderKapacita({ role: 'dev', currentUserId: 'u-petra' });

    const input = screen.getByLabelText('Alokace W5 — Petra Kolářová');
    expect(input).not.toHaveAttribute('readonly');

    fireEvent.change(input, { target: { value: '80' } });

    expect(input).toHaveValue(80);
    expect(lastCommand('update_alloc')).toMatchObject({ personId: PETRA.id, pct: 80 });
  });

  // @scenario: kapacita.feature > Dev nemůže editovat cizí alokaci
  it('Dev nemůže upravit alokaci cizí osoby — buňka je read-only a nic se neodešle', () => {
    const { commandsOf } = renderKapacita({ role: 'dev', currentUserId: 'u-petra' });

    const input = screen.getByLabelText('Alokace W5 — Jan Novák');
    expect(input).toHaveAttribute('readonly');
    expect(input).toHaveAttribute('title', 'Dev může editovat pouze vlastní alokaci');

    fireEvent.change(input, { target: { value: '10' } });

    expect(input).toHaveValue(100);
    expect(commandsOf('update_alloc').filter((c) => c.personId === JAN.id)).toHaveLength(0);
    // Poznámka: server chybu „Nedostatečná oprávnění…" vrací, jen když command
    // vůbec dorazí — klient ho v tomto stavu nikdy neodešle, takže samotné
    // serverové odmítnutí (ADR-006 `authorizeCommand`) z frontendu neověříme;
    // pokrývá ho `AuthorizationTests.fs` na serveru.
  });
});

describe('KapacitaView — diff od jiného uživatele (regresní, ADR-004 doplněk)', () => {
  it('alloc_updated přijatý přes applyDiff se promítne do zobrazené buňky', () => {
    const { remoteDiff } = renderKapacita();

    remoteDiff({ op: 'alloc_updated', personId: JAN.id, weekIdx: 2, pct: 40 });

    expect(screen.getByLabelText('Alokace W3 — Jan Novák')).toHaveValue(40);
  });
});

// ── Celkový MD na osobu (derived state, ADR-005) ────────────────────────────

describe('KapacitaView — celkový MD na osobu', () => {
  // @scenario: kapacita.feature > Zobrazení celkového MD na osobu
  it('26 týdnů × 100 % × 5 dní = 130 MD, po snížení W1 na 50 % je to 127,5 MD', () => {
    renderKapacitaClean([JAN], 500);

    expect(within(personRow(JAN.name)).getByText('130')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Alokace W1 — Jan Novák'), {
      target: { value: '50' },
    });

    expect(within(personRow(JAN.name)).getByText('127.5')).toBeInTheDocument();
  });
});

// ── Správa rolí ──────────────────────────────────────────────────────────────

describe('KapacitaView — správa rolí (PM)', () => {
  // @scenario: kapacita.feature > Správa rolí — přidání nové role (PM)
  it('přidá roli QA a nabídne ji v selectu osoby', () => {
    const { lastCommand } = renderKapacita();

    fireEvent.click(screen.getByText('Správa rolí'));
    fireEvent.change(screen.getByPlaceholderText('Zkr.'), { target: { value: 'qa' } });
    fireEvent.change(screen.getByPlaceholderText('Název role…'), {
      target: { value: 'Quality Assurance' },
    });
    fireEvent.click(screen.getByRole('button', { name: '+ Přidat' }));

    expect(lastCommand('set_roles')?.roles.QA).toEqual({ label: 'Quality Assurance' });
    expect(
      within(personRow(JAN.name)).getByRole('option', { name: 'Quality Assurance' })
    ).toBeInTheDocument();
  });

  // @scenario: kapacita.feature > Správa rolí — smazání role s existujícími osobami
  it('varuje před smazáním obsazené role a po potvrzení ji odebere', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { commandsOf, lastCommand } = renderKapacita();

    fireEvent.click(screen.getByText('Správa rolí'));
    const panel = screen.getByText('Správa rolí').closest('button')?.parentElement;
    expect(panel).not.toBeNull();
    const roleRow = within(panel as HTMLElement)
      .getByDisplayValue('Back-end Developer')
      .closest('div');
    expect(roleRow).not.toBeNull();
    fireEvent.click(within(roleRow as HTMLElement).getByRole('button', { name: '✕' }));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Role BE je přiřazena 1 osobě. Odebráním role se zachová osoba, ale její role bude prázdná.'
    );
    expect(lastCommand('set_roles')?.roles.BE).toBeUndefined();
    const petraUpdate = commandsOf('update_person').find((c) => c.personId === PETRA.id);
    expect(petraUpdate?.fields).toEqual({ role: '' });
    expect(screen.getByLabelText('Role — Petra Kolářová')).toHaveValue('');
  });
});

// ── Sumář kapacity a rozpočet ────────────────────────────────────────────────

describe('KapacitaView — sumář kapacity dle rolí a rozpočet', () => {
  // @scenario: kapacita.feature > Sumář kapacity dle rolí
  it('sečte MD po rolích a zobrazí osoby v každé roli', () => {
    renderKapacitaClean([JAN, PETRA], 250);

    const summary = screen.getByText('KAPACITA DLE ROLÍ').closest('div')?.parentElement;
    expect(summary).not.toBeNull();
    const arGroup = within(summary as HTMLElement)
      .getByText('Solution Architect')
      .closest('div');
    const beGroup = within(summary as HTMLElement)
      .getByText('Back-end Developer')
      .closest('div');
    expect(arGroup).not.toBeNull();
    expect(beGroup).not.toBeNull();
    expect(within(arGroup as HTMLElement).getByText(/130/)).toBeInTheDocument();
    expect(within(arGroup as HTMLElement).getByText('Jan Novák')).toBeInTheDocument();
    expect(within(beGroup as HTMLElement).getByText(/130/)).toBeInTheDocument();
    expect(within(beGroup as HTMLElement).getByText('Petra Kolářová')).toBeInTheDocument();
  });

  // @scenario: kapacita.feature > Zobrazení rozpočtu, naplánované práce a kapacity
  it('záhlaví zobrazí rozpočet, naplánovanou práci i kapacitu', () => {
    renderKapacitaClean([JAN, PETRA], 250, [taskOf('t1', JAN.id, 200), taskOf('t2', PETRA.id, 62)]);

    expect(
      screen.getByText('Rozpočet: 250 MD | Naplánováno: 262 MD | Kapacita: 260 MD')
    ).toBeInTheDocument();
  });

  // @scenario: kapacita.feature > Naplánovaná práce zahrnuje i backlog
  it('naplánovaná práce počítá i nepřiřazené úkoly', () => {
    renderKapacitaClean([JAN, PETRA], 250, [
      taskOf('t1', JAN.id, 200),
      // Backlog — bez osoby. Práce to je pořád, jen se neví kdo ji udělá.
      taskOf('t2', '', 30),
    ]);

    expect(screen.getByText(/Naplánováno: 230 MD/)).toBeInTheDocument();
  });

  // @scenario: kapacita.feature > Kapacita nad rozpočtem sama o sobě není chyba
  it('barvu řídí naplánovaná práce, ne kapacita', () => {
    // Kapacita 260 MD > rozpočet 250 MD, ale naplánováno je jen 240 MD —
    // dokud barvu řídila kapacita, svítilo tohle varovně bez důvodu.
    renderKapacitaClean([JAN, PETRA], 250, [taskOf('t1', JAN.id, 240)]);

    const summary = screen.getByText(/Naplánováno: 240 MD/);
    expect(summary).toHaveStyle({ color: '#34d399' });
  });

  it('přesah naplánované práce nad rozpočet je červený', () => {
    renderKapacitaClean([JAN, PETRA], 250, [taskOf('t1', JAN.id, 262)]);

    expect(screen.getByText(/Naplánováno: 262 MD/)).toHaveStyle({ color: '#f87171' });
  });
});

describe('KapacitaView — přetížení a svátky', () => {
  // @scenario: kapacita.feature > Kapacita počítá se státními svátky
  it('celkové MD vychází z pracovních dní, ne z paušálních pěti', () => {
    // 5.1.–3.7.2026 = 26 týdnů, v nich 4 svátky ve všední den
    // (Velký pátek 3.4., Velikonoční pondělí 6.4., 1.5., 8.5.).
    const realWeeks = computeWeeks(START_DATE, END_DATE);
    expect(realWeeks).toHaveLength(26);

    const [full] = injectWeeks([{ ...JAN, weekAlloc: Array(26).fill(100) }], realWeeks);
    expect(personTotalMD(full)).toBe(126);

    const [halved] = injectWeeks([{ ...JAN, weekAlloc: [50, ...Array(25).fill(100)] }], realWeeks);
    expect(personTotalMD(halved)).toBe(123.5);
  });

  // @scenario: kapacita.feature > Přehled přetížení nad tabulkou
  it('shrnutí hlásí počet přetížených týdnů', () => {
    // Petra má ve W1 kapacitu 5 MD a úkol za 8 MD (`s`/`e` 1-based, ADR-014).
    renderKapacitaClean([PETRA], 100, [
      {
        id: 't-over',
        p: PETRA.id,
        name: 'Přetěžující úkol',
        cat: 'obecne',
        s: 1,
        e: 1,
        md: 8,
        progress: 0,
        desc: '',
        links: [],
      },
    ]);

    expect(screen.getByText(/Přetížení: 1 týden/)).toBeInTheDocument();
  });

  it('bez přetížení se shrnutí nezobrazuje', () => {
    renderKapacitaClean([JAN, PETRA], 250);
    expect(screen.queryByText(/Přetížení:/)).not.toBeInTheDocument();
  });
});
