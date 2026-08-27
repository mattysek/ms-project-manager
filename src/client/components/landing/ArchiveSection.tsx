// Archiv projektů na LandingPage.
//
// Archiv je vědomě až pod aktivními projekty a při prázdném archivu se
// nezobrazuje vůbec — dokud tým nic neukončil, nemá mu překážet ve výhledu.
// Trvalé smazání je dostupné **jen odsud**: server ho nad neahrchivovaným
// projektem odmítne (project-management.feature).
import { useState } from 'react';
import type { ProjectSummary } from '../../api/projectsApi';
import { ProjectList } from './ProjectList';

interface ArchiveSectionProps {
  archived: ProjectSummary[];
  onOpen: (id: string) => void;
  onUnarchive: (id: string) => void;
  onRequestDelete: (id: string) => void;
}

export function ArchiveSection({
  archived,
  onOpen,
  onUnarchive,
  onRequestDelete,
}: ArchiveSectionProps) {
  const [expanded, setExpanded] = useState(false);

  if (archived.length === 0) return null;

  return (
    <div style={{ marginTop: 28 }}>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          marginBottom: 12,
          fontSize: 10,
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {expanded ? '▾' : '▸'} Archiv ({archived.length})
      </button>

      {expanded && (
        <ProjectList
          projects={archived}
          loading={false}
          onOpen={onOpen}
          actionsFor={(project) => [
            {
              label: '↩',
              title: 'Vrátit z archivu',
              onClick: () => onUnarchive(project.id),
            },
            {
              label: '✕',
              title: 'Smazat trvale',
              onClick: () => onRequestDelete(project.id),
            },
          ]}
        />
      )}
    </div>
  );
}
