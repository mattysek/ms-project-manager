// Změna hesla k trezoru — FR-VAULT-09.
//
// Celý přešifrovaný obsah odchází jedním požadavkem (ADR-016), takže tenhle
// dialog může trvat déle než ostatní: PBKDF2 se počítá dvakrát a každý záznam
// se znovu zašifruje. Tlačítko proto hlásí průběh.
import { useState } from 'react';
import { MIN_VAULT_PASSWORD_LENGTH } from '../../hooks/useVault';

interface ChangeVaultPasswordDialogProps {
  onChange: (current: string, next: string) => Promise<string | null>;
  onClose: () => void;
}

export function ChangeVaultPasswordDialog({ onChange, onClose }: ChangeVaultPasswordDialogProps) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (next !== confirmation) {
      setError('Hesla se neshodují');
      return;
    }
    setSubmitting(true);
    setError(null);
    const failure = await onChange(current, next);
    setSubmitting(false);
    if (failure) setError(failure);
    else onClose();
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <PasswordField label="Stávající heslo" value={current} onChange={setCurrent} />
      <PasswordField
        label={`Nové heslo (min. ${MIN_VAULT_PASSWORD_LENGTH} znaků)`}
        value={next}
        onChange={setNext}
      />
      <PasswordField
        label="Potvrzení nového hesla"
        value={confirmation}
        onChange={setConfirmation}
      />
      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="submit" className="btn" disabled={submitting} style={PRIMARY_BUTTON}>
          {submitting ? 'Přešifrovávám…' : 'Změnit heslo'}
        </button>
        <button type="button" className="btn" onClick={onClose} style={SECONDARY_BUTTON}>
          Zrušit
        </button>
      </div>
    </form>
  );
}

function PasswordField({
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
        type="password"
        className="inp"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ width: '100%', marginTop: 4 }}
      />
    </label>
  );
}

const PRIMARY_BUTTON = {
  background: '#0d2210',
  borderColor: '#34d39966',
  color: '#6ee7b7',
  padding: '4px 14px',
  fontSize: 11,
} as const;

const SECONDARY_BUTTON = {
  background: '#161b27',
  borderColor: '#2d3748',
  color: '#94a3b8',
  padding: '4px 9px',
  fontSize: 11,
} as const;
