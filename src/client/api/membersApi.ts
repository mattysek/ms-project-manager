// Správa členů projektu (FR-ROLE-02) — `server/.../Api/ProjectsApi.fs`.
import { apiRequest } from './httpClient';
import type { MemberRole } from '../types/protocol';

export interface Member {
  userId: string;
  displayName: string;
  role: MemberRole;
  joinedAt: string;
}

/** Uživatel, kterého lze do projektu přidat — server vrací jen id a jméno. */
export interface MemberCandidate {
  userId: string;
  displayName: string;
}

export async function listMembers(projectId: string): Promise<Member[]> {
  return apiRequest<Member[]>(`/api/projects/${encodeURIComponent(projectId)}/members`);
}

/**
 * Nabídka uživatelů k přidání. Vlastní endpoint, ne `/admin/users` — ten je
 * vyhrazený Adminovi, kdežto členy podle FR-ROLE-02 spravuje PM.
 */
export async function listCandidates(projectId: string): Promise<MemberCandidate[]> {
  return apiRequest<MemberCandidate[]>(`/api/projects/${encodeURIComponent(projectId)}/candidates`);
}

export async function addMember(
  projectId: string,
  userId: string,
  role: MemberRole
): Promise<void> {
  await apiRequest<void>(`/api/projects/${encodeURIComponent(projectId)}/members`, {
    method: 'POST',
    body: JSON.stringify({ userId, role }),
  });
}

export async function setMemberRole(
  projectId: string,
  userId: string,
  role: MemberRole
): Promise<void> {
  await apiRequest<void>(
    `/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`,
    { method: 'PUT', body: JSON.stringify({ role }) }
  );
}

export async function removeMember(projectId: string, userId: string): Promise<void> {
  await apiRequest<void>(
    `/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`,
    { method: 'DELETE' }
  );
}
