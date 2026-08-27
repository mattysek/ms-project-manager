// Quick notes — per-user REST, mimo SignalR (PRD-04, FR-QN-08).
// `server/.../Api/QuickNotesApi.fs`.
import { apiRequest } from './httpClient';

export interface QuickNote {
  id: string;
  content: string;
  linkedProjectId: string | null;
  convertedToTaskId: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listNotes(): Promise<QuickNote[]> {
  return apiRequest<QuickNote[]>('/api/quick-notes');
}

/**
 * `id` posílá klient, aby poznámka vytvořená offline měla identitu ještě před
 * dohráním (offline.feature). Server ho respektuje a opakovaný `create` se
 * stejným id vrátí existující poznámku místo chyby — přehrání fronty tedy smí
 * doručit stejnou operaci dvakrát.
 */
export async function createNote(
  content: string,
  linkedProjectId: string | null = null,
  id?: string
): Promise<QuickNote> {
  return apiRequest<QuickNote>('/api/quick-notes', {
    method: 'POST',
    body: JSON.stringify({ id: id ?? null, content, linkedProjectId }),
  });
}

export interface UpdateNoteFields {
  content: string;
  linkedProjectId: string | null;
  convertedToTaskId: string | null;
}

export async function updateNote(id: string, fields: UpdateNoteFields): Promise<QuickNote> {
  return apiRequest<QuickNote>(`/api/quick-notes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
}

export async function deleteNote(id: string): Promise<void> {
  await apiRequest<void>(`/api/quick-notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
