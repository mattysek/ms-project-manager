// První spuštění — vytvoření admin účtu (FR-AUTH-07).
import { useState } from 'react';
import { AuthShell } from './AuthShell';
import * as authApi from '../../api/authApi';
import type { CurrentUser } from '../../api/authApi';

interface SetupPageProps {
  onCreated: (user: CurrentUser) => void;
}

export function SetupPage({ onCreated }: SetupPageProps) {
  const [userName, setUserName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const user = await authApi.setupAdmin(userName, displayName, password);
      onCreated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vytvoření účtu se nezdařilo');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title="Vytvoření administrátorského účtu">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label className="auth-label">
          Uživatelské jméno
          <input
            className="inp"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            // biome-ignore lint/a11y/noAutofocus: formulář prvního spuštění, první pole má dostat fokus hned
            autoFocus
            style={{ width: '100%', marginTop: 4 }}
          />
        </label>
        <label className="auth-label">
          Display name
          <input
            className="inp"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={{ width: '100%', marginTop: 4 }}
          />
        </label>
        <label className="auth-label">
          Heslo (min. 8 znaků)
          <input
            type="password"
            className="inp"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          disabled={submitting || !userName || !displayName || !password}
          style={{
            background: '#0d2210',
            borderColor: '#34d39966',
            color: '#6ee7b7',
            padding: '9px 0',
            fontSize: 12,
          }}
        >
          Vytvořit
        </button>
      </form>
    </AuthShell>
  );
}
