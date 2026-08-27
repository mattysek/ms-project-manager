// Přihlašovací stránka — FR-AUTH-01, FR-AUTH-03.
import { useState } from 'react';
import { AuthShell } from './AuthShell';

interface LoginPageProps {
  onLogin: (userName: string, password: string) => Promise<string | null>;
  onLoggedIn: () => void;
  /** FR-AUTH-03: informace po vypršení session, nikoli chyba přihlášení. */
  sessionExpiredNotice?: boolean;
}

export function LoginPage({ onLogin, onLoggedIn, sessionExpiredNotice }: LoginPageProps) {
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const failure = await onLogin(userName, password);
    setSubmitting(false);
    if (failure) setError(failure);
    else onLoggedIn();
  };

  return (
    <AuthShell title="Přihlášení">
      {sessionExpiredNotice && !error && (
        <div className="auth-notice" role="status">
          Vaše session vypršela, přihlaste se znovu
        </div>
      )}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label className="auth-label">
          Uživatelské jméno
          <input
            className="inp"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            // biome-ignore lint/a11y/noAutofocus: přihlašovací formulář, první pole má dostat fokus hned
            autoFocus
            style={{ width: '100%', marginTop: 4 }}
          />
        </label>
        <label className="auth-label">
          Heslo
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
          disabled={submitting || !userName || !password}
          style={{
            background: '#0d2210',
            borderColor: '#34d39966',
            color: '#6ee7b7',
            padding: '9px 0',
            fontSize: 12,
          }}
        >
          Přihlásit se
        </button>
      </form>
    </AuthShell>
  );
}
