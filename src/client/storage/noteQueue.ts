// IndexedDB fronta čekajících operací nad Quick Notes.
//
// Poznámky jdou vědomě přes REST, ne přes SignalR (PRD-04): jsou per-user
// a nikdo je nebroadcastuje. Offline fronta v `offlineQueue.ts` je ale
// postavená nad *commandy* projektu, takže poznámky do ní nepatří a až dosud
// offline prostě nefungovaly — text naťukaný ve vlaku se ztratil.
//
// Tahle fronta je jejich protějšek: stejná databáze, vlastní store, stejný
// princip (ulož, přežij reload, přehraj po reconnectu v původním pořadí).
//
// Proč to jde: poznámka dostane id **na klientovi** a server ho respektuje
// (`CreateNoteRequest.Id`). Následné úpravy a smazání se tak mají čeho chytit
// ještě předtím, než create dorazí na server.
import { uid } from '../utils';

const DB_NAME = 'MSProjectManager_Offline';
const DB_VERSION = 2;
const STORE_NAME = 'pending_notes';

/** Strop fronty — stejná ochrana jako u commandů projektu. */
export const MAX_PENDING_NOTE_OPS = 500;

export interface NoteCreatePayload {
  content: string;
  linkedProjectId: string | null;
}

export interface NoteUpdatePayload {
  content: string;
  linkedProjectId: string | null;
  convertedToTaskId: string | null;
}

export type PendingNoteOp =
  | { id: string; noteId: string; timestamp: string; op: 'create'; payload: NoteCreatePayload }
  | { id: string; noteId: string; timestamp: string; op: 'update'; payload: NoteUpdatePayload }
  | { id: string; noteId: string; timestamp: string; op: 'delete' };

let dbInstance: IDBDatabase | null = null;

/**
 * Otevírá **stejnou** databázi jako `offlineQueue.ts`, jen o verzi výš.
 * `onupgradeneeded` proto musí umět doplnit i store commandů — upgrade může
 * spustit kterýkoli z obou modulů podle toho, který se otevře první.
 */
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
      if (!db.objectStoreNames.contains('pending_commands')) {
        const store = db.createObjectStore('pending_commands', { keyPath: 'id' });
        store.createIndex('projectId', 'projectId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

// Stejný důvod jako u `offlineQueue`: dávka operací se vejde do jedné
// milisekundy a IndexedDB nezaručuje pořadí čtení podle vkládání.
let lastTimestampMs = 0;

function nextTimestamp(): string {
  const now = Date.now();
  lastTimestampMs = now > lastTimestampMs ? now : lastTimestampMs + 1;
  return new Date(lastTimestampMs).toISOString();
}

function byTimestampAsc(a: PendingNoteOp, b: PendingNoteOp): number {
  return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
}

/** Čekající operace v pořadí, ve kterém se mají přehrát. */
export async function getPendingNoteOps(): Promise<PendingNoteOp[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as PendingNoteOp[]).sort(byTimestampAsc));
    request.onerror = () => reject(request.error);
  });
}

type NewNoteOp =
  | { noteId: string; op: 'create'; payload: NoteCreatePayload }
  | { noteId: string; op: 'update'; payload: NoteUpdatePayload }
  | { noteId: string; op: 'delete' };

/** Zařadí operaci; při přeplněné frontě vrátí `null` a volající to ohlásí. */
export async function enqueueNoteOp(operation: NewNoteOp): Promise<PendingNoteOp | null> {
  const pending = await getPendingNoteOps();
  if (pending.length >= MAX_PENDING_NOTE_OPS) return null;

  const entry = { id: uid(), timestamp: nextTimestamp(), ...operation } as PendingNoteOp;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve(entry);
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeNoteOp(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearNoteOps(): Promise<void> {
  const pending = await getPendingNoteOps();
  await Promise.all(pending.map((entry) => removeNoteOp(entry.id)));
}
