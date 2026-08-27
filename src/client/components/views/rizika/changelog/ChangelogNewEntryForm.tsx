import type { MemberRole } from '../../../../types/protocol';
import { PermissionGate } from '../../../PermissionGate';

interface ChangelogNewEntryFormProps {
  role: MemberRole | null;
  draft: string;
  onChange: (value: string) => void;
  onAdd: () => void;
}

/** Vstupní pole pro nový záznam changelogu — Ctrl+Enter přidá stejně jako tlačítko. */
export function ChangelogNewEntryForm({
  role,
  draft,
  onChange,
  onAdd,
}: ChangelogNewEntryFormProps) {
  return (
    <div
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid #1e253366',
        display: 'flex',
        gap: 8,
      }}
    >
      <textarea
        className="inp"
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onAdd();
          }
        }}
        placeholder="Nový záznam...&#10;Ctrl+Enter pro přidání"
        style={{ flex: 1, fontSize: 11, minHeight: 50, resize: 'vertical' }}
      />
      <PermissionGate role={role} require="pm">
        <button
          type="button"
          className="btn"
          onClick={onAdd}
          disabled={!draft.trim()}
          style={{
            background: draft.trim() ? '#0d2210' : '#161b27',
            borderColor: draft.trim() ? '#34d39966' : '#2d3748',
            color: draft.trim() ? '#6ee7b7' : '#475569',
            padding: '4px 12px',
            cursor: draft.trim() ? 'pointer' : 'not-allowed',
            alignSelf: 'flex-start',
          }}
        >
          + Přidat záznam
        </button>
      </PermissionGate>
    </div>
  );
}
