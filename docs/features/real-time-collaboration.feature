Feature: Real-time kolaborace

  Background:
    Given existuje projekt "Backend refaktoring" s datumy 2026-01-05 až 2026-07-03
    And projekt má členy: "jan.novak" (PM) a "petra.kolarova" (Dev)
    And projekt má úkol "Refaktoring API vrstvy" přiřazený "petra.kolarova", W1-W4, 15 MD
    And "jan.novak" má projekt otevřený na záložce Harmonogram
    And "petra.kolarova" má projekt otevřený na záložce Úkoly

  Scenario: Změna jednoho uživatele je viditelná druhému v reálném čase
    When "jan.novak" přesune úkol "Refaktoring API vrstvy" z W1-W4 na W3-W6 v Gantt view
    Then do 2 sekund "petra.kolarova" vidí úkol "Refaktoring API vrstvy" na pozici W3-W6 v záložce Úkoly
    And "petra.kolarova" nemusí obnovit stránku

  Scenario: Změna progress je okamžitě viditelná
    When "petra.kolarova" nastaví progress úkolu "Refaktoring API vrstvy" na 50%
    Then do 2 sekund "jan.novak" vidí u úkolu "Refaktoring API vrstvy" progress 50%
    And progress bar v Gantt view se aktualizuje

  Scenario: Přidání nového úkolu je viditelné všem
    When "jan.novak" přidá nový úkol "Code review setup" přiřazený "jan.novak", W1, 2 MD
    Then do 2 sekund "petra.kolarova" vidí nový úkol "Code review setup" v záložce Úkoly
    And úkol se zobrazí i v Gantt view

  Scenario: Presence — zobrazení kdo je v projektu
    When jsou oba uživatelé v projektu
    Then "jan.novak" vidí v hlavičce avatar "PK" (Petra Kolářová) s tooltipem "Petra Kolářová — Úkoly"
    And "petra.kolarova" vidí v hlavičce avatar "JN" (Jan Novák) s tooltipem "Jan Novák — Harmonogram"

  Scenario: Presence se aktualizuje při změně záložky
    Given "jan.novak" je na záložce Harmonogram
    When "jan.novak" přejde na záložku Kapacita
    Then "petra.kolarova" vidí tooltip u avataru "JN" změněný na "Jan Novák — Kapacita"

  Scenario: Presence se aktualizuje při odpojení
    Given "jan.novak" a "petra.kolarova" jsou v projektu
    When "jan.novak" zavře záložku prohlížeče
    Then do 10 sekund "petra.kolarova" přestane vidět avatar "JN" v hlavičce

  Scenario: Conflict při simultánní editaci stejného pole — last-write-wins
    Given "jan.novak" i "petra.kolarova" mají otevřený detail úkolu "Refaktoring API vrstvy"
    When "jan.novak" změní počet MD na 20 a uloží
    And téměř současně "petra.kolarova" změní počet MD na 18 a uloží
    Then server přijme změnu jednoho z uživatelů (ten který dorazil první)
    And druhý uživatel dostane diff se skutečnou hodnotou
    And druhý uživatel vidí diskrétní notifikaci "Hodnota pole MD byla změněna jiným uživatelem"
    And výsledná hodnota MD je konzistentní pro oba uživatele

  Scenario: Dva uživatelé editují různá pole stejného úkolu — bez konfliktu
    Given "jan.novak" změní název úkolu "Refaktoring API vrstvy" na "API Refactoring"
    And "petra.kolarova" současně změní progress na 75%
    Then obě změny jsou přijaty serverem
    And "jan.novak" vidí úkol s názvem "API Refactoring" a progressem 75%
    And "petra.kolarova" vidí úkol s názvem "API Refactoring" a progressem 75%

  Scenario: Reconnect po výpadku sítě
    Given "jan.novak" byl dočasně odpojen od sítě po dobu 30 sekund
    And mezitím "petra.kolarova" přidala úkol "Database migration"
    When se "jan.novak" znovu připojí (SignalR reconnect)
    Then "jan.novak" automaticky dostane aktuální stav projektu
    And vidí úkol "Database migration"
    And UI nezobrazí prázdný stav nebo chybu

  Scenario: Offline change replay po reconnectu bez konfliktu
    Given "jan.novak" je offline
    And "jan.novak" přesune úkol "Refaktoring API vrstvy" na W5-W8
    And mezitím "petra.kolarova" nezměnila tento úkol
    When se "jan.novak" znovu připojí
    Then aplikace automaticky přehraje pending command na server
    And "petra.kolarova" vidí úkol "Refaktoring API vrstvy" na W5-W8
    And banner "Offline" zmizí a zobrazí se "Synchronizováno — 1 změna přenesena"

  Scenario: Conflict resolution dialog po offline
    Given "jan.novak" je offline a přesune úkol "Refaktoring API vrstvy" na W5-W8
    And mezitím "petra.kolarova" přesune stejný úkol na W2-W3
    When se "jan.novak" znovu připojí
    Then se zobrazí dialog Conflict Resolution
    And dialog zobrazuje: "Úkol Refaktoring API vrstvy — Pozice: Server má W2-W3, Vaše změna: W5-W8"
    When "jan.novak" vybere "Použít moji verzi"
    Then úkol je přesunut na W5-W8 pro všechny uživatele

  Scenario: Restart serveru — automatický reconnect klientů
    Given "jan.novak" a "petra.kolarova" mají projekt otevřený
    When server je restartován (Windows Service restart)
    Then klienti automaticky reconnectují do 30 sekund
    And oba uživatelé dostanou čerstvý stav projektu ze serveru
    And žádná data nejsou ztracena (poslední stav byl persistován před restartem)
