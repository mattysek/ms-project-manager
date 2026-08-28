// Kořenová brána aplikace — FR-AUTH-01, FR-AUTH-03, FR-AUTH-07.
//
// Dokud není jasné, jestli je DB prázdná (setup) a jestli je uživatel
// přihlášený, nic dalšího se nerenderuje. URL se při nepřihlášení NEMĚNÍ —
// `AuthenticatedApp` čte `currentProjectId` z `window.location.pathname` až
// po přihlášení, takže hluboký odkaz (`/projects/abc123`) funguje jako
// returnUrl bez další knihovny (viz `useRoute`).
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import type { AuthenticatedAuth } from '../../hooks/useAuth';
import { wasAuthenticated } from '../../hooks/sessionMemory';
import * as authApi from '../../api/authApi';
import type { CurrentUser } from '../../api/authApi';
import { SetupPage } from './SetupPage';
import { LoginPage } from './LoginPage';
import { RegisterPage } from './RegisterPage';

const LOADING_STYLE = {
  fontFamily: "'IBM Plex Mono','Courier New',monospace",
  background: '#0f1117',
  minHeight: '100vh',
  color: '#e2e8f0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
} as const;

/** Cesty, které si samy sebe nesmí uložit jako returnUrl. */
const SELF_RETURNING_PATHS = new Set(['/', '/login', '/setup', '/register']);

/** URL registračního formuláře (FR-AUTH-08). */
const REGISTER_PATH = '/register';

interface AuthGateProps {
  children: (auth: AuthenticatedAuth) => React.ReactNode;
}

/**
 * Query string s returnUrl, jak ho čeká FR-AUTH-01/03 — přidá se jen jednou.
 *
 * `/login` se vynechává spolu s kořenem: jinak by si přihlašovací stránka
 * uložila jako returnUrl samu sebe a po přihlášení by uživatele vrátila zpět
 * na `/login`. `/setup` a `/register` jsou tam ze stejného důvodu — po
 * dokončeném setupu ani po registraci už na těch cestách není co zobrazit.
 */
function markReturnUrl(): void {
  const { pathname, search } = window.location;
  if (SELF_RETURNING_PATHS.has(pathname) || search.includes('returnUrl=')) return;
  const returnUrl = encodeURIComponent(pathname + search);
  window.history.replaceState(null, '', `/login?returnUrl=${returnUrl}`);
}

/** První spuštění má vlastní URL, aby adresní řádek odpovídal obrazovce (FR-AUTH-07). */
function markSetupUrl(): void {
  if (window.location.pathname === '/setup') return;
  window.history.replaceState(null, '', '/setup');
}

export function AuthGate({ children }: AuthGateProps) {
  const auth = useAuth();
  const [bootstrap, setBootstrap] = useState<authApi.AuthBootstrap | null>(null);
  const [path, setPath] = useState(() => window.location.pathname);
  const { setAuthenticated } = auth;
  const setupRequired = bootstrap?.setupRequired ?? null;

  useEffect(() => {
    authApi.fetchAuthBootstrap().then(setBootstrap);
  }, []);

  useEffect(() => {
    if (setupRequired === true) markSetupUrl();
    else if (auth.status === 'anonymous' && setupRequired === false && path !== REGISTER_PATH) {
      markReturnUrl();
    }
  }, [auth.status, setupRequired, path]);

  /** Přepnutí mezi přihlášením a registrací — URL i vykreslená stránka. */
  const goTo = useCallback((next: string) => {
    window.history.pushState(null, '', next);
    setPath(next);
  }, []);

  /**
   * Po registraci je uživatel přihlášený úplně stejně jako po setupu, takže
   * i tady musí zmizet formulář a URL se vrátit na kořen (FR-AUTH-08).
   */
  const handleRegistered = useCallback(
    (user: CurrentUser) => {
      window.history.replaceState(null, '', '/');
      setPath('/');
      setAuthenticated(user);
    },
    [setAuthenticated]
  );

  /**
   * Setup je hotový: účet existuje a odpověď nese přihlašovací cookie.
   *
   * Přepnutí `setupRequired` na `false` je tu to podstatné — bez něj brána renderovala
   * `SetupPage` dál (větev `setupRequired` předchází větvi přihlášeného
   * uživatele), takže se po odeslání formuláře zdánlivě nic nestalo, přestože
   * admin byl založený a session platná. Odpověď `/auth/setup-required` se
   * znovu neptáme — právě jsme ten účet vytvořili.
   */
  const handleAdminCreated = useCallback(
    (user: CurrentUser) => {
      setBootstrap((current) => (current ? { ...current, setupRequired: false } : current));
      window.history.replaceState(null, '', '/');
      setPath('/');
      setAuthenticated(user);
    },
    [setAuthenticated]
  );

  if (auth.status === 'loading' || setupRequired === null) {
    return <div style={LOADING_STYLE}>Načítám…</div>;
  }
  if (setupRequired) {
    return <SetupPage onCreated={handleAdminCreated} />;
  }
  if (auth.status === 'anonymous' && path === REGISTER_PATH) {
    return (
      <RegisterPage
        allowed={bootstrap?.registrationAllowed ?? false}
        onRegistered={handleRegistered}
        onBackToLogin={() => goTo('/')}
      />
    );
  }
  if (auth.status === 'anonymous') {
    return (
      <LoginPage
        onLogin={auth.login}
        onLoggedIn={() => window.history.replaceState(null, '', returnUrlFromQuery() ?? '/')}
        sessionExpiredNotice={wasAuthenticated()}
        onRegister={bootstrap?.registrationAllowed ? () => goTo(REGISTER_PATH) : undefined}
      />
    );
  }
  return <>{children(auth as AuthenticatedAuth)}</>;
}

function returnUrlFromQuery(): string | null {
  const value = new URLSearchParams(window.location.search).get('returnUrl');
  return value ? decodeURIComponent(value) : null;
}
