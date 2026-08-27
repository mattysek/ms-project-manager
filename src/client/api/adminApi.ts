// Správa uživatelských účtů (FR-AUTH-05) — `server/.../Api/Admin.fs`.
// Účty se nemažou, jen deaktivují/obnovují.
import { apiRequest } from './httpClient';

export interface UserSummary {
  id: string;
  userName: string;
  displayName: string;
  isActive: boolean;
  isAdmin: boolean;
  /**
   * Projekty, kde má právě deaktivovaný účet přiřazené úkoly.
   *
   * Upozornění, ne zákaz — lidé z týmu odcházejí a jejich účty se musí dát
   * zavřít. Bez téhle informace ale admin netuší, že po sobě nechal v plánu
   * úkoly na někom, kdo se už nepřihlásí. Prázdné u aktivace i u účtů bez práce.
   */
  orphanedIn?: string[];
}

export async function listUsers(): Promise<UserSummary[]> {
  return apiRequest<UserSummary[]>('/admin/users');
}

export async function createUser(
  userName: string,
  displayName: string,
  password: string
): Promise<UserSummary> {
  return apiRequest<UserSummary>('/admin/users', {
    method: 'POST',
    body: JSON.stringify({ userName, displayName, password }),
  });
}

export async function deactivateUser(id: string): Promise<UserSummary> {
  return apiRequest<UserSummary>(`/admin/users/${encodeURIComponent(id)}/deactivate`, {
    method: 'POST',
  });
}

export async function activateUser(id: string): Promise<UserSummary> {
  return apiRequest<UserSummary>(`/admin/users/${encodeURIComponent(id)}/activate`, {
    method: 'POST',
  });
}

export async function resetPassword(id: string, newPassword: string): Promise<void> {
  await apiRequest<void>(`/admin/users/${encodeURIComponent(id)}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ newPassword }),
  });
}
