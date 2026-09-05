// Sdílený harness pro KapacitaView.test.tsx — scénáře `docs/features/kapacita.feature`.
// Stejný vzor jako `ganttViewHarness.tsx`/`seznamViewHarness.tsx`: reálné
// command hooky (`useCommandDispatch` + `useAppCommands`) nad fake kanálem,
// který dělá tutéž optimistickou aplikaci jako produkční `useProjectChannel`,
// ale nad reaktivním `useState` — testy tak klikají na skutečně překreslené
// UI a commandy se ověřují jako spy (ne proti serveru).
//
// Navíc oproti ostatním harness souborům: `remoteDiff` — pošle `ProjectDiff`
// přes SKUTEČNÝ `applyDiff` (ne jen optimistickou mutaci commandu), aby šlo
// ověřit cestu „diff od jiného uživatele → applyDiff → překreslené UI" i na
// úrovni view, ne jen v `applyDiff.test.ts`. Kapacita si na tohle dala
// explicitně záležet kvůli historické mezeře v `alloc_updated` (viz
// `applyDiff.ts` hlavička).
//
// Není to `*.test.ts(x)` soubor, takže ho Vitest sám o sobě nespustí jako
// sadu testů (stejná konvence jako `state/testFixtures.ts`).
import { useCallback, useState } from 'react';
import { act, render } from '@testing-library/react';
import { KapacitaView } from './KapacitaView';
import { useCommandDispatch } from '../../hooks/useCommandDispatch';
import { useAppCommands } from '../../hooks/appCommands';
import { useProjectDerivedData } from '../../hooks/useProjectDerivedData';
import { applyDiff } from '../../state/applyDiff';
import { makeAppState } from '../../state/testFixtures';
import { injectWeeks } from '../../utils';
import { INIT_ROLES } from '../../constants';
import type { AppState } from '../../state/appState';
import type { Person, Roles, Task, Week } from '../../types';
import type { Member } from '../../api/membersApi';
import type { MemberRole, ProjectCommand, ProjectDiff } from '../../types/protocol';
import type {
  ChannelConnectionStatus,
  UseProjectChannelResult,
} from '../../hooks/useProjectChannel';

/** Stejný rozsah/důvod jako `ganttViewHarness.tsx` — `computeWeeks` pro „2026-01-05
 * až 2026-06-26" vrací 25 týdnů, background `kapacita.feature` chce 26. */
export const NUM_WEEKS = 26;
export const START_DATE = '2026-01-05';
export const END_DATE = '2026-07-03';

// `weekAlloc` musí být předvyplněné na plnou délku (jako po reálném `addPerson`
// nebo migraci) — `KapacitaView.updateAlloc` mapuje přes `person.weekAlloc`
// napřímo (ne přes odvozenou `_weeks` verzi), takže prázdné pole by žádnou
// buňku nikdy nezměnilo (mapování nad `[]` vrátí zase `[]`).
export const JAN: Person = {
  id: 'p1',
  name: 'Jan Novák',
  role: 'AR',
  color: '#4f9cf9',
  weekAlloc: Array(NUM_WEEKS).fill(100),
  userId: 'u-jan',
};
export const PETRA: Person = {
  id: 'p2',
  name: 'Petra Kolářová',
  role: 'BE',
  color: '#34d399',
  weekAlloc: Array(NUM_WEEKS).fill(100),
  userId: 'u-petra',
};

/** Stejná optimistická aplikace jako produkční `useProjectChannel`, ale nad reaktivním `useState`. */
function useFakeChannel(
  initial: AppState,
  onCommand: (c: ProjectCommand) => void
): UseProjectChannelResult {
  const [state, setState] = useState<AppState | null>(initial);
  const sendCommand = useCallback(
    (command: ProjectCommand, applyOptimistic?: (s: AppState) => AppState) => {
      onCommand(command);
      if (applyOptimistic) setState((prev) => (prev ? applyOptimistic(prev) : prev));
    },
    [onCommand]
  );
  const applyLocal = useCallback((mutate: (s: AppState) => AppState) => {
    setState((prev) => (prev ? mutate(prev) : prev));
  }, []);
  return {
    state,
    fullStateVersion: 0,
    presence: [],
    connectionStatus: 'connected' as ChannelConnectionStatus,
    lastError: null,
    sendCommand,
    // Harness nesíťuje: awaitable varianta jen splní slib a potvrzený stav
    // je vždy `null` — offline logika se testuje jinde.
    sendCommandAwaitable: async (
      command: ProjectCommand,
      applyOptimistic?: (s: AppState) => AppState
    ) => {
      sendCommand(command, applyOptimistic);
    },
    getLastConfirmedState: () => null,
    applyLocal,
    seedFromCache: () => {},
    requestFullState: () => {},
  };
}

export interface RenderKapacitaOptions {
  tasks?: Task[];
  people?: Person[];
  budget?: number;
  role?: MemberRole | null;
  currentUserId?: string | null;
  /** Členové projektu pro volbu účtu u osoby (FR-ROLE-07). */
  members?: Member[];
}

/** Členové odpovídající `JAN`/`PETRA` — nabídka ve volbě „Účet". */
export const MEMBERS: Member[] = [
  { userId: 'u-jan', displayName: 'Jan Novák', role: 'pm', joinedAt: '2026-01-05T08:00:00Z' },
  {
    userId: 'u-petra',
    displayName: 'Petra Kolářová',
    role: 'dev',
    joinedAt: '2026-01-05T08:00:00Z',
  },
  // Člen bez odpovídající osoby — na něj se dá spárovat nový řádek, aniž by
  // v testu vznikly dvě osoby se stejným jménem.
  {
    userId: 'u-tomas',
    displayName: 'Tomáš Vondráček',
    role: 'dev',
    joinedAt: '2026-01-05T08:00:00Z',
  },
];

export interface KapacitaHarness {
  /** Všechny commandy odeslané dosud (v pořadí odeslání) — protějšek serveru. */
  dispatched: ProjectCommand[];
  commandsOf: <T extends ProjectCommand['type']>(type: T) => Extract<ProjectCommand, { type: T }>[];
  lastCommand: <T extends ProjectCommand['type']>(
    type: T
  ) => Extract<ProjectCommand, { type: T }> | undefined;
  /** Simuluje diff přijatý od jiného uživatele (broadcast, ne odpověď na vlastní command). */
  remoteDiff: (diff: ProjectDiff) => void;
}

interface HarnessRefs {
  applyLocalRef: { current: (mutate: (s: AppState) => AppState) => void };
}

/** Vytažené tělo `Harness`, aby `renderKapacita` zůstal pod ADR-012 rozpočtem na délku funkce. */
function useHarnessWiring(initial: AppState, dispatched: ProjectCommand[], refs: HarnessRefs) {
  const onCommand = useCallback((c: ProjectCommand) => dispatched.push(c), [dispatched]);
  const channel = useFakeChannel(initial, onCommand);
  refs.applyLocalRef.current = channel.applyLocal;
  const { dispatch } = useCommandDispatch({
    projectId: 'proj-1',
    channel,
    connectionStatus: 'connected',
    isOffline: false,
  });
  const commands = useAppCommands({
    state: channel.state,
    dispatch,
    applyLocal: channel.applyLocal,
  });
  const state = channel.state ?? initial;
  const derived = useProjectDerivedData(state.project, state.tasks, state.people);
  return { state, commands, derived };
}

/** Vykreslí `KapacitaView` napojenou na reálné command hooky s fake serverem — viz hlavička souboru. */
export function renderKapacita(options: RenderKapacitaOptions = {}): KapacitaHarness {
  const dispatched: ProjectCommand[] = [];
  const refs: HarnessRefs = { applyLocalRef: { current: () => {} } };
  const initial = makeAppState({
    tasks: options.tasks ?? [],
    people: options.people ?? [JAN, PETRA],
    project: {
      ...makeAppState().project,
      endDate: END_DATE,
      budget: options.budget ?? makeAppState().project.budget,
    },
  });

  function Harness() {
    const { state, commands, derived } = useHarnessWiring(initial, dispatched, refs);
    return (
      <KapacitaView
        rawPeople={state.people}
        setRawPeople={commands.setRawPeople}
        people={derived.people}
        tasks={state.tasks}
        weeks={derived.weeks}
        monthGroups={derived.monthGroups}
        budget={state.project.budget}
        roles={state.roles}
        setRoles={commands.setRoles}
        role={options.role ?? 'pm'}
        currentUserId={options.currentUserId ?? 'u-jan'}
        members={options.members ?? MEMBERS}
      />
    );
  }

  render(<Harness />);

  return {
    dispatched,
    commandsOf: (type) =>
      dispatched.filter(
        (c): c is Extract<ProjectCommand, { type: typeof type }> => c.type === type
      ),
    lastCommand: (type) => {
      const sent = dispatched.filter(
        (c): c is Extract<ProjectCommand, { type: typeof type }> => c.type === type
      );
      return sent[sent.length - 1];
    },
    // `act` je nutný — na rozdíl od `fireEvent` (které ho zabalí samo) je
    // tohle přímé volání mimo React event handler, jinak by se re-render
    // stihl provést až po `expect` a test by viděl starou hodnotu.
    remoteDiff: (diff) => act(() => refs.applyLocalRef.current((s) => applyDiff(s, diff))),
  };
}

// ── „Čisté" týdny (bez svátků) — pro scénáře o přepočtu MD ─────────────────
//
// `computeWeeks` z reálného rozsahu dat zahrnuje české svátky, takže MD součty
// nevyjdou na kulaté číslo z Gherkinu („26 týdnů × 5 dní = 130 MD"). Tyhle
// scénáře ale testují klientský výpočet (`personTotalMD`/`weekMD`, ADR-005),
// ne konkrétní kalendář — proto jim dáme syntetických 26 týdnů po 5 dnech.

/** 26 týdnů, každý s 5 pracovními dny — žádné svátky, žádné zkrácení. */
export const CLEAN_WEEKS: Week[] = Array.from({ length: NUM_WEEKS }, (_, i) => ({
  w: i + 1,
  label: `W${i + 1}`,
  dl: null,
  mIdx: Math.floor(i / 4),
  workdays: 5,
  mondayISO: '2026-01-05',
  fridayISO: '2026-01-09',
}));

/**
 * Vykreslí `KapacitaView` nad `CLEAN_WEEKS` a lokálním `useState` (žádný
 * command kanál) — pro scénáře „Zobrazení celkového MD" a „Sumář kapacity",
 * které testují jen přepočet MD, ne odesílání commandů.
 */
export function renderKapacitaClean(peopleInit: Person[], budget: number, tasksInit: Task[] = []) {
  // Proměnná místo řetězcového literálu přímo v JSX — Biome jinak `role="pm"`
  // mylně vyhodnotí jako HTML ARIA atribut (`useValidAriaRole`), i když jde o
  // doménový prop `KapacitaView` (PM/Dev, ADR-006), ne o accessibility roli.
  const pmRole: MemberRole = 'pm';

  function Harness() {
    const [rawPeople, setRawPeople] = useState<Person[]>(peopleInit);
    const [roles, setRoles] = useState<Roles>(INIT_ROLES);
    const [tasks] = useState<Task[]>(tasksInit);
    return (
      <KapacitaView
        rawPeople={rawPeople}
        setRawPeople={setRawPeople}
        people={injectWeeks(rawPeople, CLEAN_WEEKS)}
        tasks={tasks}
        weeks={CLEAN_WEEKS}
        monthGroups={[]}
        budget={budget}
        roles={roles}
        setRoles={setRoles}
        role={pmRole}
        currentUserId="u-jan"
        members={MEMBERS}
      />
    );
  }
  render(<Harness />);
}
