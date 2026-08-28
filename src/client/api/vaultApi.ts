// Trezor hesel — per-user REST, mimo SignalR (PRD-09, ADR-016).
// `server/.../Api/VaultApi.fs`.
//
// Přes tenhle modul chodí výhradně **zašifrované** blobs. Heslo k trezoru ani
// odvozený klíč se sem nesmí dostat — šifrování řeší `crypto/vaultCrypto.ts`
// a volající předává až hotový výsledek.
import { apiRequest } from './httpClient';

/** Parametry odvození klíče; `exists: false` znamená „trezor není založený". */
export interface VaultProfile {
  exists: boolean;
  kdf: string;
  iterations: number;
  salt: string;
  verifier: string;
  verifierIv: string;
}

/** Zašifrovaný záznam tak, jak leží na serveru. */
export interface EncryptedEntry {
  id: string;
  ciphertext: string;
  iv: string;
  createdAt: string;
  updatedAt: string;
}

export interface VaultProfileInput {
  kdf: string;
  iterations: number;
  salt: string;
  verifier: string;
  verifierIv: string;
}

export interface EncryptedEntryInput {
  id?: string;
  ciphertext: string;
  iv: string;
}

export async function fetchProfile(): Promise<VaultProfile> {
  return apiRequest<VaultProfile>('/api/vault');
}

export async function createVault(profile: VaultProfileInput): Promise<VaultProfile> {
  return apiRequest<VaultProfile>('/api/vault', {
    method: 'POST',
    body: JSON.stringify(profile),
  });
}

/** Zrušení trezoru — nevyžaduje heslo, je to východisko ze zapomenutého (FR-VAULT-10). */
export async function deleteVault(): Promise<void> {
  await apiRequest<void>('/api/vault', { method: 'DELETE' });
}

export async function listEntries(): Promise<EncryptedEntry[]> {
  return apiRequest<EncryptedEntry[]>('/api/vault/entries');
}

export async function createEntry(entry: EncryptedEntryInput): Promise<EncryptedEntry> {
  return apiRequest<EncryptedEntry>('/api/vault/entries', {
    method: 'POST',
    body: JSON.stringify(entry),
  });
}

export async function updateEntry(id: string, entry: EncryptedEntryInput): Promise<EncryptedEntry> {
  return apiRequest<EncryptedEntry>(`/api/vault/entries/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(entry),
  });
}

export async function deleteEntry(id: string): Promise<void> {
  await apiRequest<void>(`/api/vault/entries/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/**
 * Změna hesla trezoru: nový profil i všechny přešifrované záznamy jedním
 * požadavkem, protože server je musí zapsat atomicky (ADR-016).
 */
export async function rekeyVault(
  profile: VaultProfileInput,
  entries: EncryptedEntryInput[]
): Promise<VaultProfile> {
  return apiRequest<VaultProfile>('/api/vault/rekey', {
    method: 'POST',
    body: JSON.stringify({ ...profile, entries }),
  });
}
