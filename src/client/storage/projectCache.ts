// IndexedDB cache kompletního stavu projektu pro offline start.
//
// PRD-05, FR-OFFLINE-04: po úspěšném `full_state` (počáteční připojení i
// reconnect) se celý `AppState` uloží do `project_cache/{projectId}`.
// Při startu bez spojení (server nedostupný) klient z cache načte poslední
// známý stav namísto prázdné obrazovky. „Invalidace při reconnectu" (ADR-009)
// znamená prosté přepsání čerstvým stavem — proto tu není samostatná
// invalidační funkce, jen `saveProjectCache`, volaná znovu při každém
// úspěšném `full_state`.
import type { ProjectSummary } from '../api/projectsApi';
import type { AppState } from '../state/appState';

const DB_NAME = 'MSProjectManager_Cache';
// v2 přidalo `project_list`. Obě úložiště otevírá **jen tenhle modul**, takže
// tu nehrozí past, na kterou doplácí dvojice `offlineQueue`/`noteQueue`: ty
// sdílejí jednu databázi a musí držet stejné `DB_VERSION`, jinak si vzájemně
// přebijí `onupgradeneeded`.
const DB_VERSION = 2;
const STORE_NAME = 'project_cache';
const LIST_STORE = 'project_list';

/** Jediný klíč v `project_list` — seznam je vždy celý, ne po projektech. */
const LIST_KEY = 'mine';

export interface CachedProjectState {
  projectId: string;
  /**
   * Stav, jak ho uživatel vidí — **včetně** optimistických offline změn.
   * Slouží k seedu UI, aby po startu bez spojení viděl svou práci.
   */
  state: AppState;
  /**
   * Poslední stav **potvrzený serverem**, bez rozpracovaných změn.
   *
   * Existuje odděleně, protože `state` se nedá použít jako baseline pro
   * detekci konfliktů: obsahuje i vlastní offline úpravy, takže po restartu
   * aplikace v offline režimu by se každá z nich při reconnectu ohlásila jako
   * konflikt („server má X, vaše změna Y", kde X je jen neaplikovaný originál).
   * Chybí jen u cache zapsaných starší verzí aplikace.
   */
  confirmedState?: AppState;
  /** Kdy byl cache naposledy nahrazen čerstvým stavem ze serveru (ISO). */
  cachedAt: string;
}

let dbInstance: IDBDatabase | null = null;

async function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      // Obě úložiště se zakládají podmíněně, aby upgrade z v1 nezahodil
      // existující cache stavů.
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'projectId' });
      }
      if (!db.objectStoreNames.contains(LIST_STORE)) {
        db.createObjectStore(LIST_STORE);
      }
    };
  });
}

/** Uloží (přepíše) cache stavu projektu — voláno při každé změně stavu. */
export async function saveProjectCache(
  projectId: string,
  state: AppState,
  confirmedState?: AppState
): Promise<void> {
  const db = await openDB();

  const entry: CachedProjectState = {
    projectId,
    state,
    confirmedState,
    cachedAt: new Date().toISOString(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Načte cache stavu projektu — vrací `null`, pokud projekt ještě nebyl cachován. */
export async function getProjectCache(projectId: string): Promise<CachedProjectState | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(projectId);

    request.onsuccess = () => resolve((request.result as CachedProjectState | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

/** Smaže cache projektu — voláno při definitivním opuštění/smazání projektu. */
export async function clearProjectCache(projectId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(projectId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Seznam projektů pro LandingPage ─────────────────────────────────────────
//
// Seznam chodí z REST (`/api/projects`), takže bez serveru není odkud ho vzít
// a úvodní obrazovka zůstávala prázdná — s hláškou „Žádné uložené projekty",
// která navíc lhala. Cache drží poslední úspěšně načtený seznam, aby se dalo
// při výpadku aspoň dostat do projektu, který už uživatel otevřený měl.
//
// Ukládá se `ProjectSummary[]` tak, jak přišel ze serveru: je to čistě
// zobrazovací kopie a nic se z ní nikam nezapisuje.

/** Přepíše cache seznamu — voláno po každém úspěšném načtení ze serveru. */
export async function saveProjectListCache(projects: ProjectSummary[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LIST_STORE, 'readwrite');
    tx.objectStore(LIST_STORE).put(projects, LIST_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Poslední známý seznam; `null`, když se ještě nikdy nenačetl. */
export async function getProjectListCache(): Promise<ProjectSummary[] | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LIST_STORE, 'readonly');
    const request = tx.objectStore(LIST_STORE).get(LIST_KEY);

    request.onsuccess = () => resolve((request.result as ProjectSummary[] | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Projekty, ke kterým je uložený stav — tedy ty, které jdou otevřít i bez
 * serveru.
 *
 * Vrací rovnou souhrn ve tvaru `ProjectSummary`, protože úvodní obrazovka
 * s ním potřebuje pracovat stejně jako se seznamem ze serveru. Data se berou
 * z uloženého `AppState`, takže sedí na to, co uživatel naposledy viděl.
 *
 * Je to druhý, nezávislý zdroj vedle `getProjectListCache`: ten drží seznam
 * tak, jak přišel ze serveru, ale nemusí obsahovat projekt založený až po
 * posledním úspěšném načtení. Sjednocení obojího je to, co dělá úvodní
 * obrazovku offline použitelnou.
 */
export async function listCachedProjects(): Promise<ProjectSummary[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();

    request.onsuccess = () => {
      const rows = request.result as CachedProjectState[];
      resolve(rows.map(toSummary));
    };
    request.onerror = () => reject(request.error);
  });
}

/** Souhrn z uloženého stavu; chybějící údaje se dopočítat nedají, tak jsou nulové. */
function toSummary(row: CachedProjectState): ProjectSummary {
  const state = row.state;
  return {
    id: row.projectId,
    name: state.project?.name || 'Bez názvu',
    startDate: state.project?.startDate ?? '',
    endDate: state.project?.endDate ?? '',
    budget: state.project?.budget ?? 0,
    peopleCount: state.people?.length ?? 0,
    taskCount: state.tasks?.length ?? 0,
    createdAt: row.cachedAt,
    updatedAt: row.cachedAt,
  };
}
