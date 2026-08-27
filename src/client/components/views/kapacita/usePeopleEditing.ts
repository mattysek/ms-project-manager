// Editace osob a jejich týdenní alokace.
import { useState } from 'react';
import type { Person, Roles, Week } from '../../../types';
import { PERSON_COLORS } from '../../../constants';
import { uid } from '../../../utils';

const ALLOC_RANGE_ERROR = 'Alokace musí být mezi 0 a 100';

export function usePeopleEditing(
  rawPeople: Person[],
  setRawPeople: React.Dispatch<React.SetStateAction<Person[]>>,
  roles: Roles,
  weeks: Week[]
) {
  const [allocError, setAllocError] = useState<string | null>(null);

  const updateAlloc = (pid: string, wIdx: number, val: string) => {
    const num = Number(val);
    if (val.trim() === '' || Number.isNaN(num) || num < 0 || num > 100) {
      setAllocError(ALLOC_RANGE_ERROR);
      return; // řízený input se sám vrátí na předchozí hodnotu (stav se nemění)
    }
    setAllocError(null);
    setRawPeople((prev) =>
      prev.map((p) =>
        p.id === pid ? { ...p, weekAlloc: p.weekAlloc.map((a, i) => (i === wIdx ? num : a)) } : p
      )
    );
  };

  const updatePerson = (pid: string, f: keyof Person, v: string) =>
    setRawPeople((prev) => prev.map((p) => (p.id === pid ? { ...p, [f]: v } : p)));

  /**
   * Přiřazení osoby k uživatelskému účtu (FR-ROLE-07, ADR-006 doplněk).
   *
   * Vlastní funkce, ne `updatePerson(pid, 'userId', v)`: hodnota smí být
   * `null` („osoba bez účtu"), kdežto `updatePerson` bere `string`. Na wire
   * je ten rozdíl podstatný — `PersonFields.UserId` je vnořeně volitelný,
   * takže chybějící klíč znamená „nesahat", zatímco `null` vazbu ruší.
   *
   * Spolu s účtem se přebírá i **jméno z účtu**. Řádek vzniká jako „Nový člen"
   * a nechat ho tak po spárování s konkrétním člověkem nedává smysl — jméno
   * osoby je pak jediné místo, kde se přepisuje ručně to, co systém už zná.
   * Obojí jde jednou změnou stavu, takže odejde jeden `update_person`.
   *
   * Zrušení vazby jméno **nemění**: osoba v plánu zůstává, jen ji nikdo
   * nevlastní — vyprázdnit jí jméno by byla ztráta dat.
   */
  const updateAccount = (pid: string, userId: string | null, displayName?: string) =>
    setRawPeople((prev) =>
      prev.map((p) => {
        if (p.id !== pid) return p;
        return userId && displayName ? { ...p, userId, name: displayName } : { ...p, userId };
      })
    );

  const removePerson = (pid: string) => {
    const person = rawPeople.find((p) => p.id === pid);
    if (!person) return;
    const confirmed = window.confirm(
      `Opravdu odebrat ${person.name} z projektu? Přiřazené úkoly přejdou do backlogu.`
    );
    if (!confirmed) return;
    // Přesun úkolů do backlogu dělá server v rámci `delete_person` a pošle ho
    // jako `task_updated` diffy — kdyby to dosílal klient, stačil by zavřený
    // tab a úkoly by zůstaly viset na neexistující osobě.
    setRawPeople((prev) => prev.filter((p) => p.id !== pid));
  };

  const addPerson = () => {
    setRawPeople((prev) => [
      ...prev,
      {
        id: uid(),
        // Nový řádek je neobsazená pozice — účet se k ní přiřazuje až později
        // (ADR-006). `null` musí být v JSONu doopravdy, ne jen chybět.
        userId: null,
        name: 'Nový člen',
        role: Object.keys(roles)[0] || 'BE',
        color: PERSON_COLORS[rawPeople.length % PERSON_COLORS.length],
        weekAlloc: Array(weeks.length).fill(100),
      },
    ]);
  };

  return { allocError, updateAlloc, updatePerson, updateAccount, removePerson, addPerson };
}

export type PeopleEditing = ReturnType<typeof usePeopleEditing>;
