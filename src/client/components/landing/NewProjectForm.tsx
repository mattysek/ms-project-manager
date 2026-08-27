import { useState } from 'react';

interface NewProjectFormProps {
  onCreate: (name: string) => void;
  onCancel: () => void;
}

export function NewProjectForm({ onCreate, onCancel }: NewProjectFormProps) {
  const [name, setName] = useState('');

  const submit = () => {
    if (!name.trim()) return;
    onCreate(name.trim());
  };

  return (
    <div
      style={{
        background: '#161b27',
        border: '1px solid #1e2533',
        borderRadius: 10,
        padding: 20,
        marginBottom: 24,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          marginBottom: 12,
        }}
      >
        Nový projekt
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          className="inp"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Název projektu..."
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          style={{ flex: 1, fontSize: 13, padding: '8px 12px' }}
        />
        <button
          type="button"
          className="btn"
          onClick={submit}
          style={{ background: '#0d2210', borderColor: '#34d39966', color: '#6ee7b7' }}
        >
          Vytvořit
        </button>
        <button
          type="button"
          className="btn"
          onClick={onCancel}
          style={{ background: '#1a1a1a', borderColor: '#333', color: '#666' }}
        >
          Zrušit
        </button>
      </div>
    </div>
  );
}
