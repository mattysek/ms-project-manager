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

/** Odpověď `/auth/setup-required`; registrace je v produkci výchozí zapnutá. */
function bootstrap(over: Partial<authApi.AuthBootstrap> = {}): void {
  vi.mocked(authApi.fetchAuthBootstrap).mockResolvedValue({
    setupRequired: false,
    registrationAllowed: true,
    ...over,
  });
}

/** Nepřihlášený uživatel s hotovým setupem — výchozí situace většiny scénářů. */
function anonymous(): void {
  bootstrap();
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
    bootstrap();
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

describe('AuthGate — první spuštění', () => {
  const SETUP_TITLE = 'Vytvoření administrátorského účtu';
  const adminUser = {
    ...currentUser,
    userName: 'admin',
    displayName: 'Administrátor',
    isAdmin: true,
  };

  /** Prázdná databáze — brána musí nabídnout setup. */
  function emptyDatabase(): void {
    bootstrap({ setupRequired: true });
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(null);
  }

  async function fillSetupForm(): Promise<void> {
    await userEvent.type(screen.getByLabelText(/uživatelské jméno/i), 'admin');
    await userEvent.type(screen.getByLabelText(/display name/i), 'Administrátor');
    await userEvent.type(screen.getByLabelText(/heslo/i), 'Admin5678');
  }

  // @scenario: auth.feature > První spuštění — vytvoření admin účtu
  it('po vytvoření admina zmizí formulář a uživatel skončí na seznamu projektů', async () => {
    // Regrese: brána si `setupRequired` načetla jen jednou při startu a nikdy
    // ho nepřepnula, takže větev se setupem měla přednost před přihlášeným
    // uživatelem — účet se založil, ale obrazovka zůstala stát na formuláři.
    emptyDatabase();
    vi.mocked(authApi.setupAdmin).mockResolvedValue(adminUser);
    goTo('/setup');

    render(<AuthGate>{(auth) => <div>seznam projektů — {auth.user.displayName}</div>}</AuthGate>);
    await screen.findByText(SETUP_TITLE);

    await fillSetupForm();
    await userEvent.click(screen.getByRole('button', { name: 'Vytvořit' }));

    expect(await screen.findByText(/seznam projektů — Administrátor/)).toBeInTheDocument();
    expect(screen.queryByText(SETUP_TITLE)).not.toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/'));
  });

  // @scenario: auth.feature > První spuštění — vytvoření admin účtu
  it('prázdná databáze přepíše URL na /setup', async () => {
    emptyDatabase();
    goTo('/projects/abc123');

    render(<AuthGate>{() => <div>obsah</div>}</AuthGate>);

    await screen.findByText(SETUP_TITLE);
    await waitFor(() => expect(window.location.pathname).toBe('/setup'));
  });

  // @scenario: auth.feature > Probíhající vytváření admin účtu je vidět na tlačítku
  it('během vytváření účtu tlačítko hlásí průběh a je nedostupné', async () => {
    emptyDatabase();
    // Odpověď se schválně nedokončí — jinak by stav „probíhá" nešlo pozorovat.
    let release: (user: typeof adminUser) => void = () => {};
    vi.mocked(authApi.setupAdmin).mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      })
    );

    render(<AuthGate>{() => <div>obsah</div>}</AuthGate>);
    await screen.findByText(SETUP_TITLE);

    await fillSetupForm();
    await userEvent.click(screen.getByRole('button', { name: 'Vytvořit' }));

    const button = await screen.findByRole('button', { name: 'Vytvářím účet…' });
    expect(button).toBeDisabled();

    release(adminUser);
  });

  // @scenario: auth.feature > Neúspěšné vytvoření admin účtu ponechá uživatele na formuláři
  it('při chybě zůstane formulář zobrazený a jde odeslat znovu', async () => {
    emptyDatabase();
    vi.mocked(authApi.setupAdmin).mockRejectedValue(new Error('Heslo musí mít alespoň 8 znaků'));

    render(<AuthGate>{() => <div>obsah</div>}</AuthGate>);
    await screen.findByText(SETUP_TITLE);

    await fillSetupForm();
    await userEvent.click(screen.getByRole('button', { name: 'Vytvořit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Heslo musí mít alespoň 8 znaků');
    expect(screen.getByText(SETUP_TITLE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vytvořit' })).toBeEnabled();
  });

  // @scenario: auth.feature > Po dokončeném setupu se obrazovka prvního spuštění už nenabízí
  it('s existujícím adminem vede /setup na přihlášení', async () => {
    anonymous();
    goTo('/setup');

    render(<AuthGate>{() => <div>obsah</div>}</AuthGate>);

    await screen.findByText('Přihlášení');
    expect(screen.queryByText(SETUP_TITLE)).not.toBeInTheDocument();
    // `/setup` si nesmí uložit sám sebe jako returnUrl — po přihlášení tam
    // už není co zobrazit.
    expect(window.location.search).not.toContain('returnUrl=');
  });
});

describe('AuthGate — samoobslužná registrace', () => {
  const REGISTER_TITLE = 'Registrace nového účtu';
  const registered = {
    ...currentUser,
    userName: 'petra.kolarova',
    displayName: 'Petra Kolářová',
  };

  async function fillRegisterForm(password = 'Heslo1234', confirmation = password): Promise<void> {
    await userEvent.type(screen.getByLabelText(/uživatelské jméno/i), 'petra.kolarova');
    await userEvent.type(screen.getByLabelText(/display name/i), 'Petra Kolářová');
    await userEvent.type(screen.getByLabelText(/^heslo/i), password);
    await userEvent.type(screen.getByLabelText(/potvrzení hesla/i), confirmation);
  }

  // @scenario: auth.feature > Registrace nového uživatele
  it('z přihlášení se dá přejít na registraci a založit účet', async () => {
    anonymous();
    vi.mocked(authApi.register).mockResolvedValue(registered);

    render(<AuthGate>{(auth) => <div>seznam projektů — {auth.user.displayName}</div>}</AuthGate>);
    await screen.findByText('Přihlášení');

    await userEvent.click(screen.getByRole('button', { name: 'Zaregistrovat se' }));
    await screen.findByText(REGISTER_TITLE);
    expect(window.location.pathname).toBe('/register');

    await fillRegisterForm();
    await userEvent.click(screen.getByRole('button', { name: 'Zaregistrovat se' }));

    // Stejně jako po setupu: formulář zmizí a uživatel je uvnitř aplikace.
    expect(await screen.findByText(/seznam projektů — Petra Kolářová/)).toBeInTheDocument();
    expect(screen.queryByText(REGISTER_TITLE)).not.toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/'));
  });

  // @scenario: auth.feature > Registrace s neshodnými hesly
  it('neshodná hesla se na server vůbec neposílají', async () => {
    anonymous();
    goTo('/register');

    render(<AuthGate>{() => <div>obsah</div>}</AuthGate>);
    await screen.findByText(REGISTER_TITLE);

    await fillRegisterForm('Heslo1234', 'JineHeslo9');
    await userEvent.click(screen.getByRole('button', { name: 'Zaregistrovat se' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Hesla se neshodují');
    expect(authApi.register).not.toHaveBeenCalled();
  });

  // @scenario: auth.feature > Registrace s obsazeným uživatelským jménem
  it('obsazené jméno vypíše hlášku ze serveru a nechá formulář otevřený', async () => {
    anonymous();
    vi.mocked(authApi.register).mockRejectedValue(new Error('Uživatelské jméno je již obsazeno'));
    goTo('/register');

    render(<AuthGate>{() => <div>obsah</div>}</AuthGate>);
    await screen.findByText(REGISTER_TITLE);

    await fillRegisterForm();
    await userEvent.click(screen.getByRole('button', { name: 'Zaregistrovat se' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Uživatelské jméno je již obsazeno');
    expect(screen.getByText(REGISTER_TITLE)).toBeInTheDocument();
  });

  // @scenario: auth.feature > Registrace s krátkým heslem
  it('krátké heslo vypíše hlášku ze serveru', async () => {
    anonymous();
    vi.mocked(authApi.register).mockRejectedValue(new Error('Heslo musí mít alespoň 8 znaků'));
    goTo('/register');

    render(<AuthGate>{() => <div>obsah</div>}</AuthGate>);
    await screen.findByText(REGISTER_TITLE);

    await fillRegisterForm('kr');
    await userEvent.click(screen.getByRole('button', { name: 'Zaregistrovat se' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Heslo musí mít alespoň 8 znaků');
  });

  // @scenario: auth.feature > Vypnutá registrace nenabízí odkaz
  it('vypnutá registrace odkaz na přihlášení nenabízí', async () => {
    bootstrap({ registrationAllowed: false });
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(null);

    render(<AuthGate>{() => <div>obsah</div>}</AuthGate>);

    await screen.findByText('Přihlášení');
    expect(screen.queryByRole('button', { name: 'Zaregistrovat se' })).not.toBeInTheDocument();
  });

  it('při vypnuté registraci nenabídne formulář ani na /register', async () => {
    // Skrytý odkaz nestačí — na URL se dá jít přímo. Skutečné odmítnutí dělá
    // server (FR-AUTH-08), tohle je jen to, že UI netvrdí opak.
    bootstrap({ registrationAllowed: false });
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(null);
    goTo('/register');

    render(<AuthGate>{() => <div>obsah</div>}</AuthGate>);

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Registrace nových účtů není povolená'
    );
    expect(screen.queryByRole('button', { name: 'Zaregistrovat se' })).not.toBeInTheDocument();
  });

  it('/register si sám sebe neuloží jako returnUrl', async () => {
    anonymous();
    goTo('/register');

    render(<AuthGate>{() => <div>obsah</div>}</AuthGate>);
    await screen.findByText(REGISTER_TITLE);

    await waitFor(() => expect(window.location.pathname).toBe('/register'));
    expect(window.location.search).not.toContain('returnUrl=');
  });

  it('ze registrace vede cesta zpět na přihlášení', async () => {
    anonymous();
    goTo('/register');

    render(<AuthGate>{() => <div>obsah</div>}</AuthGate>);
    await screen.findByText(REGISTER_TITLE);

    await userEvent.click(screen.getByRole('button', { name: 'Zpět na přihlášení' }));

    expect(await screen.findByText('Přihlášení')).toBeInTheDocument();
  });
});
