// Odemčení trezoru — FR-VAULT-02.
import { useState } from 'react';

interface VaultUnlockFormProps {
  onUnlock: (password: string) => Promise<string | null>;
  onDestroy: () => void;
}

export function VaultUnlockForm({ onUnlock, onDestroy }: VaultUnlockFormProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const failure = await onUnlock(password);
    setSubmitting(false);
    // Heslo se po neúspěchu zahazuje — ať v poli nezůstane viset.
    if (failure) {
      setError(failure);
      setPassword('');
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label className="auth-label">
        Heslo k trezoru
        <input
          type="password"
          className="inp"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          style={{ width: '100%', marginTop: 4 }}
        />
      </label>
      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}
      <button
        type="submit"
        className="btn"
        disabled={submitting || !password}
        style={{
          background: '#0d1f38',
          borderColor: '#4f9cf966',
          color: '#93c5fd',
          padding: '8px 0',
        }}
      >
        {submitting ? 'Odemykám…' : 'Odemknout'}
      </button>
      <button
        type="button"
        onClick={onDestroy}
        style={{
          background: 'none',
          border: 'none',
          color: '#64748b',
          cursor: 'pointer',
          fontSize: 10,
          textDecoration: 'underline',
        }}
      >
        Zapomněli jste heslo? Zrušit trezor
      </button>
    </form>
  );
}
