Feature: Role a oprávnění

  Background:
    Given existuje projekt "Backend refaktoring" s datumy 2026-01-05 až 2026-07-03
    And projekt má členy: "jan.novak" (PM) a "petra.kolarova" (Dev)
    And projekt má osoby: "Jan Novák" (AR), "Petra Kolářová" (BE)
    And projekt má úkol "API refaktoring" přiřazený "Petra Kolářová", W1-W4, 15 MD
    And projekt má úkol "Infrastruktura" přiřazený "Jan Novák", W1-W2, 5 MD

  Scenario: PM může editovat metadata projektu
    Given "jan.novak" je přihlášen a má projekt otevřený na záložce Projekt
    When změní název projektu na "Backend refaktoring v2"
    And změní datum konce projektu na "2026-09-30"
    And klikne mimo pole
    Then jsou změny uloženy
    And název v záhlaví se aktualizuje na "Backend refaktoring v2"

  Scenario: Dev nemůže editovat metadata projektu
    Given "petra.kolarova" je přihlášena a má projekt otevřený na záložce Projekt
    Then pole "Název projektu" je zobrazeno jako read-only
    And pole "Datum zahájení" je zobrazeno jako read-only
    And pole "Datum ukončení" je zobrazeno jako read-only
    And pole "Rozpočet (MD)" je zobrazeno jako read-only

  Scenario: PM může přidat a smazat milník
    Given "jan.novak" má projekt otevřený na záložce Projekt
    When přetáhne milník "M1 — Alpha release" na týden W8
    Then milník je uložen na pozici W8
    When klikne na "Smazat" u milníku "M1 — Alpha release"
    Then milník je odstraněn

  Scenario: Dev vidí milníky ale nemůže je přesouvat
    Given "petra.kolarova" má projekt otevřený na záložce Harmonogram
    Then milníky jsou zobrazeny v Gantt view
    And při pokusu o drag milníku se nic nestane (drag je blokován)

  Scenario: Dev může editovat vlastní úkol
    Given "petra.kolarova" má projekt otevřený na záložce Úkoly
    When klikne na úkol "API refaktoring" (přiřazený jí)
    Then se otevře TaskDetailModal s aktivními editačními prvky
    When změní název na "API refaktoring — fáze 1"
    And nastaví progress na 30%
    And klikne "Uložit"
    Then jsou změny uloženy a viditelné pro "jan.novak"

  Scenario: Dev nemůže editovat cizí úkol
    Given "petra.kolarova" má projekt otevřený na záložce Úkoly
    When klikne na úkol "Infrastruktura" (přiřazený "Jan Novák")
    Then se otevře TaskDetailModal
    And všechna pole jsou read-only
    And tlačítko "Uložit" je neaktivní nebo chybí

  Scenario: Dev nemůže smazat úkol
    Given "petra.kolarova" má projekt otevřený na záložce Úkoly
    When klikne na úkol "API refaktoring"
    Then tlačítko "Smazat úkol" je neaktivní s tooltipem "Tato akce vyžaduje roli Project Manager"

  Scenario: Dev může nastavit progress vlastního úkolu přes Gantt
    Given "petra.kolarova" má projekt otevřený na záložce Harmonogram
    When klikne na pruh "API refaktoring" v Gantt view
    And v detailu nastaví progress na 50%
    And klikne "Uložit"
    Then progress je uložen a pruh v Gantt view zobrazuje 50%

  Scenario: Dev může editovat vlastní alokaci v Kapacitě
    Given "petra.kolarova" má projekt otevřený na záložce Kapacita
    When změní alokaci pro týden W3 u "Petra Kolářová" na 80%
    Then změna je uložena
    And "jan.novak" vidí aktualizovanou alokaci

  Scenario: Dev nemůže editovat cizí alokaci
    Given "petra.kolarova" má projekt otevřený na záložce Kapacita
    Then alokační buňky u "Jan Novák" jsou read-only
    And při pokusu o zápis do buněk "Jan Novák" server vrátí chybu "Nedostatečná oprávnění"

  Scenario: Dev nevidí ADO Sync konfiguraci
    Given "petra.kolarova" má projekt otevřený
    When přejde na záložku "ADO Sync"
    Then sekce "Nastavení připojení" není zobrazena
    And pole pro zadání PAT není přítomno
    And tlačítko "Synchronizovat" je skryto nebo neaktivní

  Scenario: Dev vidí ADO Sync log
    Given projekt má záznamy v sync logu
    And "petra.kolarova" má projekt otevřený na záložce "ADO Sync"
    Then "petra.kolarova" vidí historii synchronizačních akcí
    And zobrazené záznamy jsou read-only

  Scenario: PM může spravovat členy projektu
    Given "jan.novak" má projekt otevřený na záložce Projekt
    When přejde do sekce "Členové projektu"
    Then vidí seznam členů s jejich rolemi
    And jsou dostupná tlačítka "Přidat člena", "Odebrat", "Změnit roli"

  Scenario: Dev nevidí sekci správy členů
    Given "petra.kolarova" má projekt otevřený na záložce Projekt
    Then sekce "Členové projektu" s tlačítky pro správu není přítomna
    Or je zobrazena jen jako read-only přehled bez akčních tlačítek

  Scenario: Server odmítne neautorizovaný command od Dev uživatele
    Given "petra.kolarova" je přihlášena jako Dev
    When aplikace (simulovaný útok) pošle command "{ type: 'update_project', fields: { name: 'Hack' } }" přes SignalR
    Then server vrátí error "Nedostatečná oprávnění: pouze PM může editovat metadata projektu"
    And projekt name zůstane nezměněný
    And "jan.novak" neobdrží žádný diff

  Scenario: PM může přidat riziko, Dev pouze číst
    Given "jan.novak" přidá riziko "Zpoždění dodavatele" se závažností high
    Then riziko je viditelné "petra.kolarova" na záložce Stav & Rizika
    And "petra.kolarova" nevidí tlačítka pro editaci nebo smazání rizik

  Scenario: Dev smí editovat úkol osoby, se kterou je spárovaný
    # Zrcadlo ke scénářům „Dev nesmí…": ověřuje, že se do stavu „tohle je moje"
    # jde vůbec dostat. Než vzniklo FR-ROLE-07, nešlo — a nikdo si toho nevšiml,
    # protože všechny testy ověřovaly jen platnost zákazu.
    Given projekt má osobu "Nový člen" bez přiřazeného účtu
    And ta osoba má úkol "Frontend úpravy"
    And "novy.clen" je v projektu Dev
    When "novy.clen" zkusí změnit progress úkolu bez přiřazeného účtu
    Then je command odmítnut
    When "jan.novak" přiřadí osobě "Nový člen" účet "novy.clen"
    And "novy.clen" znovu změní progress úkolu na 40 %
    Then je změna přijata a rozeslána ostatním

  Scenario: Odebrání člena z projektu zruší jeho vazbu na osobu
    # Jinak by osoba zůstala navázaná na účet, který do projektu už nesmí, a po
    # jeho vrácení by mu tiše vrátila práva k úkolům, o kterých nic neví.
    Given osoba "Petra Kolářová" má přiřazený účet "petra.kolarova"
    When "jan.novak" odebere "petra.kolarova" z projektu
    Then osoba "Petra Kolářová" zůstává v projektu, ale bez účtu
    And ostatní členové dostanou diff "person_updated"
