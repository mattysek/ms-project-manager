// Historie KB stránek (`knowledge-base.feature`).
//
// Revize se čtou přes REST, ne přes SignalR: nejsou součástí stavu projektu
// a nikoho nezajímají, dokud si o ně uživatel neřekne. Obnovení verze naopak
// REST není — pošle se běžný `update_kb_page`, takže projde stejnou cestou
// jako každá editace (oprávnění, diffy, offline fronta).
import { apiRequest } from './httpClient';

export interface KbRevision {
  id: string;
  title: string;
  content: string;
  savedAt: string;
  savedBy: string;
}

export async function listRevisions(projectId: string, pageId: string): Promise<KbRevision[]> {
  return apiRequest<KbRevision[]>(
    `/api/projects/${encodeURIComponent(projectId)}/kb/${encodeURIComponent(pageId)}/revisions`
  );
}
