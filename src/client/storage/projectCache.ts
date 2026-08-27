// IndexedDB cache kompletního stavu projektu pro offline start.
//
// PRD-05, FR-OFFLINE-04: po úspěšném `full_state` (počáteční připojení i
// reconnect) se celý `AppState` uloží do `project_cache/{projectId}`.
// Při startu bez spojení (server nedostupný) klient z cache načte poslední
// známý stav namísto prázdné obrazovky. „Invalidace při reconnectu" (ADR-009)
// znamená prosté přepsání čerstvým stavem — proto tu není samostatná
// invalidační funkce, jen `saveProjectCache`, volaná znovu při každém
// úspěšném `full_state`.
import type { AppState } from '../state/appState';

const DB_NAME = 'MSProjectManager_Cache';
const DB_VERSION = 1;
const STORE_NAME = 'project_cache';

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
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'projectId' });
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
