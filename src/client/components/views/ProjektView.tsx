import type { Project, Week, ChangelogEntry, Milestone } from '../../types';
import type { MemberRole } from '../../types/protocol';
import { ConfigCard } from './projekt/ConfigCard';
import { MilestonesSection } from './projekt/MilestonesSection';
import { WeekTable } from './projekt/WeekTable';
import { useMilestoneDrag } from './projekt/useMilestoneDrag';
import { useMilestoneEditing } from './projekt/useMilestoneEditing';
import { useWeeksWithHolidays } from './projekt/useWeeksWithHolidays';

interface ProjektViewProps {
  project: Project;
  updateProject: (field: keyof Project, val: string | number | ChangelogEntry[]) => void;
  changeDates: (field: 'startDate' | 'endDate', val: string) => void;
  setMilestones: (milestones: Milestone[]) => void;
  weeks: Week[];
  /**
   * Sekce „Členové projektu" (FR-ROLE-02). Předává se hotová jako uzel, ať
   * `ProjektView` nemusí znát `projectId`, roli ani přihlášeného uživatele —
   * stejný vzor jako `quickNotes` v `AuthenticatedApp`.
   */
  membersSection?: React.ReactNode;
  /** Role přihlášeného v projektu; metadata smí měnit jen PM (ADR-006). */
  role: MemberRole | null;
}

function SectionTitle() {
  return (
    <div
      style={{
        fontSize: 10,
        color: '#64748b',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        fontWeight: 700,
        marginBottom: 18,
      }}
    >
      Konfigurace projektu
    </div>
  );
}

export function ProjektView({
  project,
  updateProject,
  changeDates,
  setMilestones,
  weeks,
  membersSection,
  role,
}: ProjektViewProps) {
  const editing = useMilestoneEditing(project.milestones, setMilestones);
  const drag = useMilestoneDrag(editing.updateMilestone);
  const weeksWithHolidays = useWeeksWithHolidays(weeks);
  const totalWD = weeks.reduce((s, w) => s + w.workdays, 0);

  return (
    <div style={{ padding: '24px 28px' }}>
      {membersSection}
      <SectionTitle />
      <ConfigCard
        editable={role === 'pm'}
        project={project}
        updateProject={updateProject}
        changeDates={changeDates}
        numWeeks={weeks.length}
        totalWorkdays={totalWD}
      />
      <MilestonesSection milestones={project.milestones} weeks={weeks} editing={editing} />
      <WeekTable weeks={weeksWithHolidays} milestones={project.milestones} drag={drag} />
    </div>
  );
}
