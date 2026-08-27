// Jen seznam členů projektu, bez mutací a bez kandidátů.
//
// `useProjectMembers` je hook pro sekci „Členové projektu": umí přidat, změnit
// roli, odebrat, a kvůli rozbalovacímu seznamu tahá i `listCandidates`.
// Kapacita potřebuje z toho všeho jedinou věc — koho lze přiřadit k osobě
// (FR-ROLE-07) — takže by si druhým voláním `/candidates` platila data, která
// nikdy nezobrazí.
import { useEffect, useState } from 'react';
import { listMembers } from '../../api/membersApi';
import type { Member } from '../../api/membersApi';

/**
 * Členové projektu; při chybě prázdný seznam.
 *
 * Selhání se schválně nehlásí: je to doplňková volba u řádku osoby, ne hlavní
 * obsah stránky. Bez ní zůstane volba účtu prázdná, což vypadá stejně jako
 * projekt s jediným členem — a alokace, kvůli které se Kapacita otevírá,
 * funguje dál.
 *
 * `enabled` je zároveň spoušť pro přenačtení, ne jen vypínač. Volající ho drží
 * na „je otevřená Kapacita", takže se seznam obnoví při každém příchodu na
 * záložku. Bez toho se načetl jednou při otevření projektu a člen přidaný
 * potom — což je běžné pořadí: nejdřív přidám člena, pak mu založím osobu —
 * v nabídce vůbec nebyl.
 */
export function useProjectMemberList(projectId: string, enabled: boolean): Member[] {
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    listMembers(projectId)
      .then((loaded) => {
        if (active) setMembers(loaded);
      })
      .catch(() => {
        if (active) setMembers([]);
      });
    return () => {
      active = false;
    };
  }, [projectId, enabled]);

  return members;
}
