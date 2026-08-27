// Data hook pro sekci „Členové projektu" (PRD-03 FR-ROLE-02).
//
// Na rozdíl od zbytku aplikace tohle NEJDE přes `ProjectCommand`/diff protokol
// (ADR-004) — členství je REST zdroj pravdy (`membersApi.ts`,
// `server/.../Api/ProjectsApi.fs`), stejně jako správa uživatelských účtů.
// Po každé mutaci se proto stav znovu načte ze serveru, žádná optimistická
// aplikace.
//
// Pravidla „PM nesmí odebrat sám sebe" a „projekt musí mít vždy aspoň jednoho
// PM" vynucuje server; klient jeho hlášku jen zobrazí. Duplikovat tu logiku by
// znamenalo mít dvě pravdy, které se můžou rozejít.
import { useCallback, useEffect, useState } from 'react';
import {
  addMember,
  listCandidates,
  listMembers,
  removeMember,
  setMemberRole,
} from '../../api/membersApi';
import type { Member, MemberCandidate } from '../../api/membersApi';
import type { MemberRole } from '../../types/protocol';

export interface UseProjectMembersResult {
  members: Member[];
  /** Uživatelé systému, kteří ještě nejsou členy projektu. */
  candidates: MemberCandidate[];
  loading: boolean;
  error: string | null;
  dismissError: () => void;
  addMember: (userId: string, role: MemberRole) => Promise<void>;
  changeRole: (userId: string, role: MemberRole) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function useProjectMembers(projectId: string, enabled: boolean): UseProjectMembersResult {
  const [members, setMembers] = useState<Member[]>([]);
  const [candidates, setCandidates] = useState<MemberCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [loadedMembers, loadedCandidates] = await Promise.all([
      listMembers(projectId),
      listCandidates(projectId),
    ]);
    setMembers(loadedMembers);
    setCandidates(loadedCandidates);
  }, [projectId]);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    reload()
      .catch((err) => setError(errorText(err, 'Členy projektu se nepodařilo načíst')))
      .finally(() => setLoading(false));
  }, [enabled, reload]);

  const runMutation = useCallback(
    async (mutate: () => Promise<void>, fallbackMessage: string) => {
      setError(null);
      try {
        await mutate();
        await reload();
      } catch (err) {
        setError(errorText(err, fallbackMessage));
      }
    },
    [reload]
  );

  return {
    members,
    candidates,
    loading,
    error,
    dismissError: useCallback(() => setError(null), []),
    addMember: useCallback(
      (userId: string, role: MemberRole) =>
        runMutation(() => addMember(projectId, userId, role), 'Přidání člena se nezdařilo'),
      [projectId, runMutation]
    ),
    changeRole: useCallback(
      (userId: string, role: MemberRole) =>
        runMutation(() => setMemberRole(projectId, userId, role), 'Změna role se nezdařila'),
      [projectId, runMutation]
    ),
    removeMember: useCallback(
      (userId: string) =>
        runMutation(() => removeMember(projectId, userId), 'Odebrání člena se nezdařilo'),
      [projectId, runMutation]
    ),
  };
}
