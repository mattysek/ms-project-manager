// Session přihlášeného uživatele — PRD-01, ADR-003.
//
// Držen jako běžný `useState` v komponentě blízko kořene (`App.tsx`), ne v
// Contextu (CLAUDE.md: „Nezaváděj Context, pokud to ADR výslovně neříká") —
// `AuthGate` je jediný konzument, který o hooku ví, a předává výsledek dál
// jako props, stejně jako zbytek stromu.
import { useCallback, useEffect, useState } from 'react';
import * as authApi from '../api/authApi';
import type { CurrentUser } from '../api/authApi';
import { forgetAuthenticated, rememberAuthenticated } from './sessionMemory';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

export interface UseAuthResult {
  status: AuthStatus;
  user: CurrentUser | null;
  /** `null` = úspěch; jinak česká chybová hláška pro formulář. */
  login: (userName: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  /** Po `/setup` je uživatel rovnou přihlášen — nastaví stav bez dalšího `GET /auth/me`. */
  setAuthenticated: (user: CurrentUser) => void;
}

/** `UseAuthResult` s zaručeně nenulovým `user` — tvar předávaný do `AuthenticatedApp` po `AuthGate`. */
export type AuthenticatedAuth = Omit<UseAuthResult, 'user'> & { user: CurrentUser };

export function useAuth(): UseAuthResult {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    authApi.fetchCurrentUser().then((current) => {
      if (cancelled) return;
      setUser(current);
      setStatus(current ? 'authenticated' : 'anonymous');
      if (current) rememberAuthenticated();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (userName: string, password: string) => {
    try {
      const current = await authApi.login(userName, password);
      setUser(current);
      setStatus('authenticated');
      rememberAuthenticated();
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Přihlášení se nezdařilo';
    }
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    setStatus('anonymous');
    // Bez tohohle by se po každém odhlášení tvrdilo, že session vypršela.
    forgetAuthenticated();
  }, []);

  const setAuthenticated = useCallback((current: CurrentUser) => {
    setUser(current);
    setStatus('authenticated');
    rememberAuthenticated();
  }, []);

  return { status, user, login, logout, setAuthenticated };
}
