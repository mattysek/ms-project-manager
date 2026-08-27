import type { Person, PersonWithWeeks, Task, Week, MonthGroup, Roles } from '../../types';
import type { Member } from '../../api/membersApi';
import type { MemberRole } from '../../types/protocol';
import { CapacityTable } from './kapacita/CapacityTable';
import { PersonCards, RoleCapacity } from './kapacita/CapacitySummary';
import { RoleManager } from './kapacita/RoleManager';
import { useCapacityTotals } from './kapacita/useCapacityTotals';
import { useWeeklyLoad } from './kapacita/useWeeklyLoad';
import { OverloadSummary } from './kapacita/OverloadSummary';
import { usePeopleEditing } from './kapacita/usePeopleEditing';
import { useRoleManager } from './kapacita/useRoleManager';

interface KapacitaViewProps {
  rawPeople: Person[];
  setRawPeople: React.Dispatch<React.SetStateAction<Person[]>>;
  people: PersonWithWeeks[];
  tasks: Task[];
  weeks: Week[];
  monthGroups: MonthGroup[];
  budget: number;
  roles: Roles;
  setRoles: React.Dispatch<React.SetStateAction<Roles>>;
  /** PM smí vše, Dev jen vlastní alokaci (ADR-006). `null` = role zatím nenačtena, chová se restriktivně. */
  role: MemberRole | null;
  /** Id přihlášeného uživatele — porovnává se s `Person.userId` (ADR-006 doplněk). */
  currentUserId: string | null;
  /**
   * Členové projektu — nabídka pro přiřazení účtu k osobě (FR-ROLE-07).
   *
   * Chodí sem hotový seznam, ne `projectId`: view zůstává prezentační
   * a o REST vrstvě nic neví, stejně jako `membersSection` v `ProjektView`.
   */
  members: Member[];
}

export function KapacitaView({
  rawPeople,
  setRawPeople,
  people,
  tasks,
  weeks,
  monthGroups,
  budget,
  roles,
  setRoles,
  role,
  currentUserId,
  members,
}: KapacitaViewProps) {
  const editing = usePeopleEditing(rawPeople, setRawPeople, roles, weeks);
  const roleMgr = useRoleManager(roles, setRoles, rawPeople, setRawPeople);
  const totals = useCapacityTotals(people, tasks, weeks, roles);
  const weeklyLoad = useWeeklyLoad(people, tasks, weeks);

  // Dev smí editovat jen řádek osoby namapované na jeho vlastní účet (ADR-006
  // doplněk); dokud role není známá, chováme se restriktivně jako Dev.
  const canEditAlloc = (person: PersonWithWeeks): boolean =>
    role === 'pm' || (!!person.userId && person.userId === currentUserId);

  return (
    <div style={{ padding: '20px 28px' }}>
      {/* Správa rolí nahoře — konzistentní se správcem kategorií v Seznamu. */}
      <RoleManager roles={roles} people={people} state={roleMgr} />
      <OverloadSummary weeks={weeks} overloadedWeeks={weeklyLoad.overloadedWeeks} />
      <CapacityTable
        people={people}
        weeks={weeks}
        monthGroups={monthGroups}
        roles={roles}
        budget={budget}
        role={role}
        totals={totals}
        weeklyLoad={weeklyLoad}
        members={members}
        editing={editing}
        canEditAlloc={canEditAlloc}
      />
      <PersonCards people={people} roles={roles} personDemand={totals.personDemand} />
      <RoleCapacity roles={roles} people={people} roleAvail={totals.roleAvail} />
    </div>
  );
}
