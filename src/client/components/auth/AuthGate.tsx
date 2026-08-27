// Kořenová brána aplikace — FR-AUTH-01, FR-AUTH-03, FR-AUTH-07.
//
// Dokud není jasné, jestli je DB prázdná (setup) a jestli je uživatel
// přihlášený, nic dalšího se nerenderuje. URL se při nepřihlášení NEMĚNÍ —
// `AuthenticatedApp` čte `currentProjectId` z `window.location.pathname` až
// po přihlášení, takže hluboký odkaz (`/projects/abc123`) funguje jako
// returnUrl bez další knihovny (viz `useRoute`).
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import type { AuthenticatedAuth } from '../../hooks/useAuth';
import { wasAuthenticated } from '../../hooks/sessionMemory';
import * as authApi from '../../api/authApi';
import { SetupPage } from './SetupPage';
import { LoginPage } from './LoginPage';

const LOADING_STYLE = {
  fontFamily: "'IBM Plex Mono','Courier New',monospace",
  background: '#0f1117',
  minHeight: '100vh',
  color: '#e2e8f0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
} as const;

interface AuthGateProps {
  children: (auth: AuthenticatedAuth) => React.ReactNode;
}

/**
 * Query string s returnUrl, jak ho čeká FR-AUTH-01/03 — přidá se jen jednou.
 *
 * `/login` se vynechává spolu s kořenem: jinak by si přihlašovací stránka
 * uložila jako returnUrl samu sebe a po přihlášení by uživatele vrátila zpět
 * na `/login`.
 */
function markReturnUrl(): void {
  const { pathname, search } = window.location;
  if (pathname === '/' || pathname === '/login' || search.includes('returnUrl=')) return;
  const returnUrl = encodeURIComponent(pathname + search);
  window.history.replaceState(null, '', `/login?returnUrl=${returnUrl}`);
}

export function AuthGate({ children }: AuthGateProps) {
  const auth = useAuth();
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);

  useEffect(() => {
    authApi.isSetupRequired().then(setSetupRequired);
  }, []);

  useEffect(() => {
    if (auth.status === 'anonymous' && setupRequired === false) markReturnUrl();
  }, [auth.status, setupRequired]);

  if (auth.status === 'loading' || setupRequired === null) {
    return <div style={LOADING_STYLE}>Načítám…</div>;
  }
  if (setupRequired) {
    return <SetupPage onCreated={auth.setAuthenticated} />;
  }
  if (auth.status === 'anonymous') {
    return (
      <LoginPage
        onLogin={auth.login}
        onLoggedIn={() => window.history.replaceState(null, '', returnUrlFromQuery() ?? '/')}
        sessionExpiredNotice={wasAuthenticated()}
      />
    );
  }
  return <>{children(auth as AuthenticatedAuth)}</>;
}

function returnUrlFromQuery(): string | null {
  const value = new URLSearchParams(window.location.search).get('returnUrl');
  return value ? decodeURIComponent(value) : null;
}
