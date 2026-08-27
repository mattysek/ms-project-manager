// Role přihlášeného uživatele na aktuálně otevřeném projektu (PRD-03, ADR-004
// doplněk „Stav mimo AppState": role je součást session kontextu, ne dat
// projektu, proto žije mimo `AppState` — podobně jako presence.
//
// Zdroj pravdy o roli je `GET /api/projects/{id}/members` (server ji do
// `full_state`/`JoinProject` odpovědi nedává — viz ADR-004 doplněk), aktualizace
// běží přes `role_changed` diff (FR-ROLE-06), doručovaný jen dotčenému spojení.
import { useCallback, useEffect, useState } from 'react';
import { listMembers } from '../api/membersApi';
import type { MemberRole } from '../types/protocol';
import type { ProjectDiff } from '../types/protocol';

export interface UseMyRoleResult {
  /** `null`, dokud role nedorazí (ještě se načítá, nebo žádný projekt není otevřený). */
  role: MemberRole | null;
  handleDiff: (diff: ProjectDiff) => void;
}

export function useMyRole(projectId: string | null, userId: string | undefined): UseMyRoleResult {
  const [role, setRole] = useState<MemberRole | null>(null);

  useEffect(() => {
    setRole(null);
    if (!projectId || !userId) return;
    let cancelled = false;
    listMembers(projectId).then((members) => {
      if (cancelled) return;
      const mine = members.find((m) => m.userId === userId);
      setRole(mine?.role ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, userId]);

  const handleDiff = useCallback((diff: ProjectDiff) => {
    if (diff.op === 'role_changed') setRole(diff.newRole);
  }, []);

  return { role, handleDiff };
}
