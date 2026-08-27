import { LinkifiedText } from './LinkifiedText';

interface ChangelogEntryDisplayProps {
  text: string;
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

/** Needitující zobrazení jednoho záznamu — text s odkazy + ikony editace/smazání pro PM. */
export function ChangelogEntryDisplay({
  text,
  canWrite,
  onEdit,
  onDelete,
}: ChangelogEntryDisplayProps) {
  return (
    <>
      <div
        style={{
          flex: 1,
          fontSize: 11,
          color: '#e2e8f0',
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          userSelect: 'text',
          cursor: 'text',
        }}
      >
        <LinkifiedText text={text} />
      </div>
      {canWrite && (
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            className="btn"
            onClick={onEdit}
            style={{
              background: 'transparent',
              border: '1px solid #2d3748',
              color: '#475569',
              padding: '2px 6px',
              fontSize: 10,
            }}
            title="Upravit"
          >
            ✎
          </button>
          <button
            type="button"
            className="btn"
            onClick={onDelete}
            style={{
              background: 'transparent',
              border: '1px solid #2d3748',
              color: '#475569',
              padding: '2px 6px',
              fontSize: 10,
            }}
            title="Smazat"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
