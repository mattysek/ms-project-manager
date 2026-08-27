// Paměť o tom, že tu někdo byl přihlášen — FR-AUTH-03.
//
// Scénář „Vypršení session" chce po vypršení cookie hlášku „Vaše session
// vypršela, přihlaste se znovu". Klient ale nemá jak odlišit vypršelou session
// od uživatele, který se nikdy nepřihlásil: v obou případech vrátí
// `GET /auth/me` prázdno a prohlížeč vypršelou cookie zahodí sám.
//
// Rozdíl je jen v tom, jestli tenhle prohlížeč někdy přihlášený byl. Držet to
// v paměti komponenty nestačí — session typicky vyprší mezi návštěvami, kdy
// je stránka dávno zavřená. Proto localStorage, stejně jako u stavu panelu
// poznámek (FR-QN-01); do DB to nepatří, je to čistě klientská nápověda.
//
// Příznak se maže při odhlášení, jinak by se po každém „Odhlásit" nesmyslně
// tvrdilo, že session vypršela.

const KEY = 'msp.wasAuthenticated';

/** localStorage může být nedostupný (privátní režim, zakázané úložiště). */
function safely<T>(action: () => T, fallback: T): T {
  try {
    return action();
  } catch {
    return fallback;
  }
}

export function rememberAuthenticated(): void {
  safely(() => localStorage.setItem(KEY, '1'), undefined);
}

export function forgetAuthenticated(): void {
  safely(() => localStorage.removeItem(KEY), undefined);
}

/**
 * Byl tu někdo přihlášený? Čte se v okamžiku, kdy je uživatel anonymní —
 * pak je odpověď „ano" právě tím signálem, že session vypršela.
 */
export function wasAuthenticated(): boolean {
  return safely(() => localStorage.getItem(KEY) === '1', false);
}
