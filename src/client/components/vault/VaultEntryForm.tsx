// Formulář záznamu trezoru včetně generátoru hesel — FR-VAULT-04, FR-VAULT-08.
import { useId, useState } from 'react';
import type { VaultEntry } from '../../hooks/useVault';
import { DEFAULT_PASSWORD_OPTIONS, generatePassword } from '../../crypto/passwordGenerator';

/** Prázdný záznam s vlastním id — id volí klient, stejně jako u quick notes. */
function blankEntry(): Omit<VaultEntry, 'updatedAt'> {
  return {
    id: crypto.randomUUID().replace(/-/g, ''),
    title: '',
    username: '',
    password: '',
    url: '',
    note: '',
  };
}

interface VaultEntryFormProps {
  /** `undefined` = nový záznam. */
  entry?: VaultEntry;
  onSave: (entry: Omit<VaultEntry, 'updatedAt'>) => Promise<string | null>;
  onCancel: () => void;
}

export function VaultEntryForm({ entry, onSave, onCancel }: VaultEntryFormProps) {
  const [draft, setDraft] = useState<Omit<VaultEntry, 'updatedAt'>>(() => entry ?? blankEntry());
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordId = useId();

  const update = (field: keyof Omit<VaultEntry, 'id' | 'updatedAt'>, value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const failure = await onSave(draft);
    setSubmitting(false);
    if (failure) setError(failure);
    else onCancel();
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Field label="Název" value={draft.title} onChange={(value) => update('title', value)} />
      <Field
        label="Uživatelské jméno"
        value={draft.username}
        onChange={(value) => update('username', value)}
      />
      {/* Tlačítka jsou schválně VEDLE labelu, ne uvnitř něj: obalující
          `<label>` by si jejich text přibral do svého („HesloGenerovat
          heslo“), takže by pole nešlo najít podle popisku „Heslo“ —
          ani v testech, ani odečítačem obrazovky. Vazba jde přes `htmlFor`. */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <label className="auth-label" htmlFor={passwordId}>
          Heslo
        </label>
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <input
            id={passwordId}
            type={revealed ? 'text' : 'password'}
            className="inp"
            value={draft.password}
            onChange={(event) => update('password', event.target.value)}
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="btn"
            onClick={() => setRevealed((value) => !value)}
            aria-label={revealed ? 'Skrýt heslo' : 'Zobrazit heslo'}
            style={SMALL_BUTTON}
          >
            {revealed ? '🙈' : '👁'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => update('password', generatePassword(DEFAULT_PASSWORD_OPTIONS))}
            style={SMALL_BUTTON}
          >
            Generovat heslo
          </button>
        </div>
      </div>
      <Field label="URL" value={draft.url} onChange={(value) => update('url', value)} />
      <Field label="Poznámka" value={draft.note} onChange={(value) => update('note', value)} />
      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="submit" className="btn" disabled={submitting} style={PRIMARY_BUTTON}>
          {submitting ? 'Ukládám…' : 'Uložit'}
        </button>
        <button type="button" className="btn" onClick={onCancel} style={SMALL_BUTTON}>
          Zrušit
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="auth-label">
      {label}
      <input
        className="inp"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ width: '100%', marginTop: 4 }}
      />
    </label>
  );
}

const SMALL_BUTTON = {
  background: '#161b27',
  borderColor: '#2d3748',
  color: '#94a3b8',
  padding: '4px 9px',
  fontSize: 11,
} as const;

const PRIMARY_BUTTON = {
  background: '#0d2210',
  borderColor: '#34d39966',
  color: '#6ee7b7',
  padding: '4px 14px',
  fontSize: 11,
} as const;
