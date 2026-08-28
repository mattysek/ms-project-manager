// Přihlášení, odhlášení, změna hesla, první spuštění — PRD-01, ADR-003.
//
// Kontrakt je doslova podle `server/.../Api/Auth.fs` a `Api/Contracts.fs`:
// `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`,
// `POST /auth/change-password`, `GET /auth/setup-required`, `POST /auth/setup`,
// `POST /auth/register`.
import { apiRequest, ApiError } from './httpClient';

export { ApiError };

export interface CurrentUser {
  userId: string;
  userName: string;
  displayName: string;
  isAdmin: boolean;
}

export async function login(userName: string, password: string): Promise<CurrentUser> {
  return apiRequest<CurrentUser>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ userName, password }),
  });
}

export async function logout(): Promise<void> {
  await apiRequest<void>('/auth/logout', { method: 'POST' });
}

/** `null`, pokud nejsme přihlášeni (401) — volající to nepovažuje za chybu. */
export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  try {
    return await apiRequest<CurrentUser>('/auth/me');
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 401) return null;
    throw err;
  }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiRequest<{ message: string }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

/**
 * Co se dá dělat před přihlášením — první spuštění a povolená registrace.
 *
 * Jedno volání pro obojí: `AuthGate` obě odpovědi potřebuje ve stejnou chvíli
 * a druhý round trip při startu aplikace by za to nestál. Cesta zůstává
 * `/auth/setup-required`, protože na ni čeká i healthcheck v `e2e/run.sh`.
 */
export interface AuthBootstrap {
  setupRequired: boolean;
  registrationAllowed: boolean;
}

export async function fetchAuthBootstrap(): Promise<AuthBootstrap> {
  const result = await apiRequest<{ required: boolean; registrationAllowed: boolean }>(
    '/auth/setup-required'
  );
  return { setupRequired: result.required, registrationAllowed: result.registrationAllowed };
}

/**
 * Samoobslužná registrace (FR-AUTH-08). Odpověď nese session cookie, takže je
 * uživatel po ní rovnou přihlášený — stejně jako po `setupAdmin`.
 */
export async function register(
  userName: string,
  displayName: string,
  password: string
): Promise<CurrentUser> {
  return apiRequest<CurrentUser>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ userName, displayName, password }),
  });
}

export async function setupAdmin(
  userName: string,
  displayName: string,
  password: string
): Promise<CurrentUser> {
  return apiRequest<CurrentUser>('/auth/setup', {
    method: 'POST',
    body: JSON.stringify({ userName, displayName, password }),
  });
}
