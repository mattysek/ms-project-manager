# PRD-01: Autentizace a správa uživatelů

## Přehled

Systém vyžaduje autentizaci pro přístup ke všem funkcím. Uživatelé se přihlašují pomocí uživatelského jména a hesla. Účet si uživatel může **založit sám** (FR-AUTH-08), nebo mu ho založí Admin (FR-AUTH-05); do projektu ho pak přidá PM. Samoobslužnou registraci lze v konfiguraci vypnout — viz doplněk k [ADR-003](../adr/ADR-003-authentication.md).

## Cíle

- Bezpečné ověření identity uživatele před přístupem k jakýmkoliv datům
- Persistentní session přes reload stránky
- Centralizovaná správa uživatelů Adminem
- Žádné zbytečné složitosti (OAuth, 2FA) pro interní nástroj v první verzi

## Non-goals

- OAuth / OIDC / LDAP / Active Directory integrace
- Dvoufaktorová autentizace (2FA)
- Resetování hesla přes email (první verze — admin resetuje ručně)

## Uživatelé a role

| Aktér | Popis |
|---|---|
| **Admin** | Speciální systémový účet (první registrovaný uživatel nebo označený v konfiguraci); spravuje uživatelské účty |
| **PM** | Standardní uživatel s rolí PM na projektu; nemá speciální auth oprávnění |
| **Dev** | Standardní uživatel s rolí Dev na projektu |

## Funkcionální požadavky

### FR-AUTH-01: Přihlášení
- Přihlašovací stránka je zobrazena při přístupu na jakoukoliv URL pro nepřihlášeného uživatele
- Formulář obsahuje pole: Uživatelské jméno, Heslo, tlačítko Přihlásit se
- Po úspěšném přihlášení je uživatel přesměrován na LandingPage (seznam projektů)
- Po neúspěšném přihlášení (špatné jméno nebo heslo) se zobrazí generická chybová zpráva: "Nesprávné uživatelské jméno nebo heslo" (bez specifikace která část je špatně)
- Po 5 neúspěšných pokusech za 5 minut je účet dočasně uzamčen na 15 minut (ASP.NET Core Identity lockout)

### FR-AUTH-02: Odhlášení
- Tlačítko "Odhlásit" je viditelné v Header (přihlášenému uživateli)
- Po odhlášení je cookie invalidována a uživatel přesměrován na přihlašovací stránku
- Otevřené SignalR připojení je uzavřeno při odhlášení

### FR-AUTH-03: Persistentní session
- Cookie session trvá 8 hodin od posledního požadavku (sliding expiry)
- Po reload stránky uživatel zůstane přihlášen (cookie je HttpOnly, přežije reload)
- Po vypršení session je uživatel při dalším požadavku přesměrován na přihlašovací stránku s parametrem `?returnUrl=...`

### FR-AUTH-04: Změna hesla
- Přihlášený uživatel může změnit vlastní heslo v nastavení profilu
- Formulář: Současné heslo, Nové heslo, Potvrzení nového hesla
- Nové heslo musí splňovat minimální požadavky (viz NFR)
- Admin může resetovat heslo libovolného uživatele bez zadání starého hesla

### FR-AUTH-05: Správa uživatelských účtů (Admin)
- Admin má přístup k administrační sekci: `/admin/users`
- Admin může: vytvořit nový účet (jméno, heslo, display name), deaktivovat účet (uživatel se nemůže přihlásit), obnovit deaktivovaný účet, resetovat heslo uživatele
- Admin nemůže smazat účet (pouze deaktivovat) — zachování integrity dat (úkoly, poznámky stále referují userId)
- Při vytváření účtu Admin nastaví dočasné heslo; uživatel je vyzván ke změně při prvním přihlášení

### FR-AUTH-06: Zobrazení přihlášeného uživatele
- V Header je zobrazeno jméno přihlášeného uživatele (DisplayName) a jeho role na aktuálním projektu
- Kliknutím na jméno se otevře dropdown s: Změna hesla, Odhlásit

### FR-AUTH-07: První spuštění
- Při prvním spuštění aplikace (prázdná DB) je uživatel přesměrován na stránku vytvoření admin účtu na URL `/setup`
- Formulář obsahuje pole: Uživatelské jméno, Display name, Heslo, tlačítko "Vytvořit"
- Po odeslání formuláře tlačítko viditelně signalizuje probíhající operaci ("Vytvářím účet…") a je nedostupné, aby se účet nezaložil dvakrát
- Po vytvoření admin účtu je uživatel automaticky přihlášen (odpověď nese session cookie) **a okamžitě přesměrován na LandingPage (seznam projektů) na URL `/`**
- Obrazovka setupu se po úspěšném založení účtu už nesmí zobrazit — aplikace se nesmí ptát serveru znovu, zda je setup potřeba, ani zůstat stát na formuláři
- Při selhání (např. heslo nesplňuje minimální délku) zůstane uživatel na formuláři s chybovou hláškou a může odeslat znovu

> **Pozn. k regresi:** obrazovka setupu zůstávala po odeslání viset, přestože se admin založil a session platila — brána si stav "setup je potřeba" načetla jen jednou při startu a nikdy ho nepřepnula, takže větev se setupem měla přednost před větví přihlášeného uživatele. Navenek to vypadalo, že tlačítko nereaguje. Scénář to sice popisoval, ale nárokoval si ho pouze serverový test, který vidí jen `POST /auth/setup`; klientskou stranu nekontroloval nikdo.

### FR-AUTH-08: Samoobslužná registrace
- Nepřihlášený uživatel se dostane na registraci z přihlašovací stránky odkazem „Zaregistrovat se" a na URL `/register`
- Formulář obsahuje: Uživatelské jméno, Display name, Heslo, Potvrzení hesla, tlačítko „Zaregistrovat se"
- Po úspěšné registraci je uživatel **rovnou přihlášen** a přesměrován na LandingPage (stejně jako po prvním spuštění, FR-AUTH-07)
- Nový účet dostane **běžná práva**: není Admin a není členem žádného projektu. Vidí prázdný seznam projektů, dokud si nějaký nezaloží nebo ho někdo nepřidá do svého
- Obsazené uživatelské jméno vrátí „Uživatelské jméno je již obsazeno"; neshodná hesla „Hesla se neshodují"; krátké heslo hlášku podle NFR
- Registrace jde **vypnout konfigurací** (`Auth:AllowSelfRegistration`, výchozí zapnuto). Když je vypnutá:
  - odkaz „Zaregistrovat se" se na přihlašovací stránce nezobrazí,
  - `/register` zobrazí sdělení, že registrace není povolená,
  - **server odmítne i přímé volání** `POST /auth/register` (403) — skryté tlačítko není autorizace
- Registrace **nenahrazuje první spuštění**: do prázdné databáze patří admin přes `/auth/setup`, a dokud žádný účet neexistuje, registrace se odmítne (409). Jinak by první příchozí dostal běžný účet a systém by zůstal bez administrátora

## Non-funkcionální požadavky

- Hesla hashována pomocí PBKDF2 (ASP.NET Core Identity default — 100 000 iterací SHA-256)
- Minimální délka hesla: 8 znaků
- Cookie: `HttpOnly = true`, `Secure = true` (HTTPS), `SameSite = Strict`
- Session expiry: 8 hodin sliding (konfigurovatelné v `appsettings.json`)
- Account lockout: 5 pokusů / 5 minut → lock na 15 minut
- Přihlašovací stránka neprozradí, zda uživatelské jméno existuje

## Out of scope

- Ověření e-mailem / potvrzovací odkaz při registraci (účty jsou rovnou aktivní)
- Registrace na pozvánku (invite link) nebo přes sdílený registrační kód
- Zapomenuté heslo přes email
- OAuth providers (Google, Microsoft, GitHub)
- API keys pro programatický přístup
- Audit log přihlášení (kdo, kdy, z jaké IP)
