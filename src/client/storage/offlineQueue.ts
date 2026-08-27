// IndexedDB fronta čekajících commandů pro offline režim.
//
// PRD-05, FR-OFFLINE-03: každý command odeslaný při offline stavu se uloží
// do tabulky `pending_commands`, přežije reload stránky a je přehrán při
// reconnectu (ADR-009, „Reconnect Replay"). Samostatná databáze — stejný
// důvod jako u `adoStorage.ts`: jiná životnost a jiný přístupový vzor než
// hlavní `MSProjectManager` DB s projekty.
import { uid } from '../utils';
import type { ProjectCommand } from '../types/protocol';

const DB_NAME = 'MSProjectManager_Offline';
// v2 přidal store `pending_notes` (viz `noteQueue.ts`). Verze i `onupgradeneeded`
// musí být v obou modulech stejné — upgrade spustí ten, který databázi otevře
// první, a musí založit oba store.
const DB_VERSION = 2;
const STORE_NAME = 'pending_commands';
const NOTES_STORE_NAME = 'pending_notes';
const PROJECT_ID_INDEX = 'projectId';

/** FR-OFFLINE-03: ochrana proti nekontrolovanému růstu fronty (per projekt). */
export const MAX_PENDING_COMMANDS = 500;

/** FR-OFFLINE-08: čekající změny starší než tohle jsou při startu zahozeny. */
export const PENDING_COMMAND_EXPIRY_MS = 48 * 60 * 60 * 1000;

export interface PendingCommand {
  id: string;
  projectId: string;
  command: ProjectCommand;
  timestamp: string; // ISO
  locallyApplied: boolean;
}

/** Vyhozeno při pokusu o zápis nad `MAX_PENDING_COMMANDS` limit pro daný projekt. */
export class PendingQueueFullError extends Error {
  constructor() {
    super('Příliš mnoho čekajících změn — zvažte ruční export projektu');
    this.name = 'PendingQueueFullError';
  }
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
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex(PROJECT_ID_INDEX, PROJECT_ID_INDEX, { unique: false });
      }
      if (!db.objectStoreNames.contains(NOTES_STORE_NAME)) {
        db.createObjectStore(NOTES_STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

function byTimestampAsc(a: PendingCommand, b: PendingCommand): number {
  return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
}

// Více commandů odeslaných v rychlém sledu (např. offline dávka) může padnout
// do stejné milisekundy `Date.now()` — bez tiebreakeru by řazení podle
// timestampu bylo nedeterministické (IndexedDB negarantuje pořadí čtení podle
// vkládání). Monotónně rostoucí ms zajistí stabilní pořadí přehrání i v tomto
// případě, a výsledek zůstává platný ISO řetězec pro `purgeExpiredCommands`.
let lastTimestampMs = 0;

function nextTimestamp(): string {
  const now = Date.now();
  lastTimestampMs = now > lastTimestampMs ? now : lastTimestampMs + 1;
  return new Date(lastTimestampMs).toISOString();
}

/** Všechny čekající commandy pro projekt, seřazené od nejstaršího (pořadí přehrání). */
export async function getPendingCommands(projectId: string): Promise<PendingCommand[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).index(PROJECT_ID_INDEX).getAll(projectId);

    request.onsuccess = () => resolve((request.result as PendingCommand[]).sort(byTimestampAsc));
    request.onerror = () => reject(request.error);
  });
}

/**
 * Přidá command do fronty daného projektu. Vyhodí `PendingQueueFullError`,
 * pokud by zápis překročil `MAX_PENDING_COMMANDS` — volající command
 * NEODEŠLE a zobrazí varování (FR-OFFLINE-03).
 */
export async function enqueuePendingCommand(
  projectId: string,
  command: ProjectCommand
): Promise<PendingCommand> {
  const currentCount = (await getPendingCommands(projectId)).length;
  if (currentCount >= MAX_PENDING_COMMANDS) throw new PendingQueueFullError();

  const entry: PendingCommand = {
    id: uid(),
    projectId,
    command,
    timestamp: nextTimestamp(),
    locallyApplied: true,
  };

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve(entry);
    tx.onerror = () => reject(tx.error);
  });
}

/** Odebere jeden command z fronty — voláno po úspěšném přehrání na server. */
export async function removePendingCommand(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Vyprázdní celou frontu projektu — voláno po hromadném zahození (conflict resolution). */
export async function clearPendingCommands(projectId: string): Promise<void> {
  const pending = await getPendingCommands(projectId);
  await Promise.all(pending.map((cmd) => removePendingCommand(cmd.id)));
}

/**
 * FR-OFFLINE-08: smaže commandy starší než `PENDING_COMMAND_EXPIRY_MS` a vrátí
 * jejich počet, aby volající mohl zobrazit notifikaci ("N starých čekajících
 * změn bylo odstraněno").
 */
export async function purgeExpiredCommands(
  projectId: string,
  now: Date = new Date()
): Promise<number> {
  const pending = await getPendingCommands(projectId);
  const expired = pending.filter(
    (cmd) => now.getTime() - new Date(cmd.timestamp).getTime() > PENDING_COMMAND_EXPIRY_MS
  );
  await Promise.all(expired.map((cmd) => removePendingCommand(cmd.id)));
  return expired.length;
}
