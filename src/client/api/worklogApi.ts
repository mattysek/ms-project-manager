// Vykazování práce — per-user REST, mimo SignalR (PRD-10, ADR-017).
// `server/.../Api/WorkLogApi.fs`.
//
// Vlastníka bere server z přihlášení, takže tudy nejde přečíst cizí výkaz ani
// omylem — žádná z funkcí neposílá `userId`.
//
// Časy jsou ISO 8601 instanty (`Date.toISOString()`), určuje je **klient**;
// server je jen validuje a uloží v kanonickém tvaru. Rozhodnutí, do kterého
// dne záznam patří, se dělá v místním čase až v `utils/worklog.ts`.
import { apiRequest } from './httpClient';

/** Záznam tak, jak leží na serveru. `endedAt` chybí u běžící činnosti. */
export interface WorkLogEntry {
  id: string;
  title: string;
  description: string;
  projectId?: string;
  startedAt: string;
  endedAt?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkLogEntryInput {
  id?: string;
  title: string;
  description?: string | null;
  projectId?: string | null;
  startedAt: string;
  /** `null` = spuštění stopek (běžící činnost). */
  endedAt?: string | null;
  tags?: string[];
}

/**
 * Odpověď na zápis. `stoppedPrevious` nese činnost, kterou start té nové
 * ukončil (FR-WL-03) — bez ní by se uživateli zastavily stopky za zády.
 */
export interface WorkLogWriteResult {
  entry: WorkLogEntry;
  stoppedPrevious?: WorkLogEntry;
}

export interface WorkLogRange {
  /** ISO instant, včetně. */
  from: string;
  /** ISO instant, vyjma. */
  to: string;
}

export async function listEntries(range?: WorkLogRange): Promise<WorkLogEntry[]> {
  const query = range ? `?${new URLSearchParams({ ...range }).toString()}` : '';
  return apiRequest<WorkLogEntry[]>(`/api/worklog${query}`);
}

export async function fetchRunning(): Promise<WorkLogEntry | null> {
  const response = await apiRequest<{ running?: WorkLogEntry }>('/api/worklog/running');
  return response.running ?? null;
}

export async function listTags(): Promise<string[]> {
  return apiRequest<string[]>('/api/worklog/tags');
}

/**
 * Doplní **všechna** pole požadavku, i ta prázdná.
 *
 * Není to kosmetika. `WorkLogEntryRequest` má na serveru volitelná pole jako
 * `string | null`, ne `option`, a `FSharp.SystemTextJson` chybějící pole
 * běžného (ne-`option`) typu odmítne — celé tělo se pak nenaparsuje a
 * endpoint vrátí „Chybí obsah záznamu". Je to stejné pravidlo, jaké hlídá
 * `build.sh entity` u doménových entit; na REST kontrakty ale nedosáhne.
 *
 * Jednotkové testy tohle nechytí, protože mají server zamockovaný — přišlo se
 * na to až v E2E, kde „Start" mlčky nezaložil nic.
 */
function toPayload(input: WorkLogEntryInput, id: string | null) {
  return {
    id,
    title: input.title,
    description: input.description ?? '',
    projectId: input.projectId ?? null,
    startedAt: input.startedAt,
    endedAt: input.endedAt ?? null,
    tags: input.tags ?? [],
  };
}

export async function createEntry(input: WorkLogEntryInput): Promise<WorkLogWriteResult> {
  return apiRequest<WorkLogWriteResult>('/api/worklog', {
    method: 'POST',
    body: JSON.stringify(toPayload(input, input.id ?? null)),
  });
}

export async function updateEntry(id: string, input: WorkLogEntryInput): Promise<WorkLogEntry> {
  return apiRequest<WorkLogEntry>(`/api/worklog/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(toPayload(input, id)),
  });
}

export async function deleteEntry(id: string): Promise<void> {
  await apiRequest<void>(`/api/worklog/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/**
 * Zastaví běžící činnost. Okamžik posílá klient schválně: je to čas kliknutí,
 * ne čas doručení požadavku, takže opakovaný pokus po výpadku zapíše pořád ten
 * správný (ADR-017).
 */
export async function stopRunning(endedAt: string): Promise<WorkLogEntry> {
  return apiRequest<WorkLogEntry>('/api/worklog/stop', {
    method: 'POST',
    body: JSON.stringify({ endedAt }),
  });
}
