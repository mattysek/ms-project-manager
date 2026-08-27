import { useMemo } from 'react';
import type {
  ChangelogEntry,
  Opportunity,
  Person,
  Project,
  Risk,
  Roles,
  Task,
  Week,
} from '../../types';
import type { MemberRole } from '../../types/protocol';
import { AutoWarningsSection } from './rizika/AutoWarningsSection';
import { ChangelogSection } from './rizika/changelog/ChangelogSection';
import { NotesSection } from './rizika/NotesSection';
import { OpportunitiesSection } from './rizika/OpportunitiesSection';
import { RisksSection } from './rizika/RisksSection';
import { StatusReportSection } from './rizika/StatusReportSection';
import { useAutoWarnings } from './rizika/useAutoWarnings';
import { useRiskOpportunityEditing } from './rizika/useRiskOpportunityEditing';

interface RizikaViewProps {
  risks: Risk[];
  setRisks: React.Dispatch<React.SetStateAction<Risk[]>>;
  opps: Opportunity[];
  setOpps: React.Dispatch<React.SetStateAction<Opportunity[]>>;
  project: Project;
  updateProject: (field: keyof Project, val: string | number | ChangelogEntry[]) => void;
  people: Person[];
  tasks: Task[];
  weeks: Week[];
  roles: Roles;
  /** Rizika/příležitosti/poznámky/changelog smí měnit jen PM (PRD-03 FR-ROLE-01). */
  role: MemberRole | null;
  /** Klíč konceptu statusové zprávy — koncept se nesmí přenášet mezi projekty. */
  projectId: string;
  overallProgress: number;
}

const SEVERITY_ORDER: Record<Risk['sev'], number> = { high: 0, med: 1, low: 2 };

export function RizikaView({
  risks,
  setRisks,
  opps,
  setOpps,
  project,
  updateProject,
  people,
  tasks,
  weeks,
  roles,
  role,
  overallProgress,
  projectId,
}: RizikaViewProps) {
  const canWrite = role === 'pm';
  const { risk: riskEditing, opp: oppEditing } = useRiskOpportunityEditing(setRisks, setOpps);

  const sortedRisks = useMemo(
    () => [...risks].sort((a, b) => SEVERITY_ORDER[a.sev] - SEVERITY_ORDER[b.sev]),
    [risks]
  );
  const autoWarnings = useAutoWarnings({ people, tasks, weeks, roles });

  return (
    <div style={{ padding: '20px 28px' }}>
      {/* ── NOTES & CHANGELOG ── */}
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 28 }}>
        <div style={{ flex: '1 1 400px', minWidth: 320 }}>
          <NotesSection notes={project.notes} updateProject={updateProject} role={role} />
        </div>
        <div style={{ flex: '1 1 400px', minWidth: 320 }}>
          <ChangelogSection
            changelog={project.changelog}
            updateProject={updateProject}
            role={role}
          />
        </div>
      </div>

      {/* ── STATUSOVÁ ZPRÁVA ── */}
      <StatusReportSection
        risks={risks}
        opps={opps}
        overallProgress={overallProgress}
        projectId={projectId}
      />

      {/* ── RISKS & OPPORTUNITIES ── */}
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <RisksSection
          sortedRisks={sortedRisks}
          canWrite={canWrite}
          role={role}
          editing={riskEditing}
        />
        <OpportunitiesSection opps={opps} canWrite={canWrite} role={role} editing={oppEditing} />
      </div>

      {/* ── AUTO WARNINGS ── */}
      <AutoWarningsSection warnings={autoWarnings} />
    </div>
  );
}
