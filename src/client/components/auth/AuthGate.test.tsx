// Brána přihlášení — FR-AUTH-01, FR-AUTH-03.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthGate } from './AuthGate';
import * as authApi from '../../api/authApi';

vi.mock('../../api/authApi');

const currentUser = {
  userId: 'u1',
  userName: 'jan.novak',
  displayName: 'Jan Novák',
  isAdmin: false,
};

function goTo(url: string): void {
  window.history.replaceState(null, '', url);
}

/** Nepřihlášený uživatel s hotovým setupem — výchozí situace většiny scénářů. */
function anonymous(): void {
  vi.mocked(authApi.isSetupRequired).mockResolvedValue(false);
  vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(null);
}

beforeEach(() => {
  localStorage.clear();
  goTo('/');
});

afterEach(() => {
  vi.resetAllMocks();
});

describe('AuthGate — returnUrl', () => {
  // @scenario: auth.feature > Přesměrování nepřihlášeného uživatele
  it('hluboký odkaz nepřihlášeného přepíše na /login a zapamatuje si původní URL', async () => {
    anonymous();
    goTo('/projects/abc123');

    render(<AuthGate>{() => <div>obsah</div>}</AuthGate>);

    await screen.findByText('Přihlášení');
    // `waitFor`, ne holé `expect`: přepis URL dělá `useEffect`, kdežto text
    // přihlašovací stránky je vidět už v commitu před ním. Pod zátěží (celá
    // sada běží paralelně) se to pořadí rozešlo a test padal jen občas.
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(new URLSearchParams(window.location.search).get('returnUrl')).toBe('/projects/abc123');
  });

  // @scenario: auth.feature > Přihlášení se zapamatovaným returnUrl
  it('po přihlášení vrátí uživatele na zapamatovanou URL', async () => {
    anonymous();
    vi.mocked(authApi.login).mockResolvedValue(currentUser);
    goTo('/login?returnUrl=%2Fprojects%2Fabc123');

    render(<AuthGate>{() => <div>obsah</div>}</AuthGate>);
    await screen.findByText('Přihlášení');

    await userEvent.type(screen.getByLabelText(/uživatelské jméno/i), 'jan.novak');
    await userEvent.type(screen.getByLabelText(/heslo/i), 'Heslo1234');
    await userEvent.click(screen.getByRole('button', { name: 'Přihlásit se' }));

    await waitFor(() => expect(window.location.pathname).toBe('/projects/abc123'));
  });

  it('bez returnUrl vrátí uživatele na kořen', async () => {
    anonymous();
    vi.mocked(authApi.login).mockResolvedValue(currentUser);
    goTo('/login');

    render(<AuthGate>{() => <div>obsah</div>}</AuthGate>);
    await screen.findByText('Přihlášení');

    await userEvent.type(screen.getByLabelText(/uživatelské jméno/i), 'jan.novak');
    await userEvent.type(screen.getByLabelText(/heslo/i), 'Heslo1234');
    await userEvent.click(screen.getByRole('button', { name: 'Přihlásit se' }));

    await waitFor(() => expect(window.location.pathname).toBe('/'));
  });
});

describe('AuthGate — vypršení session', () => {
  const EXPIRY_NOTICE = 'Vaše session vypršela, přihlaste se znovu';

  // @scenario: auth.feature > Vypršení session
  it('po vypršení cookie mezi návštěvami zobrazí informaci o vypršení', async () => {
    // Session vyprší, když je stránka dávno zavřená — paměť komponenty proto
    // nestačí a příznak musí přežít reload.
    localStorage.setItem('msp.wasAuthenticated', '1');
    anonymous();

    render(<AuthGate>{() => <div>obsah</div>}</AuthGate>);

    expect(await screen.findByText(EXPIRY_NOTICE)).toBeInTheDocument();
  });

  it('uživatel, který se nikdy nepřihlásil, hlášku o vypršení nevidí', async () => {
    anonymous();

    render(<AuthGate>{() => <div>obsah</div>}</AuthGate>);

    await screen.findByText('Přihlášení');
    expect(screen.queryByText(EXPIRY_NOTICE)).not.toBeInTheDocument();
  });

  it('po vědomém odhlášení se netvrdí, že session vypršela', async () => {
    vi.mocked(authApi.isSetupRequired).mockResolvedValue(false);
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(currentUser);
    vi.mocked(authApi.logout).mockResolvedValue(undefined);

    render(
      <AuthGate>
        {(auth) => (
          <button type="button" onClick={auth.logout}>
            Odhlásit
          </button>
        )}
      </AuthGate>
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Odhlásit' }));

    await screen.findByText('Přihlášení');
    expect(screen.queryByText(EXPIRY_NOTICE)).not.toBeInTheDocument();
  });
});
