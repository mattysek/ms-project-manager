// Import/Export utilities
import JSZip from 'jszip';
import type {
  Project,
  Person,
  Task,
  Categories,
  Roles,
  Risk,
  Opportunity,
  FileRef,
  RecurringReminder,
  TodoItem,
  KBPage,
  Milestone,
  ADOConfig,
  ADOSyncLogEntry,
} from '../types';
import { uid } from './index';

// Migration helper: convert old milestones format to new
function migrateMilestones(
  milestones: Milestone[] | Record<number, string | undefined> | undefined
): Milestone[] {
  if (!milestones) return [];
  // Already new format
  if (Array.isArray(milestones)) return milestones;
  // Old format: Record<number, string>
  const result: Milestone[] = [];
  Object.entries(milestones).forEach(([weekIdx, title]) => {
    if (title) {
      result.push({
        id: uid(),
        title,
        weekIndex: Number(weekIdx),
        checkItems: [],
      });
    }
  });
  return result;
}

// Default values
const INIT_CATS: Categories = {
  obecne: { bg: '#111827', bd: '#4b5563', tx: '#94a3b8', label: 'Obecné' },
};

const INIT_ROLES: Roles = {
  AR: { label: 'Solution Architect' },
  BE: { label: 'Back-end Developer' },
  FE: { label: 'Front-end Developer' },
  TE: { label: 'Tester' },
};

const INIT_PROJECT: Project = {
  name: '',
  startDate: '',
  endDate: '',
  budget: 100,
  milestones: [],
  notes: '',
  changelog: [],
};

/**
 * Příloha z importovaného ZIPu.
 *
 * Po ADR-010 nepatří obsah do stavu projektu — leží jako BLOB na serveru.
 * Import proto veze metadata i `content`; volající obsah nahraje přes
 * `POST /api/projects/{id}/files` a teprve odtud vznikne platný `FileRef`.
 */
export interface ImportedFile extends Omit<FileRef, 'addedBy'> {
  /** Base64 obsah ze ZIPu — k nahrání na server, ne do `AppState`. */
  content: string;
}

export interface ParsedImportData {
  project: Project;
  people: Person[];
  tasks: Task[];
  cats: Categories;
  roles: Roles;
  risks: Risk[];
  opps: Opportunity[];
  files: ImportedFile[];
  reminders: RecurringReminder[];
  todos: TodoItem[];
  kbPages: KBPage[];
  adoConfig: ADOConfig | null;
  adoSyncLog: ADOSyncLogEntry[];
}

/** project-management.feature „Import souboru s neplatným formátem" — jen JSON/ZIP jsou podporované. */
function isSupportedImportFormat(file: File): boolean {
  const isZip = file.name.endsWith('.zip') || file.type === 'application/zip';
  const isJson = file.name.endsWith('.json') || file.type === 'application/json';
  return isZip || isJson;
}

/** Jedna položka z `files/` v ZIPu — jméno se skládá z `id_name`. */
function fileFromZipEntry(
  path: string,
  content: string,
  filesMeta: FileMeta[] | undefined
): ImportedFile {
  const fileName = path.replace('files/', '');
  const underscoreIdx = fileName.indexOf('_');
  const id = underscoreIdx > 0 ? fileName.substring(0, underscoreIdx) : fileName;
  const name = underscoreIdx > 0 ? fileName.substring(underscoreIdx + 1) : fileName;
  const meta = filesMeta?.find((f) => f.id === id);

  return {
    id,
    name: meta?.name || name,
    content,
    mimeType: meta?.mimeType || 'application/octet-stream',
    size: meta?.size || content.length,
    addedAt: meta?.addedAt || new Date().toISOString(),
    note: meta?.note || '',
  };
}

interface FileMeta {
  id: string;
  name?: string;
  mimeType?: string;
  size?: number;
  addedAt?: string;
  note?: string;
}

/** ZIP export: `project.json` + složka `files/` s přílohami v base64. */
async function readZipImport(
  file: File
): Promise<{ data: Record<string, unknown>; files: ImportedFile[] }> {
  const zip = await JSZip.loadAsync(file);
  const projectFile = zip.file('project.json');
  if (!projectFile) throw new Error('ZIP neobsahuje project.json');

  const data = JSON.parse(await projectFile.async('string')) as Record<string, unknown>;
  if (!data._version) throw new Error('Neplatný formát project.json');

  const entries = Object.entries(zip.files).filter(
    ([path]) => path.startsWith('files/') && !path.endsWith('/')
  );
  const filesMeta = data.files as FileMeta[] | undefined;

  const files: ImportedFile[] = [];
  for (const [path, zipEntry] of entries) {
    files.push(fileFromZipEntry(path, await zipEntry.async('base64'), filesMeta));
  }
  return { data, files };
}

/** JSON export přílohy nenese (ty jdou jen ZIPem). */
async function readJsonImport(file: File): Promise<Record<string, unknown>> {
  const data = JSON.parse(await file.text()) as Record<string, unknown>;
  if (!data._version) throw new Error('Neplatný formát');
  return data;
}

/** PAT se do stavu nepřenáší — uživatel ho musí zadat znovu (ADR-008). */
function adoConfigWithoutPat(raw: unknown): ADOConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const { _pat, ...configWithoutPat } = raw as Record<string, unknown>;
  void _pat;
  return configWithoutPat as unknown as ADOConfig;
}

/**
 * Doplní pole, která v době exportu ještě neexistovala.
 *
 * Import je jediné místo, kde se do aplikace dostávají data z **jiné (starší)
 * verze**, takže je to i jediné místo, kde je má smysl dorovnat na dnešní tvar.
 *
 * `Person.userId` (vazba osoby na účet, ADR-006) přibyl až s rolemi a na
 * serveru je to **povinné** pole. Starší export ho nemá, a protože chybějící
 * neoptional pole je pro `FSharp.SystemTextJson` tvrdá chyba vazby argumentů,
 * neselhaly „jen osoby" — server odmítl celý `full_state_import` a z projektu
 * se nenaimportovalo vůbec nic, mlčky.
 *
 * Kontraktní brána `build.sh entity` tohle nechytí: hlídá shodu klienta se
 * serverem, ne shodu starých dat s dneškem.
 */
function personFromImport(raw: Person & { userId?: string | null }): Person {
  return { ...raw, userId: raw.userId ?? null };
}

function projectFromImport(raw: Record<string, unknown> | undefined): Project {
  return {
    ...INIT_PROJECT,
    ...(raw || {}),
    name: (raw?.name as string) || 'Importovaný projekt',
    startDate: (raw?.startDate as string) || '',
    endDate: (raw?.endDate as string) || '',
    budget: (raw?.budget as number) || 100,
    milestones: migrateMilestones(
      raw?.milestones as Milestone[] | Record<number, string | undefined> | undefined
    ),
    notes: (raw?.notes as string) || '',
    changelog: (raw?.changelog as Project['changelog']) || [],
  };
}

export async function parseImportFile(file: File): Promise<ParsedImportData> {
  if (!isSupportedImportFormat(file)) {
    throw new Error('Nepodporovaný formát souboru. Použijte JSON nebo ZIP.');
  }

  const isZip = file.name.endsWith('.zip') || file.type === 'application/zip';
  const { data: d, files: importedFiles } = isZip
    ? await readZipImport(file)
    : { data: await readJsonImport(file), files: [] as ImportedFile[] };

  return {
    project: projectFromImport(d.project as Record<string, unknown> | undefined),
    people: ((d.people as Person[]) || []).map(personFromImport),
    tasks: (d.tasks as Task[]) || [],
    cats: (d.cats as Categories) || INIT_CATS,
    roles: (d.roles as Roles) || INIT_ROLES,
    risks: (d.risks as Risk[]) || [],
    opps: (d.opps as Opportunity[]) || [],
    files: importedFiles,
    reminders: (d.reminders as RecurringReminder[]) || [],
    todos: (d.todos as TodoItem[]) || [],
    kbPages: (d.kbPages as KBPage[]) || [],
    adoConfig: adoConfigWithoutPat(d.adoConfig),
    adoSyncLog: (d.adoSyncLog as ADOSyncLogEntry[]) || [],
  };
}
