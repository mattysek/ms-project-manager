// Založení trezoru — FR-VAULT-01.
//
// Varování o nenávratnosti je tu **před** založením, ne až v potvrzení:
// jakmile uživatel heslo zapomene, není co dělat a nikdo mu nepomůže.
import { useState } from 'react';
import { MIN_VAULT_PASSWORD_LENGTH } from '../../hooks/useVault';

interface VaultSetupFormProps {
  onCreate: (password: string, confirmation: string) => Promise<string | null>;
}

export function VaultSetupForm({ onCreate }: VaultSetupFormProps) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const failure = await onCreate(password, confirmation);
    setSubmitting(false);
    if (failure) setError(failure);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        role="note"
        style={{
          background: '#2a2010',
          border: '1px solid #fbbf2455',
          borderRadius: 6,
          padding: '8px 12px',
          fontSize: 11,
          color: '#fcd34d',
          lineHeight: 1.5,
        }}
      >
        Heslo k trezoru zná jen vy — na server se neposílá. Když ho zapomenete, obsah trezoru je
        nenávratně ztracen a nelze ho obnovit ani resetovat.
      </div>
      <label className="auth-label">
        Heslo k trezoru (min. {MIN_VAULT_PASSWORD_LENGTH} znaků)
        <input
          type="password"
          className="inp"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          style={{ width: '100%', marginTop: 4 }}
        />
      </label>
      <label className="auth-label">
        Potvrzení hesla
        <input
          type="password"
          className="inp"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          style={{ width: '100%', marginTop: 4 }}
        />
      </label>
      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}
      <button type="submit" className="btn" disabled={submitting} style={PRIMARY_BUTTON}>
        {submitting ? 'Zakládám…' : 'Založit trezor'}
      </button>
    </form>
  );
}

const PRIMARY_BUTTON = {
  background: '#0d2210',
  borderColor: '#34d39966',
  color: '#6ee7b7',
  padding: '8px 0',
  fontSize: 12,
} as const;
