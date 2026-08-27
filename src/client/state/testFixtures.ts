// Sdílené testovací fixtures pro applyDiff.test.ts a invertCommand.test.ts.
// Není to *.test.ts soubor, takže ho Vitest sám o sobě nespouští jako sadu testů.
import type { AppState } from './appState';
import type {
  Task,
  Person,
  Risk,
  Opportunity,
  KBPage,
  TodoItem,
  RecurringReminder,
  FileRef,
} from '../types';
import { INIT_CATS, INIT_ROLES, INIT_PROJECT } from '../constants';

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    p: 'p1',
    name: 'Testovací úkol',
    cat: 'obecne',
    // 1-based čísla týdnů (ADR-014), ne indexy pole.
    s: 1,
    e: 4,
    md: 5,
    progress: 0,
    desc: '',
    links: [],
    ...overrides,
  };
}

export function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'p1',
    userId: null,
    name: 'Jan Novák',
    role: 'BE',
    color: '#4f9cf9',
    weekAlloc: [100, 100, 50, 0],
    ...overrides,
  };
}

export function makeRisk(overrides: Partial<Risk> = {}): Risk {
  return {
    id: 'r1',
    sev: 'med',
    who: 'Jan Novák',
    title: 'Riziko zpoždění',
    detail: 'Detail rizika',
    ...overrides,
  };
}

export function makeOpportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: 'o1',
    title: 'Příležitost k rozšíření',
    detail: 'Detail příležitosti',
    ...overrides,
  };
}

export function makeKbPage(overrides: Partial<KBPage> = {}): KBPage {
  return {
    id: 'kb1',
    title: 'Stránka KB',
    content: 'Obsah',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeTodo(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id: 'td1',
    title: 'TODO položka',
    completed: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeReminder(overrides: Partial<RecurringReminder> = {}): RecurringReminder {
  return {
    id: 'rem1',
    title: 'Pravidelná připomínka',
    description: '',
    startDate: '2026-01-05',
    recurrence: 'weekly',
    enabled: true,
    ...overrides,
  };
}

export function makeFileRef(overrides: Partial<FileRef> = {}): FileRef {
  return {
    id: 'f1',
    name: 'specifikace.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    addedAt: '2026-01-01T00:00:00.000Z',
    addedBy: 'u-jan',
    note: '',
    ...overrides,
  };
}

export function makeAppState(overrides: Partial<AppState> = {}): AppState {
  return {
    project: { ...INIT_PROJECT, startDate: '2026-01-05', endDate: '2026-06-26' },
    people: [makePerson()],
    tasks: [makeTask()],
    cats: INIT_CATS,
    roles: INIT_ROLES,
    risks: [makeRisk()],
    opps: [makeOpportunity()],
    reminders: [makeReminder()],
    todos: [makeTodo()],
    kbPages: [makeKbPage()],
    files: [makeFileRef()],
    adoConfig: null,
    adoSyncLog: [],
    ...overrides,
  };
}
