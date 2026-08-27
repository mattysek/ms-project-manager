// Testy AdoSyncView — ADO Sync po ADR-008: view nesmí sáhnout na ADO ani na
// PAT, všechno jde přes commandy a zpět jako diffy.
//
// View se testuje **spolu s `useAdoSync`** (harness níž), ne s podvrženým
// objektem: chování jako „potvrzená změna zmizí ze seznamu" vzniká právě ze
// souhry view a hooku a s ručně poskládaným stavem by se neotestovalo.
// `dispatch` je mock (odchozí strana), diffy se posílají ručně (příchozí).
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { AdoSyncView } from './AdoSyncView';
import { useAdoSync } from '../../hooks/useAdoSync';
import type { UseAdoSyncResult } from '../../hooks/useAdoSync';
import type {
  ADOConfig,
  ADODecisions,
  ADOSyncLogEntry,
  ADOWorkItemView,
  Categories,
  Person,
  Task,
  WIChange,
} from '../../types';
import type { MemberRole, ProjectCommand, ProjectDiff } from '../../types/protocol';

// ── Data podle Background ve feature souboru ────────────────────────────────

const CATS: Categories = { dev: { bg: '#111', bd: '#222', tx: '#eee', label: 'Vývoj' } };

const PEOPLE: Person[] = [
  { id: 'p1', userId: null, name: 'Jan Novák', role: 'ar', color: '#f00', weekAlloc: [] },
  { id: 'p2', userId: null, name: 'Petra Kolářová', role: 'be', color: '#0f0', weekAlloc: [] },
];

const TASKS: Task[] = [
  {
    id: 't1',
    p: 'p2',
    name: 'API refaktoring',
    cat: 'dev',
    s: 0,
    e: 3,
    md: 15,
    progress: 0,
    desc: 'Planner popis',
    links: [
      { id: 'l1', label: 'WI #1234', url: 'https://dev.azure.com/firma/NPEZ/_workitems/edit/1234' },
    ],
  },
  {
    id: 't2',
    p: 'p1',
    name: 'Databázová migrace',
    cat: 'dev',
    s: 4,
    e: 7,
    md: 10,
    progress: 0,
    desc: '',
    links: [],
  },
];

const CONFIG: ADOConfig = {
  orgUrl: 'https://dev.azure.com/firma',
  project: 'NPEZ',
  areaPath: 'NPEZ\\Backend',
  trackedWiTypes: ['Bug', 'Product Backlog Item'],
  defaultPushWiType: 'Product Backlog Item',
  defaultIteration: 'NPEZ\\Sprint 42',
  mdToHoursCoefficient: 8,
  includePATInExport: false,
  memberMapping: [{ plannerId: 'p1', adoIdentity: 'jan.novak@firma.cz', adoDisplayName: null }],
};

const NO_DECISIONS: ADODecisions = {
  ignoredGapIds: [],
  acknowledgedChanges: [],
  ignoredUnlinkedTaskIds: [],
};

function makeWi(overrides: Partial<ADOWorkItemView> = {}): ADOWorkItemView {
  return {
    id: 1234,
    title: 'Refaktoring API autentizace',
    state: 'In Progress',
    workItemType: 'Product Backlog Item',
    assignedTo: 'Jan Novák',
    assignedToEmail: 'jan.novak@firma.cz',
    areaPath: 'NPEZ\\Backend',
    iterationPath: 'NPEZ\\Sprint 42',
    descriptionMd: 'ADO popis',
    ...overrides,
  };
}

function makeChange(overrides: Partial<WIChange> = {}): WIChange {
  return {
    type: 'state_regression',
    severity: 'high',
    direction: 'ado_to_planner',
    wiId: 1234,
    wiTitle: 'Refaktoring API autentizace',
    taskId: 't1',
    taskName: 'API refaktoring',
    details: 'Stav WI regredoval zpět na In Progress',
    oldValue: 'In Review',
    newValue: 'In Progress',
    ...overrides,
  };
}

function syncCompleted(
  changes: WIChange[],
  gaps: ADOWorkItemView[] = [],
  workItems: ADOWorkItemView[] = []
): ProjectDiff {
  return {
    op: 'ado_sync_completed',
    changes,
    gaps,
    log: [],
    context: { workItems, lastSync: '2026-08-11T14:35:00.000Z', decisions: NO_DECISIONS },
  };
}

// ── Harness ─────────────────────────────────────────────────────────────────

interface SetupOptions {
  role?: MemberRole;
  config?: ADOConfig | null;
  tasks?: Task[];
  log?: ADOSyncLogEntry[];
  isOffline?: boolean;
}

function setup(options: SetupOptions = {}) {
  const dispatch = vi.fn<(command: ProjectCommand) => void>();
  let ado!: UseAdoSyncResult;

  function Harness() {
    ado = useAdoSync(dispatch);
    return (
      <AdoSyncView
        ado={ado}
        adoConfig={options.config === undefined ? CONFIG : options.config}
        adoSyncLog={options.log ?? []}
        tasks={options.tasks ?? TASKS}
        people={PEOPLE}
        cats={CATS}
        numWeeks={26}
        role={options.role ?? 'pm'}
        isOffline={options.isOffline ?? false}
      />
    );
  }

  render(<Harness />);

  const send = (diff: ProjectDiff) => act(() => ado.handleDiff(diff));
  const commandsOf = (type: ProjectCommand['type']) =>
    dispatch.mock.calls.map(([command]) => command).filter((command) => command.type === type);
  const lastCommand = (type: ProjectCommand['type']) => {
    const sent = commandsOf(type);
    return sent[sent.length - 1];
  };
  const withPat = () =>
    send({ op: 'ado_pat_saved', patSet: true, patUpdatedAt: '2026-08-11T14:30:00.000Z' });

  return { dispatch, send, commandsOf, lastCommand, withPat };
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
/** Panel nastavení je s uloženou konfigurací sbalený — testy si ho rozkliknou. */
const openConfig = () => fireEvent.click(screen.getByText('Nastavení připojení'));

// ── Konfigurace, PAT, ověření připojení ─────────────────────────────────────

describe('AdoSyncView — konfigurace a PAT (FR-ADO-01 až 03)', () => {
  // @scenario: ado-sync.feature > Uložení ADO konfigurace (PM only)
  it('uloží konfiguraci commandem ado_save_config a potvrdí to hláškou', () => {
    const { lastCommand } = setup({ config: null });

    type('ORGANIZATION URL', 'https://dev.azure.com/firma');
    type('PROJECT NAME', 'NPEZ');
    type('AREA PATH (pro Coverage gap)', 'NPEZ\\Backend');
    type('SLEDOVANÉ TYPY WI (čárkou oddělené)', 'Bug, Product Backlog Item');
    type('TYP WI PRO PUSH', 'Product Backlog Item');
    type('ITERACE (pro Sync i Push)', 'NPEZ\\Sprint 42');
    type('1 MD = N HODIN', '8');
    click('Uložit nastavení');

    expect(lastCommand('ado_save_config')).toEqual({
      type: 'ado_save_config',
      config: {
        ...CONFIG,
        memberMapping: [],
      },
    });
    expect(screen.getByText('Konfigurace uložena')).toBeInTheDocument();
  });

  // @scenario: ado-sync.feature > Mapování členů týmu na ADO identity
  it('nabídne osoby projektu a uloží jejich ADO identity do konfigurace', () => {
    const { lastCommand } = setup({ config: { ...CONFIG, memberMapping: [] } });

    openConfig();
    expect(screen.getByLabelText('ADO identita — Jan Novák')).toBeInTheDocument();
    expect(screen.getByLabelText('ADO identita — Petra Kolářová')).toBeInTheDocument();

    type('ADO identita — Petra Kolářová', 'petra.kolarova@firma.cz');
    click('Uložit nastavení');

    const command = lastCommand('ado_save_config');
    expect(command).toMatchObject({
      config: {
        memberMapping: [
          { plannerId: 'p2', adoIdentity: 'petra.kolarova@firma.cz', adoDisplayName: null },
        ],
      },
    });
  });

  // @scenario: ado-sync.feature > Zadání a uložení PAT (PM only)
  it('pošle PAT commandem, sám si ho nenechá a zobrazí čas poslední aktualizace', () => {
    const { lastCommand, send } = setup();

    openConfig();
    type(/PERSONAL ACCESS TOKEN/, 'tajny-token');
    click('Uložit PAT');
    send({ op: 'ado_pat_saved', patSet: true, patUpdatedAt: '2026-08-11T14:30:00.000Z' });

    expect(lastCommand('ado_save_pat')).toEqual({ type: 'ado_save_pat', pat: 'tajny-token' });
    expect(screen.getByText(/PAT uložen — poslední aktualizace:/)).toBeInTheDocument();
    // Hodnota tokenu se zpět nezobrazuje — ani v poli, ze kterého se odeslal.
    expect(screen.getByLabelText(/PERSONAL ACCESS TOKEN/)).toHaveValue('');
    expect(document.body.innerHTML).not.toContain('tajny-token');
  });

  // @scenario: ado-sync.feature > Smazání PAT
  it('smaže PAT po potvrzení dialogu a hlásí, že PAT není nastaven', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { lastCommand, send, withPat } = setup();

    withPat();
    openConfig();
    click('Smazat PAT');
    send({ op: 'ado_pat_saved', patSet: false });

    expect(lastCommand('ado_delete_pat')).toEqual({ type: 'ado_delete_pat' });
    expect(screen.getByText('PAT není nastaven')).toBeInTheDocument();
  });
});

describe('AdoSyncView — ověření připojení (FR-ADO-03)', () => {
  // @scenario: ado-sync.feature > Ověření připojení k ADO
  it('ověří připojení commandem a výsledek zobrazí inline', () => {
    const { lastCommand, send } = setup();

    openConfig();
    click('Ověřit připojení');
    send({
      op: 'ado_connection_tested',
      ok: true,
      message: 'Připojení úspěšné — připojeno jako Jan Novák (jan.novak@firma.cz)',
    });

    expect(lastCommand('ado_test_connection')).toEqual({ type: 'ado_test_connection' });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Připojení úspěšné — připojeno jako Jan Novák (jan.novak@firma.cz)'
    );
  });

  // @scenario: ado-sync.feature > Ověření připojení selže (špatný PAT)
  it('zobrazí chybu ověření tak, jak ji popsal server', () => {
    const { send } = setup();

    openConfig();
    click('Ověřit připojení');
    send({
      op: 'ado_connection_tested',
      ok: false,
      message: 'Ověření selhalo: Neplatný nebo expirovaný Personal Access Token',
    });

    expect(screen.getByRole('status')).toHaveTextContent(
      'Ověření selhalo: Neplatný nebo expirovaný Personal Access Token'
    );
  });
});

// ── Role (PRD-03, FR-ROLE-04) ───────────────────────────────────────────────

describe('AdoSyncView — role', () => {
  // Totéž chování popisují dva feature soubory — z pohledu ADO integrace
  // i z pohledu matice oprávnění.
  // @scenario: ado-sync.feature > Dev uživatel nevidí ADO konfiguraci
  // @scenario: role-permissions.feature > Dev nevidí ADO Sync konfiguraci
  it('Dev nevidí sekci konfigurace ani pole pro PAT a nemůže spustit sync', () => {
    setup({ role: 'dev' });

    expect(screen.queryByText('Nastavení připojení')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/PERSONAL ACCESS TOKEN/)).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('PAT');
    expect(screen.getByRole('button', { name: /Synchronizovat/ })).toBeDisabled();
  });
});

// ── Synchronizace (FR-ADO-04) ───────────────────────────────────────────────

describe('AdoSyncView — spuštění synchronizace', () => {
  // @scenario: ado-sync.feature > Spuštění synchronizace
  it('spustí sync commandem, ukazuje průběh a po dokončení timestamp', () => {
    const { lastCommand, send, withPat } = setup();

    withPat();
    click(/Synchronizovat/);
    expect(lastCommand('ado_run_sync')).toEqual({ type: 'ado_run_sync' });

    send({ op: 'ado_sync_progress', phase: 'Stahuji work items', completed: 0, total: 1 });
    expect(screen.getByRole('status')).toHaveTextContent('Stahuji work items… (0/1)');

    send({ op: 'ado_sync_progress', phase: 'Porovnávám změny', completed: 0, total: 0 });
    expect(screen.getByRole('status')).toHaveTextContent('Porovnávám změny…');

    send(syncCompleted([], [], [makeWi()]));
    expect(screen.getByText('Hotovo — 1 WI zkontrolováno')).toBeInTheDocument();
    expect(screen.getByText(/Poslední synchronizace:/)).toBeInTheDocument();
  });

  it('bez uloženého PATu sync spustit nejde', () => {
    setup();

    expect(screen.getByRole('button', { name: /Synchronizovat/ })).toBeDisabled();
  });

  // @scenario: offline.feature > ADO Sync je zakázán při offline
  it('offline je sync zakázaný a tlačítko má tooltip s vysvětlením (FR-OFFLINE-07)', () => {
    const { withPat } = setup({ isOffline: true });

    withPat();
    const button = screen.getByRole('button', { name: /Synchronizovat/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Synchronizace s ADO vyžaduje připojení k internetu');
  });
});

// ── Změny (FR-ADO-05 až 07) ─────────────────────────────────────────────────

describe('AdoSyncView — změny na navázaných WI', () => {
  // @scenario: ado-sync.feature > Detekce regrese stavu WI (ADO → Planner)
  it('vykreslí regresi stavu i s nabídkou akcí', () => {
    const { send } = setup();

    send(syncCompleted([makeChange()], [], [makeWi()]));

    expect(
      screen.getByText(/API refaktoring → WI #1234 Refaktoring API autentizace/)
    ).toBeInTheDocument();
    expect(screen.getByText('Stav WI regredoval zpět na In Progress')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Přijmout — aktualizovat progress' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Potvrdit (Acknowledge)' })).toBeInTheDocument();
  });

  // @scenario: ado-sync.feature > Přijetí změny stavu z ADO
  it('„Přijmout" pošle ado_accept_from_ado se stavem — progress dopočítá server', () => {
    const { send, lastCommand } = setup();

    send(
      syncCompleted(
        [makeChange({ type: 'state_resolved', severity: 'info', newValue: 'Done' })],
        [],
        [makeWi()]
      )
    );
    click('Přijmout — aktualizovat progress');

    expect(lastCommand('ado_accept_from_ado')).toEqual({
      type: 'ado_accept_from_ado',
      wiId: 1234,
      taskId: 't1',
      field: 'state',
      text: undefined,
    });
  });

  // @scenario: ado-sync.feature > Acknowledge změny (viděno, bez akce)
  it('potvrzená změna zmizí ze seznamu a jde na server jako rozhodnutí', () => {
    const { send, lastCommand } = setup();

    send(syncCompleted([makeChange()], [], [makeWi()]));
    click('Potvrdit (Acknowledge)');

    expect(lastCommand('ado_acknowledge_change')).toEqual({
      type: 'ado_acknowledge_change',
      wiId: 1234,
      changeType: 'state_regression',
      acknowledged: true,
    });
    expect(screen.queryByText('Stav WI regredoval zpět na In Progress')).not.toBeInTheDocument();
  });
});

describe('AdoSyncView — změny směrem do ADO (FR-ADO-07)', () => {
  // @scenario: ado-sync.feature > Detekce rozdílu přiřazení (Planner → ADO)
  it('rozdíl přiřazení je označen jako Planner → ADO a nabízí obě strany', () => {
    const { send } = setup();

    send(
      syncCompleted(
        [
          makeChange({
            type: 'planner_assignment_differs',
            severity: 'medium',
            direction: 'planner_to_ado',
            details: 'Přiřazení se liší — plánovač: Petra Kolářová, ADO: jan.novak@firma.cz',
          }),
        ],
        [],
        [makeWi()]
      )
    );

    expect(screen.getByText('Planner → ADO')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Synchronizovat do ADO →' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '← Přijmout z ADO' })).toBeInTheDocument();
  });

  // @scenario: ado-sync.feature > Push přiřazení do ADO
  it('„Synchronizovat do ADO" pošle ado_push_assignee', () => {
    const { send, lastCommand } = setup();

    send(
      syncCompleted(
        [
          makeChange({
            type: 'planner_assignment_differs',
            severity: 'medium',
            direction: 'planner_to_ado',
          }),
        ],
        [],
        [makeWi()]
      )
    );
    click('Synchronizovat do ADO →');

    expect(lastCommand('ado_push_assignee')).toEqual({
      type: 'ado_push_assignee',
      wiId: 1234,
      taskId: 't1',
    });
  });

  it('uzavření WI z plánovače pošle ado_push_state s cílovým stavem podle typu WI', () => {
    const { send, lastCommand } = setup();

    send(
      syncCompleted(
        [
          makeChange({
            type: 'planner_completed_not_ado',
            severity: 'medium',
            direction: 'planner_to_ado',
          }),
        ],
        [],
        [makeWi()]
      )
    );
    expect(screen.getByLabelText('Cílový stav v ADO — WI #1234')).toHaveValue('Done');
    click('Uzavřít v ADO →');

    expect(lastCommand('ado_push_state')).toEqual({
      type: 'ado_push_state',
      wiId: 1234,
      taskId: 't1',
      state: 'Done',
    });
  });
});

// ── Popis (FR-ADO-06, 07) ───────────────────────────────────────────────────

describe('AdoSyncView — synchronizace popisu', () => {
  const descChange = makeChange({
    type: 'description_change',
    severity: 'sync',
    details: 'Popis se liší',
  });

  // @scenario: ado-sync.feature > Synchronizace popisu (Description diff)
  it('u změny popisu otevře diff obou verzí a nabídne všechny tři směry', () => {
    const { send } = setup();

    send(syncCompleted([descChange], [], [makeWi()]));
    click('Zobrazit diff');

    expect(screen.getByText('Planner popis')).toBeInTheDocument();
    expect(screen.getByText('ADO popis')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '← Přijmout z ADO' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '→ Synchronizovat do ADO' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '↔ Uložit merge (obousměrně)' })).toBeInTheDocument();
  });

  // @scenario: ado-sync.feature > Merge popisu obousměrně
  it('merge editor nabídne oba texty, jde upravit a uloží se do plánovače i ADO', () => {
    const { send, lastCommand } = setup();

    send(syncCompleted([descChange], [], [makeWi()]));
    click('Zobrazit diff');

    const editor = screen.getByLabelText('Výsledek merge');
    expect(editor).toHaveValue('Planner popis\nADO popis');

    fireEvent.change(editor, { target: { value: 'Sloučený popis' } });
    click('↔ Uložit merge (obousměrně)');

    expect(lastCommand('ado_push_description')).toEqual({
      type: 'ado_push_description',
      wiId: 1234,
      taskId: 't1',
      text: 'Sloučený popis',
      alsoPlanner: true,
    });
  });

  it('převzetí popisu z ADO jde jako ado_accept_from_ado s textem z editoru', () => {
    const { send, lastCommand } = setup();

    send(syncCompleted([descChange], [], [makeWi()]));
    click('Zobrazit diff');
    click('← Přijmout z ADO');

    expect(lastCommand('ado_accept_from_ado')).toMatchObject({
      wiId: 1234,
      taskId: 't1',
      field: 'description',
    });
  });
});

// ── Coverage gap (FR-ADO-09) ────────────────────────────────────────────────

describe('AdoSyncView — coverage gap', () => {
  const gap = makeWi({
    id: 1400,
    title: 'Frontend integrace',
    state: 'New',
    assignedTo: null,
    assignedToEmail: null,
    remainingWork: 40,
    descriptionMd: '',
  });

  // @scenario: ado-sync.feature > Coverage gap — WI v ADO bez linku v plánovači
  it('zobrazí WI bez pokrytí v plánu i s dostupnými akcemi', () => {
    // Jen úkol s ADO linkem — sekce „Úkoly bez ADO linku" tak nemá vlastní
    // tlačítko „Ignorovat" a dotaz níž zůstane jednoznačný.
    const { send } = setup({ tasks: [TASKS[0]] });

    send(syncCompleted([], [gap]));

    expect(screen.getByText(/#1400 Frontend integrace/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Přidat do plánu' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ignorovat' })).toBeInTheDocument();
  });

  // @scenario: ado-sync.feature > Přidání WI z coverage gap do plánu
  it('založí úkol z WI s odkazem do ADO a work item ze sekce zmizí', () => {
    const { send, lastCommand } = setup();

    send(syncCompleted([], [gap]));
    click('Přidat do plánu');

    expect(screen.getByLabelText('Název')).toHaveValue('Frontend integrace');
    expect(screen.getByLabelText('MD')).toHaveValue('5'); // 40 h / 8 h na MD
    type('Týden do', '2');
    click('Přidat úkol');

    expect(lastCommand('ado_add_gap_to_plan')).toMatchObject({
      type: 'ado_add_gap_to_plan',
      wiId: 1400,
      task: {
        name: 'Frontend integrace',
        s: 0,
        e: 1,
        md: 5,
        progress: 0,
        links: [
          { label: 'WI #1400', url: 'https://dev.azure.com/firma/NPEZ/_workitems/edit/1400' },
        ],
      },
    });
    expect(screen.queryByText(/#1400 Frontend integrace/)).not.toBeInTheDocument();
  });
});

// ── Úkoly bez ADO linku (FR-ADO-08) ─────────────────────────────────────────

describe('AdoSyncView — push úkolu do ADO', () => {
  // @scenario: ado-sync.feature > Push úkolu bez ADO linku do ADO
  it('předvyplní formulář z úkolu a konfigurace a založení pošle jako command', () => {
    const { lastCommand } = setup();

    expect(screen.getByText('Databázová migrace')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Přidat do ADO' })[0]);

    expect(screen.getByLabelText('Typ WI')).toHaveValue('Product Backlog Item');
    expect(screen.getByLabelText('Název')).toHaveValue('Databázová migrace');
    expect(screen.getByLabelText('Area Path')).toHaveValue('NPEZ\\Backend');
    expect(screen.getByLabelText('Iterace')).toHaveValue('NPEZ\\Sprint 42');
    expect(screen.getByLabelText('Přiřadit')).toHaveValue('jan.novak@firma.cz');
    expect(screen.getByLabelText('Remaining Work (h)')).toHaveValue('80'); // 10 MD × 8 h

    click('Vytvořit WI');

    expect(lastCommand('ado_create_work_item')).toEqual({
      type: 'ado_create_work_item',
      taskId: 't2',
      draft: {
        wiType: 'Product Backlog Item',
        title: 'Databázová migrace',
        descriptionMd: '',
        areaPath: 'NPEZ\\Backend',
        iterationPath: 'NPEZ\\Sprint 42',
        assignedTo: 'jan.novak@firma.cz',
        remainingWork: 80,
      },
    });
  });

  it('úkol s ADO linkem se v sekci nenabízí', () => {
    setup();

    expect(screen.queryByText('API refaktoring')).not.toBeInTheDocument();
  });
});

// ── Sync log (FR-ADO-10) ────────────────────────────────────────────────────

describe('AdoSyncView — sync log', () => {
  const log: ADOSyncLogEntry[] = [
    {
      id: 'e2',
      timestamp: '2026-08-11T14:40:00.000Z',
      action: 'PUSHED_TO_ADO',
      taskId: 't1',
      taskName: 'API refaktoring',
      wiId: 1234,
      wiTitle: 'Refaktoring API autentizace',
      details: 'Přiřazení posláno do ADO: petra.kolarova@firma.cz',
    },
    {
      id: 'e1',
      timestamp: '2026-08-11T14:36:00.000Z',
      action: 'ACKNOWLEDGED',
      wiId: 1234,
      wiTitle: 'Refaktoring API autentizace',
      details: 'Změna vzata na vědomí',
    },
  ];

  // @scenario: ado-sync.feature > Sync log zobrazuje historii akcí
  // @scenario: role-permissions.feature > Dev vidí ADO Sync log
  it('zobrazí záznamy sestupně a Dev je vidí taky (read-only)', () => {
    setup({ role: 'dev', log });

    fireEvent.click(screen.getByText('Sync log'));

    const actions = screen.getAllByText(/^(PUSHED_TO_ADO|ACKNOWLEDGED)$/);
    expect(actions.map((node) => node.textContent)).toEqual(['PUSHED_TO_ADO', 'ACKNOWLEDGED']);

    const newest = actions[0].parentElement;
    expect(newest).toHaveTextContent('WI #1234');
    expect(newest).toHaveTextContent('Přiřazení posláno do ADO: petra.kolarova@firma.cz');
    expect(newest?.textContent).toContain('2026');
  });

  // @scenario: ado-sync.feature > Export sync logu do CSV (PM only)
  it('PM stáhne sync log jako CSV', () => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock');
    URL.revokeObjectURL = vi.fn();
    let filename: string | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      filename = this.download;
    });

    setup({ role: 'pm', log });
    fireEvent.click(screen.getByText('Sync log'));
    click('↓ Export CSV');

    expect(filename).toMatch(/^ado-sync-log_\d{4}-\d{2}-\d{2}\.csv$/);
  });

  // @scenario: ado-sync.feature > Dev nevidí export sync logu
  it('Dev má tlačítko exportu neaktivní (log samotný vidí, PRD-06 FR-ADO-10)', () => {
    setup({ role: 'dev', log });
    fireEvent.click(screen.getByText('Sync log'));

    expect(screen.getByRole('button', { name: '↓ Export CSV' })).toBeDisabled();
  });
});
