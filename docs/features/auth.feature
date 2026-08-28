Feature: Autentizace uživatelů

  Background:
    Given existuje uživatelský účet "jan.novak" s heslem "Heslo1234" a display name "Jan Novák"
    And existuje admin účet "admin" s heslem "Admin5678" a display name "Administrátor"

  Scenario: Úspěšné přihlášení
    Given uživatel není přihlášen
    When uživatel přejde na přihlašovací stránku
    And zadá uživatelské jméno "jan.novak"
    And zadá heslo "Heslo1234"
    And klikne na tlačítko "Přihlásit se"
    Then je přesměrován na stránku se seznamem projektů
    And v hlavičce stránky je zobrazeno jméno "Jan Novák"

  Scenario: Přihlášení se špatným heslem
    Given uživatel není přihlášen
    When uživatel přejde na přihlašovací stránku
    And zadá uživatelské jméno "jan.novak"
    And zadá heslo "SpatneHeslo"
    And klikne na tlačítko "Přihlásit se"
    Then je zobrazena chybová zpráva "Nesprávné uživatelské jméno nebo heslo"
    And uživatel zůstane na přihlašovací stránce
    And stránka neodhalí, zda uživatelské jméno existuje

  Scenario: Přihlášení s neexistujícím uživatelským jménem
    Given uživatel není přihlášen
    When uživatel přejde na přihlašovací stránku
    And zadá uživatelské jméno "neexistujici.uzivatel"
    And zadá heslo "LibovolneHeslo"
    And klikne na tlačítko "Přihlásit se"
    Then je zobrazena chybová zpráva "Nesprávné uživatelské jméno nebo heslo"

  Scenario: Přesměrování nepřihlášeného uživatele
    Given uživatel není přihlášen
    When uživatel přejde přímo na URL "/projects/abc123"
    Then je přesměrován na přihlašovací stránku
    And přihlašovací stránka si zapamatuje původní URL jako returnUrl

  Scenario: Přihlášení se zapamatovaným returnUrl
    Given uživatel byl přesměrován na přihlašovací stránku z URL "/projects/abc123"
    When zadá správné přihlašovací údaje "jan.novak" / "Heslo1234"
    And klikne na tlačítko "Přihlásit se"
    Then je přesměrován zpět na "/projects/abc123"

  Scenario: Persistentní session po reloadu stránky
    Given uživatel "jan.novak" je přihlášen
    When uživatel provede reload stránky (F5)
    Then zůstane přihlášen
    And v hlavičce je stále zobrazeno jméno "Jan Novák"

  Scenario: Odhlášení
    Given uživatel "jan.novak" je přihlášen a je na stránce se seznamem projektů
    When klikne na své jméno "Jan Novák" v hlavičce
    And klikne na položku "Odhlásit"
    Then je přesměrován na přihlašovací stránku
    And při přímém přístupu na "/projects" je znovu přesměrován na přihlašovací stránku

  Scenario: Vypršení session
    Given uživatel "jan.novak" byl přihlášen před 9 hodinami (session expiry je 8h)
    When uživatel se pokusí načíst stránku se seznam projektů
    Then je přesměrován na přihlašovací stránku
    And je zobrazena informace "Vaše session vypršela, přihlaste se znovu"

  Scenario: Lockout po opakovaných špatných pokusech
    Given uživatel není přihlášen
    When uživatel 5× po sobě zadá špatné heslo pro účet "jan.novak"
    Then je zobrazena zpráva "Účet je dočasně uzamčen. Zkuste to znovu za 15 minut."
    And i se správným heslem se přihlášení nezdaří po dobu lockout periody

  Scenario: Změna vlastního hesla
    Given uživatel "jan.novak" je přihlášen
    When klikne na své jméno v hlavičce
    And vybere "Změna hesla"
    And zadá současné heslo "Heslo1234"
    And zadá nové heslo "NoveHeslo99"
    And potvrdí nové heslo "NoveHeslo99"
    And klikne "Uložit"
    Then je zobrazena zpráva "Heslo bylo úspěšně změněno"
    And při dalším přihlášení funguje nové heslo "NoveHeslo99"
    And staré heslo "Heslo1234" je odmítnuto

  Scenario: Nové heslo nesplňuje minimální délku
    Given uživatel "jan.novak" je přihlášen v nastavení hesla
    When zadá nové heslo "kr"
    And klikne "Uložit"
    Then je zobrazena chybová zpráva "Heslo musí mít alespoň 8 znaků"

  Scenario: Admin vytvoří nový uživatelský účet
    Given admin "admin" je přihlášen
    When přejde na "/admin/users"
    And klikne "Přidat uživatele"
    And zadá uživatelské jméno "petra.kolarova"
    And zadá display name "Petra Kolářová"
    And zadá dočasné heslo "DocasneHeslo1"
    And klikne "Vytvořit"
    Then je zobrazena zpráva "Uživatel Petra Kolářová byl vytvořen"
    And "petra.kolarova" může přihlásit s heslem "DocasneHeslo1"

  Scenario: Admin nemůže deaktivovat posledního PM projektu
    # Bez téhle pojistky by projekt zůstal s PM, který se nepřihlásí, a protože
    # Admin nemá projektová oprávnění, nešlo by už doplnit jiného.
    Given admin "admin" je přihlášen na "/admin/users"
    And "jan.novak" je jediným PM projektu "Backend refaktoring"
    When klikne na "Deaktivovat" u uživatele "jan.novak"
    Then deaktivace je odmítnuta
    And je zobrazena zpráva "Účet nelze deaktivovat: uživatel je jediným Project Managerem projektů Backend refaktoring. Nejdřív přiřaďte jiného PM."
    And účet "jan.novak" zůstává aktivní

  Scenario: Admin obnoví deaktivovaný účet
    Given admin "admin" je přihlášen na "/admin/users"
    And existuje deaktivovaný uživatel "jan.novak"
    When klikne na "Aktivovat" u uživatele "jan.novak"
    Then účet "jan.novak" je aktivní
    And "jan.novak" se může znovu přihlásit původním heslem

  Scenario: Admin resetuje heslo uživateli
    Given admin "admin" je přihlášen na "/admin/users"
    And existuje uživatel "jan.novak"
    When klikne na "Resetovat heslo" u uživatele "jan.novak"
    And zadá nové heslo "NoveHeslo99"
    Then heslo je změněno bez zadání původního
    And "jan.novak" se přihlásí heslem "NoveHeslo99"
    And původní heslo je odmítnuto

  Scenario: Admin deaktivuje uživatelský účet
    Given admin "admin" je přihlášen na "/admin/users"
    And existuje aktivní uživatel "jan.novak"
    When klikne na "Deaktivovat" u uživatele "jan.novak"
    And potvrdí dialog
    Then účet "jan.novak" je deaktivován
    And "jan.novak" se nemůže přihlásit
    And existující data uživatele (úkoly, poznámky) jsou zachována

  Scenario: První spuštění — vytvoření admin účtu
    # Formulář tu dřív po odeslání zůstával viset: účet se založil a session
    # platila, ale brána si "setup je potřeba" načetla jen jednou při startu
    # a nikdy ho nepřepnula. Navenek to vypadalo, že tlačítko nereaguje.
    Given aplikace je spuštěna s prázdnou databází
    When uživatel přejde na hlavní URL
    Then je přesměrován na "/setup"
    And je zobrazen formulář "Vytvoření administrátorského účtu"
    When zadá uživatelské jméno "admin", display name "Administrátor", heslo "Admin5678"
    And klikne "Vytvořit"
    Then je automaticky přihlášen jako admin
    And formulář prvního spuštění zmizí
    And je přesměrován na stránku se seznamem projektů na URL "/"

  Scenario: Probíhající vytváření admin účtu je vidět na tlačítku
    Given aplikace je spuštěna s prázdnou databází a uživatel je na "/setup"
    When vyplní formulář a klikne "Vytvořit"
    Then tlačítko změní popisek na "Vytvářím účet…"
    And tlačítko je nedostupné, dokud operace probíhá

  Scenario: Neúspěšné vytvoření admin účtu ponechá uživatele na formuláři
    Given aplikace je spuštěna s prázdnou databází a uživatel je na "/setup"
    When zadá heslo "kr" a klikne "Vytvořit"
    Then je zobrazena chybová zpráva
    And formulář "Vytvoření administrátorského účtu" je stále zobrazen
    And tlačítko "Vytvořit" je znovu dostupné pro další pokus

  Scenario: Po dokončeném setupu se obrazovka prvního spuštění už nenabízí
    Given admin účet už v databázi existuje
    When nepřihlášený uživatel přejde na "/setup"
    Then je zobrazena přihlašovací stránka
    And formulář "Vytvoření administrátorského účtu" není zobrazen

  Scenario: Registrace nového uživatele
    Given registrace je povolená
    And uživatel není přihlášen
    When na přihlašovací stránce klikne "Zaregistrovat se"
    And zadá uživatelské jméno "petra.kolarova", display name "Petra Kolářová" a heslo "Heslo1234"
    And potvrdí heslo "Heslo1234"
    And klikne "Zaregistrovat se"
    Then je automaticky přihlášen
    And je přesměrován na stránku se seznamem projektů
    And nemá práva administrátora
    And není členem žádného projektu

  Scenario: Registrace s obsazeným uživatelským jménem
    # Registrace na rozdíl od přihlášení existenci účtu prozradit musí —
    # jinak nejde říct, proč založení neprošlo (ADR-003, doplněk).
    Given registrace je povolená
    When se nový uživatel pokusí zaregistrovat jako "jan.novak"
    Then je zobrazena chybová zpráva "Uživatelské jméno je již obsazeno"
    And účet není vytvořen

  Scenario: Registrace s neshodnými hesly
    Given registrace je povolená
    When uživatel zadá heslo "Heslo1234" a potvrzení "JineHeslo9"
    And klikne "Zaregistrovat se"
    Then je zobrazena chybová zpráva "Hesla se neshodují"
    And účet není vytvořen

  Scenario: Registrace s krátkým heslem
    Given registrace je povolená
    When uživatel zadá heslo "kr" a potvrdí ho
    And klikne "Zaregistrovat se"
    Then je zobrazena chybová zpráva "Heslo musí mít alespoň 8 znaků"
    And účet není vytvořen

  Scenario: Vypnutá registrace nenabízí odkaz
    Given registrace je vypnutá konfigurací
    When uživatel přejde na přihlašovací stránku
    Then odkaz "Zaregistrovat se" není zobrazen

  Scenario: Vypnutá registrace odmítne i přímé volání
    # Skryté tlačítko není autorizace — rozhoduje server.
    Given registrace je vypnutá konfigurací
    When někdo pošle registrační požadavek přímo na server
    Then je požadavek odmítnut
    And účet není vytvořen

  Scenario: Registrace do prázdné databáze se odmítne
    # Do prázdné DB patří admin přes první spuštění (FR-AUTH-07). Jinak by
    # první příchozí dostal běžný účet a systém by zůstal bez administrátora.
    Given aplikace je spuštěna s prázdnou databází
    When někdo se pokusí zaregistrovat
    Then je registrace odmítnuta
    And je nabídnuto vytvoření administrátorského účtu

  Scenario: Registrovaný uživatel se po odhlášení přihlásí svým heslem
    Given "petra.kolarova" se právě zaregistrovala s heslem "Heslo1234"
    When se odhlásí
    And přihlásí se jménem "petra.kolarova" a heslem "Heslo1234"
    Then je přihlášena

  Scenario: Deaktivace upozorní na osiřelé úkoly
    # Ne zákaz — lidé z týmu odcházejí a jejich účty se musí dát zavřít.
    # Bez upozornění ale admin netuší, že po sobě nechal v plánu úkoly na
    # někom, kdo se už nepřihlásí, a PM se to dozví, až když se nic neděje.
    Given "petra.kolarova" je v projektu "Backend refaktoring" spárovaná s osobou
    And ta osoba má přiřazené úkoly
    When admin deaktivuje účet "petra.kolarova"
    Then je účet deaktivován
    And zobrazí se upozornění, že v projektu "Backend refaktoring" zůstaly přiřazené úkoly

  Scenario: Deaktivace účtu bez přiřazené práce nic nehlásí
    Given "kdosi.cizi" není v žádném projektu spárovaný s osobou
    When admin deaktivuje jeho účet
    Then je účet deaktivován bez upozornění
