// Rám modalu — hlavička se štítkem osoby, patička s akcemi a scoped styly Markdownu.
import type { PersonWithWeeks, Task } from '../../types';

/**
 * „Naposledy změnil" v patičce. Razítko plní server u každé mutace; u úkolů
 * založených dřív chybí, proto se komponenta umí nevykreslit.
 */
export function LastEdited({ task }: { task: Task }) {
  if (!task.updatedBy) return null;
  const when = task.updatedAt
    ? new Date(task.updatedAt).toLocaleString('cs-CZ', {
        day: 'numeric',
        month: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;
  return (
    <span style={{ fontSize: 10, color: '#64748b' }}>
      Naposledy změnil {task.updatedBy}
      {when ? `, ${when}` : ''}
    </span>
  );
}

export function ModalHeader({
  editedTask,
  currentPerson,
  onClose,
}: {
  editedTask: Task;
  currentPerson: PersonWithWeeks | undefined;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        padding: '14px 20px',
        borderBottom: '1px solid #1e2533',
        background: '#161b27',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>Detail úkolu</span>
      {currentPerson && (
        <span
          style={{
            fontSize: 10,
            padding: '2px 8px',
            background: `${currentPerson.color}22`,
            border: `1px solid ${currentPerson.color}44`,
            borderRadius: 4,
            color: currentPerson.color,
          }}
        >
          {currentPerson.name}
        </span>
      )}
      {!editedTask.p && (
        <span
          style={{
            fontSize: 10,
            padding: '2px 8px',
            background: '#64748b22',
            border: '1px solid #64748b44',
            borderRadius: 4,
            color: '#64748b',
          }}
        >
          Backlog
        </span>
      )}
      <button
        type="button"
        onClick={onClose}
        style={{
          marginLeft: 'auto',
          background: 'none',
          border: 'none',
          color: '#64748b',
          cursor: 'pointer',
          fontSize: 18,
          padding: '4px 8px',
          borderRadius: 4,
          transition: 'color .15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
      >
        ✕
      </button>
    </div>
  );
}

export function ModalFooter({
  task,
  onDelete,
  onClose,
  onSave,
}: {
  task: Task;
  onDelete: (() => void) | undefined;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div
      style={{
        padding: '12px 20px',
        borderTop: '1px solid #1e2533',
        background: '#161b27',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      {onDelete && (
        <button
          type="button"
          onClick={() => {
            if (confirm(`Opravdu smazat úkol ${task.name}?`)) {
              onDelete();
              onClose();
            }
          }}
          className="btn"
          style={{
            padding: '6px 14px',
            fontSize: 10,
            background: '#2a0a0a',
            borderColor: '#f8717155',
            color: '#f87171',
          }}
        >
          Smazat úkol
        </button>
      )}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <LastEdited task={task} />
      </div>
      <button
        type="button"
        onClick={onClose}
        className="btn"
        style={{
          padding: '6px 16px',
          fontSize: 10,
          background: '#1a1a2e',
          borderColor: '#475569',
          color: '#94a3b8',
        }}
      >
        Zrušit
      </button>
      <button
        type="button"
        onClick={onSave}
        className="btn"
        style={{
          padding: '6px 20px',
          fontSize: 10,
          background: '#0d2210',
          borderColor: '#34d39966',
          color: '#6ee7b7',
          fontWeight: 600,
        }}
      >
        Uložit změny
      </button>
    </div>
  );
}
