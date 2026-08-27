// Jeden řádek seznamu TODO (todo-reminders.feature).
import type { TodoItem } from '../../../types';
import { renderTextWithLinks, formatDate } from './textHelpers';

// ── TODO ITEM ROW ─────────────────────────────────────────────────────────────

interface TodoItemRowProps {
  t: TodoItem;
  isEditing: boolean;
  editText: string;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onStartEdit: (t: TodoItem) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditTextChange: (text: string) => void;
}

const SMALL_BTN: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #2d3748',
  color: '#475569',
  padding: '2px 6px',
  fontSize: 10,
};

/** Rozepsaná položka — Ctrl+Enter uloží, Escape zruší. */
function EditRow({
  editText,
  onEditTextChange,
  onSaveEdit,
  onCancelEdit,
}: Pick<TodoItemRowProps, 'editText' | 'onEditTextChange' | 'onSaveEdit' | 'onCancelEdit'>) {
  return (
    <div style={{ flex: 1, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <textarea
        className="inp"
        value={editText}
        onChange={(e) => onEditTextChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onSaveEdit();
          }
          if (e.key === 'Escape') onCancelEdit();
        }}
        style={{ flex: 1, fontSize: 11, minHeight: 50, resize: 'vertical' }}
        // biome-ignore lint/a11y/noAutofocus: uživatel právě otevřel editaci jedné položky
        autoFocus
      />
      <button
        type="button"
        className="btn"
        onClick={onSaveEdit}
        style={{
          background: '#0d2210',
          borderColor: '#34d39966',
          color: '#6ee7b7',
          padding: '2px 8px',
          fontSize: 10,
        }}
      >
        ✓
      </button>
      <button
        type="button"
        className="btn"
        onClick={onCancelEdit}
        style={{
          background: '#1a1a1a',
          borderColor: '#333',
          color: '#666',
          padding: '2px 8px',
          fontSize: 10,
        }}
      >
        ✕
      </button>
    </div>
  );
}

function DisplayRow({
  t,
  onDelete,
  onStartEdit,
}: Pick<TodoItemRowProps, 't' | 'onDelete' | 'onStartEdit'>) {
  return (
    <>
      <div
        style={{
          flex: 1,
          fontSize: 11,
          color: t.completed ? '#475569' : '#e2e8f0',
          textDecoration: t.completed ? 'line-through' : 'none',
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          userSelect: 'text',
          cursor: 'text',
        }}
      >
        {renderTextWithLinks(t.title)}
      </div>
      <span style={{ fontSize: 9, color: '#334155', flexShrink: 0 }}>
        {formatDate(t.createdAt)}
      </span>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <button
          type="button"
          className="btn"
          onClick={() => onStartEdit(t)}
          style={SMALL_BTN}
          title="Upravit"
        >
          ✎
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => onDelete(t.id)}
          style={SMALL_BTN}
          title="Smazat"
        >
          ✕
        </button>
      </div>
    </>
  );
}

export function TodoItemRow({
  t,
  isEditing,
  editText,
  onToggle,
  onDelete,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditTextChange,
}: TodoItemRowProps) {
  return (
    <div
      style={{
        padding: '10px 12px',
        borderBottom: '1px solid #1e253344',
        background: t.completed ? '#0a1210' : 'transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <input
          type="checkbox"
          checked={t.completed}
          onChange={() => onToggle(t.id)}
          style={{ cursor: 'pointer', width: 16, height: 16, marginTop: 2, flexShrink: 0 }}
        />
        {isEditing ? (
          <EditRow
            editText={editText}
            onEditTextChange={onEditTextChange}
            onSaveEdit={onSaveEdit}
            onCancelEdit={onCancelEdit}
          />
        ) : (
          <DisplayRow t={t} onDelete={onDelete} onStartEdit={onStartEdit} />
        )}
      </div>
    </div>
  );
}
