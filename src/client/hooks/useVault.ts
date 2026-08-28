// Stav trezoru hesel — PRD-09, ADR-016.
//
// Hook vlastní tři věci: odvozený klíč, dešifrované záznamy a zámek. Klíč je
// `CryptoKey` v `useRef`, ne ve `useState` — nemá se překreslovat podle něj a
// hlavně nemá kde skončit mimo paměť záložky. Do `localStorage`, IndexedDB ani
// `sessionStorage` se neukládá nic z trezoru (ADR-016): reload = zamčeno.
//
// Stav jede přes `useReducer`, ne přes several `useState`. Důvod je praktický:
// `dispatch` má stabilní identitu, takže ho operace vytažené mimo hook berou
// jako parametr, aniž by se rozbily závislosti `useCallback` (PRD-07 popisuje
// přesně tenhle trap u setterů schovaných za pomocný hook).
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import * as vaultApi from '../api/vaultApi';
import type {
  EncryptedEntry,
  EncryptedEntryInput,
  VaultProfile,
  VaultProfileInput,
} from '../api/vaultApi';
import {
  KDF_NAME,
  PBKDF2_ITERATIONS,
  createVerifier,
  decryptJson,
  deriveKey,
  encryptJson,
  generateSalt,
  verifyKey,
} from '../crypto/vaultCrypto';

/** Dešifrovaný záznam, jak ho vidí UI. Na server jde jen jako blob. */
export interface VaultEntry {
  id: string;
  title: string;
  username: string;
  password: string;
  url: string;
  note: string;
  updatedAt: string;
}

/** Obsah, který se šifruje — bez `id` a časů, ty zůstávají v plaintextu. */
type EntrySecret = Omit<VaultEntry, 'id' | 'updatedAt'>;

/** Záznam bez serverem doplněného času — tvar, který posílá formulář. */
export type VaultEntryDraft = Omit<VaultEntry, 'updatedAt'>;

export type VaultStatus = 'loading' | 'absent' | 'locked' | 'unlocked';

/** Minimální délka hesla k trezoru (FR-VAULT-01). */
export const MIN_VAULT_PASSWORD_LENGTH = 12;

/** Po jaké nečinnosti se trezor zamkne sám (FR-VAULT-03). */
export const AUTO_LOCK_MS = 15 * 60 * 1000;

const WRONG_PASSWORD = 'Nesprávné heslo k trezoru';

interface VaultState {
  status: VaultStatus;
  entries: VaultEntry[];
  error: string | null;
}

type VaultAction =
  | { type: 'profile'; exists: boolean }
  | { type: 'unlocked'; entries: VaultEntry[] }
  | { type: 'entries'; entries: VaultEntry[] }
  | { type: 'locked' }
  | { type: 'absent' }
  | { type: 'error'; message: string };

function reduce(state: VaultState, action: VaultAction): VaultState {
  switch (action.type) {
    case 'profile':
      return { ...state, status: action.exists ? 'locked' : 'absent' };
    case 'unlocked':
      return { status: 'unlocked', entries: action.entries, error: null };
    case 'entries':
      return { ...state, entries: action.entries };
    // Zamčení musí vyhodit i dešifrovaný obsah, jinak by hesla zůstala viset
    // v paměti komponenty (FR-VAULT-03).
    case 'locked':
      return { status: 'locked', entries: [], error: null };
    case 'absent':
      return { status: 'absent', entries: [], error: null };
    case 'error':
      return { ...state, error: action.message };
  }
}

type Dispatch = React.Dispatch<VaultAction>;
type KeyRef = React.MutableRefObject<CryptoKey | null>;

// ── Operace mimo React ──────────────────────────────────────────────────────

function toSecret(entry: VaultEntryDraft): EntrySecret {
  return {
    title: entry.title,
    username: entry.username,
    password: entry.password,
    url: entry.url,
    note: entry.note,
  };
}

async function decryptAll(key: CryptoKey, rows: EncryptedEntry[]): Promise<VaultEntry[]> {
  const entries: VaultEntry[] = [];
  for (const row of rows) {
    const secret = await decryptJson<EntrySecret>(key, row);
    entries.push({ id: row.id, updatedAt: row.updatedAt, ...secret });
  }
  return entries;
}

/** Odvodí klíč a ověří ho proti `verifier`; `null` znamená špatné heslo. */
async function deriveAndVerify(password: string, profile: VaultProfile): Promise<CryptoKey | null> {
  const key = await deriveKey(password, profile.salt, profile.iterations);
  const valid = await verifyKey(key, { ciphertext: profile.verifier, iv: profile.verifierIv });
  return valid ? key : null;
}

/** Nová sůl, klíč a `verifier` pro zakládaný nebo přešifrovaný trezor. */
async function newProfile(password: string): Promise<{ key: CryptoKey; input: VaultProfileInput }> {
  const salt = generateSalt();
  const key = await deriveKey(password, salt);
  const verifier = await createVerifier(key);
  return {
    key,
    input: {
      kdf: KDF_NAME,
      iterations: PBKDF2_ITERATIONS,
      salt,
      verifier: verifier.ciphertext,
      verifierIv: verifier.iv,
    },
  };
}

async function reencrypt(key: CryptoKey, entries: VaultEntry[]): Promise<EncryptedEntryInput[]> {
  const result: EncryptedEntryInput[] = [];
  for (const entry of entries) {
    result.push({ id: entry.id, ...(await encryptJson(key, toSecret(entry))) });
  }
  return result;
}

/** Serverovou hlášku vrací volajícímu; `null` znamená úspěch. */
async function attempt(action: () => Promise<unknown>, fallback: string): Promise<string | null> {
  try {
    await action();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : fallback;
  }
}

async function refresh(key: CryptoKey, dispatch: Dispatch): Promise<VaultEntry[]> {
  const entries = await decryptAll(key, await vaultApi.listEntries());
  dispatch({ type: 'entries', entries });
  return entries;
}

// ── Dílčí hooky ─────────────────────────────────────────────────────────────

/** Zámek a odpočet nečinnosti (FR-VAULT-03). */
function useLock(status: VaultStatus, dispatch: Dispatch, keyRef: KeyRef) {
  const lastActivity = useRef(Date.now());

  const touch = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  const lock = useCallback(() => {
    keyRef.current = null;
    dispatch({ type: 'locked' });
  }, [dispatch, keyRef]);

  // Tik místo jednoho `setTimeout` na 15 minut: časovač by se jinak musel při
  // každém doteku rušit a zakládat znovu.
  useEffect(() => {
    if (status !== 'unlocked') return;
    const timer = setInterval(() => {
      if (Date.now() - lastActivity.current >= AUTO_LOCK_MS) lock();
    }, 30_000);
    return () => clearInterval(timer);
  }, [status, lock]);

  return { lock, touch };
}

/** Založení, odemčení, změna hesla a zrušení trezoru. */
function useAccess(dispatch: Dispatch, keyRef: KeyRef, touch: () => void) {
  const create = useCallback(
    async (password: string, confirmation: string) => {
      if (password.length < MIN_VAULT_PASSWORD_LENGTH) {
        return `Heslo k trezoru musí mít alespoň ${MIN_VAULT_PASSWORD_LENGTH} znaků`;
      }
      if (password !== confirmation) return 'Hesla se neshodují';

      const { key, input } = await newProfile(password);
      const failure = await attempt(
        () => vaultApi.createVault(input),
        'Trezor se nepodařilo založit'
      );
      if (failure) return failure;

      keyRef.current = key;
      dispatch({ type: 'unlocked', entries: [] });
      touch();
      return null;
    },
    [dispatch, keyRef, touch]
  );

  const unlock = useCallback(
    async (password: string) => {
      const profile = await vaultApi.fetchProfile();
      if (!profile.exists) return 'Trezor není založen';

      // Ověřuje se proti `verifier`, ne proti záznamům — prázdný trezor musí
      // jít odemknout taky (ADR-016).
      const key = await deriveAndVerify(password, profile);
      if (!key) return WRONG_PASSWORD;

      keyRef.current = key;
      dispatch({ type: 'unlocked', entries: await decryptAll(key, await vaultApi.listEntries()) });
      touch();
      return null;
    },
    [dispatch, keyRef, touch]
  );

  const destroy = useCallback(async () => {
    await vaultApi.deleteVault();
    keyRef.current = null;
    dispatch({ type: 'absent' });
  }, [dispatch, keyRef]);

  return { create, unlock, destroy };
}

/** Změna hesla trezoru — přešifruje všechno a pošle to jedním zápisem. */
function useRekey(dispatch: Dispatch, keyRef: KeyRef, touch: () => void) {
  return useCallback(
    async (current: string, next: string) => {
      if (next.length < MIN_VAULT_PASSWORD_LENGTH) {
        return `Heslo k trezoru musí mít alespoň ${MIN_VAULT_PASSWORD_LENGTH} znaků`;
      }

      const profile = await vaultApi.fetchProfile();
      const currentKey = await deriveAndVerify(current, profile);
      if (!currentKey) return WRONG_PASSWORD;

      // Čte se ze serveru, ne z `entries` — ty můžou být prázdné, když se
      // heslo mění hned po odemčení.
      const decrypted = await decryptAll(currentKey, await vaultApi.listEntries());
      const { key, input } = await newProfile(next);
      const payload = await reencrypt(key, decrypted);

      // Rekey je na serveru atomický, takže neúspěch znamená „nic se nezměnilo"
      // a trezor zůstává pod původním heslem.
      const failure = await attempt(
        () => vaultApi.rekeyVault(input, payload),
        'Heslo se nepodařilo změnit'
      );
      if (failure) return failure;

      keyRef.current = key;
      await refresh(key, dispatch);
      touch();
      return null;
    },
    [dispatch, keyRef, touch]
  );
}

/** Uložení a smazání záznamu. */
function useEntries(dispatch: Dispatch, keyRef: KeyRef, touch: () => void, entries: VaultEntry[]) {
  const save = useCallback(
    async (entry: VaultEntryDraft) => {
      const key = keyRef.current;
      if (!key) return 'Trezor je zamčený';
      if (!entry.title.trim()) return 'Název je povinný';

      const blob = await encryptJson(key, toSecret(entry));
      const known = entries.some((existing) => existing.id === entry.id);
      const failure = await attempt(
        () =>
          known
            ? vaultApi.updateEntry(entry.id, blob)
            : vaultApi.createEntry({ id: entry.id, ...blob }),
        'Záznam se nepodařilo uložit'
      );
      if (failure) return failure;

      await refresh(key, dispatch);
      touch();
      return null;
    },
    [dispatch, entries, keyRef, touch]
  );

  const remove = useCallback(
    async (id: string) => {
      const key = keyRef.current;
      if (!key) return;
      await vaultApi.deleteEntry(id);
      await refresh(key, dispatch);
      touch();
    },
    [dispatch, keyRef, touch]
  );

  return { save, remove };
}

export interface UseVaultResult {
  status: VaultStatus;
  entries: VaultEntry[];
  error: string | null;
  /** Založí trezor a rovnou ho odemkne. Vrací českou hlášku při chybě. */
  create: (password: string, confirmation: string) => Promise<string | null>;
  unlock: (password: string) => Promise<string | null>;
  lock: () => void;
  save: (entry: VaultEntryDraft) => Promise<string | null>;
  remove: (id: string) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<string | null>;
  /** Zruší trezor i s obsahem — bez znalosti hesla (FR-VAULT-10). */
  destroy: () => Promise<void>;
  /** Posune odpočet automatického zámku (volá se při práci s trezorem). */
  touch: () => void;
}

export function useVault(): UseVaultResult {
  const [state, dispatch] = useReducer(reduce, {
    status: 'loading',
    entries: [],
    error: null,
  });
  const keyRef = useRef<CryptoKey | null>(null);

  useEffect(() => {
    vaultApi
      .fetchProfile()
      .then((profile) => dispatch({ type: 'profile', exists: profile.exists }))
      .catch(() => dispatch({ type: 'error', message: 'Trezor se nepodařilo načíst' }));
  }, []);

  const { lock, touch } = useLock(state.status, dispatch, keyRef);
  const { create, unlock, destroy } = useAccess(dispatch, keyRef, touch);
  const changePassword = useRekey(dispatch, keyRef, touch);
  const { save, remove } = useEntries(dispatch, keyRef, touch, state.entries);

  return useMemo(
    () => ({ ...state, create, unlock, lock, save, remove, changePassword, destroy, touch }),
    [state, create, unlock, lock, save, remove, changePassword, destroy, touch]
  );
}
