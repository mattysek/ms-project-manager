// Data hook pro AdminUsersPage — načtení a mutace přes adminApi (FR-AUTH-05).
import { useCallback, useEffect, useState } from 'react';
import * as adminApi from '../../api/adminApi';
import type { UserSummary } from '../../api/adminApi';

export interface UseAdminUsersResult {
  users: UserSummary[];
  loading: boolean;
  message: string | null;
  /** Upozornění po deaktivaci — účet je zavřený, ale zbyla po něm práce. */
  warning: string | null;
  dismissWarning: () => void;
  /**
   * Odmítnutá změna aktivity účtu (FR-AUTH-05).
   *
   * Server deaktivaci zamítne u uživatele, který je někde jediným PM
   * (`Members.projectsWhereSolePm`) — jinak by projekt osiřel. Dřív se ta
   * odpověď nikde nezachytila: promise skončila neošetřenou výjimkou, řádek
   * zůstal „Aktivní" a admin neměl jak poznat, že se nic nestalo.
   */
  error: string | null;
  dismissError: () => void;
  createUser: (userName: string, displayName: string, password: string) => Promise<string | null>;
  toggleActive: (user: UserSummary) => Promise<void>;
  resetPassword: (id: string, newPassword: string) => Promise<string | null>;
}

export function useAdminUsers(): UseAdminUsersResult {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setUsers(await adminApi.listUsers());
  }, []);

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [reload]);

  const createUser = useCallback(
    async (userName: string, displayName: string, password: string) => {
      try {
        const created = await adminApi.createUser(userName, displayName, password);
        setUsers((prev) => [...prev, created]);
        setMessage(`Uživatel ${created.displayName} byl vytvořen`);
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : 'Vytvoření účtu se nezdařilo';
      }
    },
    []
  );

  const toggleActive = useCallback(async (user: UserSummary) => {
    try {
      const updated = user.isActive
        ? await adminApi.deactivateUser(user.id)
        : await adminApi.activateUser(user.id);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setError(null);

      // Osiřelé úkoly nejsou chyba ani úspěch — deaktivace proběhla, ale
      // někdo po ní musí uklidit. Vlastní stav, ať to nesplyne se zelenou
      // hláškou o úspěchu.
      const orphaned = updated.orphanedIn ?? [];
      setWarning(
        orphaned.length > 0
          ? `Účet ${updated.displayName} je deaktivovaný, ale zůstaly mu přiřazené úkoly v projektech: ${orphaned.join(', ')}. Přeřaďte je na někoho jiného.`
          : null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Změna stavu účtu se nezdařila');
    }
  }, []);

  const resetPassword = useCallback(async (id: string, newPassword: string) => {
    try {
      await adminApi.resetPassword(id, newPassword);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Reset hesla se nezdařil';
    }
  }, []);

  return {
    users,
    loading,
    message,
    warning,
    dismissWarning: useCallback(() => setWarning(null), []),
    error,
    dismissError: useCallback(() => setError(null), []),
    createUser,
    toggleActive,
    resetPassword,
  };
}
