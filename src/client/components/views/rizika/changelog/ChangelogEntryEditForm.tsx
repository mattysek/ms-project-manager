interface ChangelogEntryEditFormProps {
  editText: string;
  onChangeText: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

/** Editační formulář jednoho záznamu changelogu — Ctrl+Enter uloží, Escape zruší. */
export function ChangelogEntryEditForm({
  editText,
  onChangeText,
  onSave,
  onCancel,
}: ChangelogEntryEditFormProps) {
  return (
    <div style={{ flex: 1, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <textarea
        className="inp"
        value={editText}
        onChange={(e) => onChangeText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onSave();
          }
          if (e.key === 'Escape') onCancel();
        }}
        style={{ flex: 1, fontSize: 11, minHeight: 50, resize: 'vertical' }}
        // biome-ignore lint/a11y/noAutofocus: uživatel právě otevřel editaci jednoho komentáře
        autoFocus
      />
      <button
        type="button"
        className="btn"
        onClick={onSave}
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
        onClick={onCancel}
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
