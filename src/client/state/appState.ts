// Sdílený typ kombinovaného stavu projektu.
//
// Vlastníkem hodnoty zůstává `App.tsx` (drží ho přes `useUndoRedo<AppState>`),
// typ je ale vytažený sem, aby ho mohly sdílet i čisté funkce v `src/state/`
// (`applyDiff`, `invertCommand`) a protokolové typy (`src/types/protocol.ts`)
// beze cyklické závislosti na `App.tsx`.
//
// `files` — viz ADR-004 doplněk, sekce „Tvar full_state": po ADR-010 jsou to
// jen `FileRef` metadata (bez binárních dat), takže na rozdíl od dřívějšího
// single-user stavu už není důvod je z undo/redo historie vylučovat kvůli
// velikosti payloadu. Plynou stejným kanálem jako zbytek stavu (`full_state`
// + `file_added`/`file_note_updated`/`file_deleted` diffy, `applyDiff.ts`).
import type {
  Project,
  Person,
  Task,
  Categories,
  Roles,
  Risk,
  Opportunity,
  RecurringReminder,
  TodoItem,
  KBPage,
  FileRef,
  ADOConfig,
  ADOSyncLogEntry,
} from '../types';

export interface AppState {
  project: Project;
  people: Person[];
  tasks: Task[];
  cats: Categories;
  roles: Roles;
  risks: Risk[];
  opps: Opportunity[];
  reminders: RecurringReminder[];
  todos: TodoItem[];
  kbPages: KBPage[];
  files: FileRef[];
  adoConfig: ADOConfig | null;
  adoSyncLog: ADOSyncLogEntry[];
}

/**
 * Stav připravený pro `full_state_import` — bez prázdné ADO konfigurace.
 *
 * `AdoConfig` je na serveru `option` a `FSharp.SystemTextJson` má zapnuté
 * `SkippableOptionFields`: „žádná hodnota" se na drátě vyjadřuje NEPŘÍTOMNOSTÍ
 * pole, `null` je pro něj neplatný vstup. Klient přitom `adoConfig: null` v
 * `AppState` běžně má, takže ho posílal — a celý command padal na vazbě
 * argumentů SignalR. Import byl tím pádem rozbitý pro každý projekt bez
 * nastaveného ADO, tedy prakticky pro všechny.
 *
 * Posílá se ze dvou míst (import do otevřeného projektu a odložený import
 * z LandingPage), proto to má jedno společné místo.
 */
export function forImportCommand(state: AppState): AppState {
  const { adoConfig, ...rest } = state;
  return (adoConfig ? { ...rest, adoConfig } : rest) as AppState;
}
