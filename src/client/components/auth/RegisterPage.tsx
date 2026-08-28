// Samoobslužná registrace — FR-AUTH-08, ADR-003 (doplněk).
//
// Formulář je vědomě skoro totožný se `SetupPage`, ale je to vlastní
// komponenta: setup zakládá **admina** do prázdné databáze a běží jednou za
// život instance, registrace zakládá běžný účet do rozběhnutého systému.
// Sloučit je by znamenalo, že úprava jednoho tiše mění i to druhé.
import { useState } from 'react';
import { AuthShell } from './AuthShell';
import * as authApi from '../../api/authApi';
import type { CurrentUser } from '../../api/authApi';

interface RegisterPageProps {
  /** `false` → server registraci nepovolí, formulář se ani nenabízí. */
  allowed: boolean;
  onRegistered: (user: CurrentUser) => void;
  onBackToLogin: () => void;
}

export function RegisterPage({ allowed, onRegistered, onBackToLogin }: RegisterPageProps) {
  const [userName, setUserName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // `onRegistered` přepne bránu na přihlášenou aplikaci, takže se komponenta
  // odmontuje — `setSubmitting(false)` proto patří jen do chybové větve.
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirmation) {
      setError('Hesla se neshodují');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      onRegistered(await authApi.register(userName, displayName, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registrace se nezdařila');
      setSubmitting(false);
    }
  };

  if (!allowed) {
    return (
      <AuthShell title="Registrace">
        <div className="auth-notice" role="status">
          Registrace nových účtů není povolená. Požádejte administrátora, aby vám účet založil.
        </div>
        <BackToLogin onClick={onBackToLogin} />
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Registrace nového účtu">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Uživatelské jméno" value={userName} onChange={setUserName} autoFocus />
        <Field label="Display name" value={displayName} onChange={setDisplayName} />
        <Field
          label="Heslo (min. 8 znaků)"
          value={password}
          onChange={setPassword}
          type="password"
        />
        <Field
          label="Potvrzení hesla"
          value={confirmation}
          onChange={setConfirmation}
          type="password"
        />
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
          {submitting ? 'Zakládám účet…' : 'Zaregistrovat se'}
        </button>
        <BackToLogin onClick={onBackToLogin} />
      </form>
    </AuthShell>
  );
}

function BackToLogin({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        color: '#64748b',
        cursor: 'pointer',
        fontSize: 11,
        textDecoration: 'underline',
        fontFamily: 'inherit',
      }}
    >
      Zpět na přihlášení
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  type,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="auth-label">
      {label}
      <input
        type={type}
        className="inp"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        // biome-ignore lint/a11y/noAutofocus: registrační formulář, první pole má dostat fokus hned
        autoFocus={autoFocus}
        style={{ width: '100%', marginTop: 4 }}
      />
    </label>
  );
}
