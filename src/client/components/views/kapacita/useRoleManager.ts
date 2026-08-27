// Správa rolí — přidání, přejmenování a smazání (včetně varování o dotčených osobách).
import { useState } from 'react';
import type { Person, Roles } from '../../../types';

/** Skloňování „osobě/osobám" pro varování při mazání role — dativ množného čísla je v češtině neměnný. */
function personCountLabel(count: number): string {
  return count === 1 ? '1 osobě' : `${count} osobám`;
}

export function useRoleManager(
  roles: Roles,
  setRoles: React.Dispatch<React.SetStateAction<Roles>>,
  rawPeople: Person[],
  setRawPeople: React.Dispatch<React.SetStateAction<Person[]>>
) {
  const [showRoleMgr, setShowRoleMgr] = useState(false);
  const [newRoleKey, setNewRoleKey] = useState('');
  const [newRoleLabel, setNewRoleLabel] = useState('');

  const addRole = () => {
    const key = newRoleKey.trim().toUpperCase();
    const label = newRoleLabel.trim();
    if (!key || !label || roles[key]) return;
    setRoles((prev) => ({ ...prev, [key]: { label } }));
    setNewRoleKey('');
    setNewRoleLabel('');
  };

  const updateRoleLabel = (key: string, label: string) =>
    setRoles((prev) => ({ ...prev, [key]: { ...prev[key], label } }));

  const deleteRole = (key: string) => {
    if (Object.keys(roles).length <= 1) return;
    const affected = rawPeople.filter((p) => p.role === key).length;
    const warning =
      affected > 0
        ? `Role ${key} je přiřazena ${personCountLabel(affected)}. Odebráním role se zachová osoba, ale její role bude prázdná.`
        : `Opravdu smazat roli ${key}?`;
    if (!window.confirm(warning)) return;

    // Role odebraných osob zůstane prázdná (ne fallback na jinou roli) — PM ji přiřadí ručně.
    setRawPeople((prev) => prev.map((p) => (p.role === key ? { ...p, role: '' } : p)));
    setRoles((prev) => {
      const n = { ...prev };
      delete n[key];
      return n;
    });
  };

  return {
    showRoleMgr,
    toggleRoleMgr: () => setShowRoleMgr((v) => !v),
    newRoleKey,
    setNewRoleKey,
    newRoleLabel,
    setNewRoleLabel,
    addRole,
    updateRoleLabel,
    deleteRole,
  };
}

export type RoleManagerState = ReturnType<typeof useRoleManager>;
