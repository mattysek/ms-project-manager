import type { ProjectSummary } from '../../api/projectsApi';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface ProjectListItemProps {
  project: ProjectSummary;
  onOpen: () => void;
  /** Akce vpravo od projektu. V archivu jiné než u aktivních. */
  actions: { label: string; title: string; onClick: () => void }[];
  /**
   * Offline a bez uloženého stavu — projekt je v seznamu z cache, ale otevřít
   * ho nejde. Zůstává vidět schválně: zmizet by vypadalo jako smazaný.
   */
  unavailable?: boolean;
}

// Otevírací akce je `<button>`, ne `<div role="button">` (Biome
// `useSemanticElements`) — mazací tlačítko proto musí být SOURozenec, ne
// potomek (`<button>` uvnitř `<button>` je neplatné HTML).
export function ProjectListItem({ project, onOpen, actions, unavailable }: ProjectListItemProps) {
  return (
    <div
      className="project-card"
      style={{
        background: '#0c1018',
        border: '1px solid #1e2533',
        borderRadius: 10,
        display: 'flex',
        alignItems: 'stretch',
        gap: 16,
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          font: 'inherit',
          color: 'inherit',
          padding: '16px 0 16px 20px',
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: unavailable ? '#475569' : '#4f9cf9',
              marginBottom: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {project.name}
            {unavailable && (
              <span style={{ fontSize: 9, color: '#64748b', fontWeight: 400 }}>
                ⚡ není uložený offline
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: '#475569', display: 'flex', gap: 16 }}>
            <span>
              {project.startDate && project.endDate
                ? `${project.startDate} → ${project.endDate}`
                : 'Datumy nenastaveny'}
            </span>
            <span>{project.peopleCount} členů</span>
            <span>{project.taskCount} úkolů</span>
            <span>{project.budget} MD</span>
          </div>
        </div>
        <div style={{ fontSize: 9, color: '#334155', textAlign: 'right', minWidth: 100 }}>
          <div>Upraveno</div>
          <div style={{ color: '#475569' }}>{formatDate(project.updatedAt)}</div>
        </div>
      </button>
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          className="btn"
          onClick={action.onClick}
          title={action.title}
          aria-label={`${action.title} — ${project.name}`}
          style={{
            alignSelf: 'center',
            background: 'transparent',
            border: '1px solid #2d3748',
            color: '#475569',
            padding: '4px 8px',
            fontSize: 12,
            marginRight: 8,
          }}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
