// Seznam výkazů seskupený po dnech s mezisoučty (FR-WL-07).
//
// Běžící činnost je nahoře a místo konce jí roste čas — bez toho by vypadala
// jako záznam bez konce, tedy jako chyba dat.
import type { WorkLogEntry } from '../../api/worklogApi';
import {
  NO_PROJECT_LABEL,
  durationMs,
  formatDuration,
  groupByDay,
  isRunning,
  localTime,
} from '../../utils/worklog';

interface EntryListProps {
  entries: WorkLogEntry[];
  now: number;
  projectNames: Map<string, string>;
  onEdit: (entry: WorkLogEntry) => void;
  onDelete: (entry: WorkLogEntry) => void;
}

const DAY_FORMAT = new Intl.DateTimeFormat('cs-CZ', {
  weekday: 'short',
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
});

function formatDay(day: string): string {
  return DAY_FORMAT.format(new Date(`${day}T00:00:00`));
}

function TagChips({ tags }: { tags: string[] }) {
  return (
    <>
      {tags.map((tag) => (
        <span
          key={tag}
          style={{
            background: '#0d1a2a',
            border: '1px solid #2d3748',
            borderRadius: 999,
            padding: '1px 7px',
            fontSize: 9,
            color: '#bfdbfe',
          }}
        >
          {tag}
        </span>
      ))}
    </>
  );
}

function EntryRow({
  entry,
  now,
  projectName,
  onEdit,
  onDelete,
}: {
  entry: WorkLogEntry;
  now: number;
  projectName: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const running = isRunning(entry);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 10px',
        borderTop: '1px solid #1e253366',
        fontSize: 11,
      }}
    >
      <span style={{ color: '#64748b', minWidth: 96 }}>
        {localTime(entry.startedAt)} – {entry.endedAt ? localTime(entry.endedAt) : '…'}
      </span>
      <span style={{ flex: 1, color: '#e2e8f0' }}>{entry.title}</span>
      <TagChips tags={entry.tags} />
      <span style={{ color: '#64748b', minWidth: 130 }}>{projectName}</span>
      {/* Popis jde přes `title`, ne `aria-label`: ten na holém `<span>` není
          platný (jeho implicitní role ho nepodporuje) a Biome to hlídá. */}
      <span
        style={{ color: running ? '#34d399' : '#94a3b8', minWidth: 56, textAlign: 'right' }}
        title={running ? `Běží — ${formatDuration(durationMs(entry, now))}` : undefined}
      >
        {running ? '⏱ ' : ''}
        {formatDuration(durationMs(entry, now))}
      </span>
      <button
        type="button"
        className="btn btn-icon"
        onClick={onEdit}
        aria-label={`Upravit ${entry.title}`}
      >
        ✎
      </button>
      <button
        type="button"
        className="btn btn-icon btn-danger"
        onClick={onDelete}
        aria-label={`Smazat ${entry.title}`}
      >
        🗑
      </button>
    </div>
  );
}

export function EntryList({ entries, now, projectNames, onEdit, onDelete }: EntryListProps) {
  const groups = groupByDay(entries, now);

  if (groups.length === 0) {
    return <div style={{ color: '#64748b', fontSize: 11, padding: 12 }}>Žádné záznamy.</div>;
  }

  return (
    <div>
      {groups.map((group) => (
        <div key={group.day} style={{ marginBottom: 14 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '6px 10px',
              background: '#111827',
              border: '1px solid #1e2533',
              borderRadius: '8px 8px 0 0',
              fontSize: 11,
              color: '#94a3b8',
            }}
          >
            <span>{formatDay(group.day)}</span>
            <span title={`Součet za ${formatDay(group.day)}`} style={{ color: '#e2e8f0' }}>
              {formatDuration(group.totalMs)}
            </span>
          </div>
          <div
            style={{ border: '1px solid #1e2533', borderTop: 'none', borderRadius: '0 0 8px 8px' }}
          >
            {group.entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                now={now}
                projectName={
                  entry.projectId
                    ? (projectNames.get(entry.projectId) ?? entry.projectId)
                    : NO_PROJECT_LABEL
                }
                onEdit={() => onEdit(entry)}
                onDelete={() => onDelete(entry)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
