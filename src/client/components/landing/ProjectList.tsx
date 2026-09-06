import type { ReactNode } from 'react';
import type { ProjectSummary } from '../../api/projectsApi';
import { ProjectListItem } from './ProjectListItem';

interface ProjectListProps {
  projects: ProjectSummary[];
  loading: boolean;
  onOpen: (id: string) => void;
  /** Akce pro konkrétní projekt — liší se mezi aktivními a archivem. */
  actionsFor: (project: ProjectSummary) => { label: string; title: string; onClick: () => void }[];
  emptyState?: ReactNode;
  /** Offline: které projekty nejdou otevřít, protože nemají uložený stav. */
  unavailable?: (id: string) => boolean;
}

function EmptyState() {
  return (
    <div
      style={{
        background: '#161b27',
        border: '1px dashed #2d3748',
        borderRadius: 10,
        padding: '40px 20px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 24, marginBottom: 10 }}>📁</div>
      <div style={{ color: '#475569', fontSize: 12 }}>Žádné uložené projekty</div>
      <div style={{ color: '#334155', fontSize: 11, marginTop: 8 }}>
        Vytvoř nový projekt nebo importuj existující
      </div>
    </div>
  );
}

/** Samostatná komponenta místo vnořeného ternary (ADR-012 `noNestedTernary`). */
export function ProjectList({
  projects,
  loading,
  onOpen,
  actionsFor,
  emptyState,
  unavailable,
}: ProjectListProps) {
  if (loading) {
    return <div style={{ color: '#475569', padding: 20, textAlign: 'center' }}>Načítám...</div>;
  }
  if (projects.length === 0) {
    return <>{emptyState ?? <EmptyState />}</>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {projects.map((project) => (
        <ProjectListItem
          key={project.id}
          project={project}
          onOpen={() => onOpen(project.id)}
          actions={actionsFor(project)}
          unavailable={unavailable?.(project.id)}
        />
      ))}
    </div>
  );
}
