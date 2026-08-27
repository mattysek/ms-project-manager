// IndexedDB storage for projects

const DB_NAME = 'MSProjectManager';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

// Request persistent storage to prevent browser from clearing IndexedDB
let persistenceRequested = false;

async function requestPersistentStorage(): Promise<boolean> {
  if (persistenceRequested) return true;

  try {
    if (navigator.storage?.persist) {
      const isPersisted = await navigator.storage.persisted();
      if (!isPersisted) {
        const granted = await navigator.storage.persist();
        console.log(`[Storage] Persistent storage ${granted ? 'granted' : 'denied'}`);
        persistenceRequested = true;
        return granted;
      }
      persistenceRequested = true;
      return true;
    }
  } catch (err) {
    console.warn('[Storage] Could not request persistent storage:', err);
  }
  return false;
}

export interface StoredProject {
  id: string;
  name: string;
  updatedAt: string;
  createdAt: string;
  data: ProjectData;
}

export interface ProjectData {
  project: import('../types').Project;
  people: import('../types').Person[];
  tasks: import('../types').Task[];
  cats: import('../types').Categories;
  roles: import('../types').Roles;
  risks: import('../types').Risk[];
  opps: import('../types').Opportunity[];
  files: import('../types').FileRef[];
  reminders: import('../types').RecurringReminder[];
  todos: import('../types').TodoItem[];
  kbPages: import('../types').KBPage[];
  adoConfig?: import('../types').ADOConfig;
  adoSyncLog?: import('../types').ADOSyncLogEntry[];
}

let dbInstance: IDBDatabase | null = null;

async function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  // Request persistent storage on first open
  await requestPersistentStorage();

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
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('name', 'name', { unique: false });
      }
    };
  });
}

export async function getAllProjects(): Promise<StoredProject[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const projects = request.result as StoredProject[];
      // Sort by updatedAt descending
      projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      resolve(projects);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getProject(id: string): Promise<StoredProject | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function saveProject(project: StoredProject): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(project);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function createNewProject(name: string): Promise<StoredProject> {
  const now = new Date().toISOString();
  const project: StoredProject = {
    id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 11),
    name,
    createdAt: now,
    updatedAt: now,
    data: {
      project: {
        name,
        startDate: '',
        endDate: '',
        budget: 100,
        milestones: [],
        notes: '',
        changelog: [],
      },
      people: [],
      tasks: [],
      cats: {
        obecne: { bg: '#111827', bd: '#4b5563', tx: '#94a3b8', label: 'Obecné' },
      },
      roles: {
        AR: { label: 'Solution Architect' },
        BE: { label: 'Back-end Developer' },
        FE: { label: 'Front-end Developer' },
        TE: { label: 'Tester' },
      },
      risks: [],
      opps: [],
      files: [],
      reminders: [],
      todos: [],
      kbPages: [],
    },
  };

  await saveProject(project);
  return project;
}

export function generateProjectId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 11);
}

// Get storage info for debugging/display
export async function getStorageInfo(): Promise<{
  persisted: boolean;
  usage: number;
  quota: number;
} | null> {
  try {
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
      return {
        persisted,
        usage: estimate.usage || 0,
        quota: estimate.quota || 0,
      };
    }
  } catch (err) {
    console.warn('[Storage] Could not get storage info:', err);
  }
  return null;
}
