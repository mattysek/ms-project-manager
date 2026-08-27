Feature: Kapacita — správa týmu a alokací

  Background:
    Given existuje projekt "Backend refaktoring" s datumy 2026-01-05 až 2026-07-03 (26 týdnů)
    And projekt má role: "AR" (Solution Architect), "BE" (Back-end Developer)
    And projekt má osoby: "Jan Novák" (AR, barva #4f9cf9), "Petra Kolářová" (BE, barva #34d399)
    And obě osoby mají defaultní alokaci 100% po celý projekt
    And "jan.novak" je přihlášen jako PM a má projekt otevřený na záložce Kapacita

  Scenario: Zobrazení alokační tabulky
    Then tabulka zobrazuje řádky pro "Jan Novák" a "Petra Kolářová"
    And sloupce odpovídají 26 týdnům projektu
    And každá buňka zobrazuje procento alokace (default 100)
    And záhlaví zobrazuje skupiny měsíců

  Scenario: Přidání nové osoby
    When "jan.novak" klikne "Přidat osobu"
    And zadá jméno "Tomáš Vondráček"
    And vybere roli "BE"
    And vybere barvu #fbbf24 (žlutá)
    And klikne "Přidat"
    Then "Tomáš Vondráček" se zobrazí jako nový řádek v alokační tabulce
    And všechny buňky mají defaultní hodnotu 100%
    And osoba je uložena na serveru

  Scenario: Smazání osoby (PM)
    When "jan.novak" klikne na ikonu smazání u "Petra Kolářová"
    And potvrdí dialog "Opravdu odebrat Petra Kolářová z projektu? Přiřazené úkoly přejdou do backlogu."
    Then "Petra Kolářová" zmizí z alokační tabulky
    And úkoly přiřazené "Petra Kolářová" jsou přesunuty do backlogu (person = null)

  Scenario: Editace alokace po týdnech (PM)
    When "jan.novak" klikne na buňku W5 u "Petra Kolářová"
    And změní hodnotu na "50"
    And stiskne Tab (přesun na W6)
    Then buňka W5 u "Petra Kolářová" zobrazuje 50%
    And command "update_alloc" je odeslán na server s personId, weekIdx=4, pct=50
    And celkový MD u "Petra Kolářová" se přepočítá

  Scenario: Editace alokace — 0% (nepřítomnost)
    When "jan.novak" nastaví alokaci W10 u "Jan Novák" na 0%
    Then buňka W10 je vizuálně odlišena (prázdná/šedá)
    And při výpočtu MD tento týden nepřispívá

  Scenario: Editace alokace — neplatná hodnota
    When "jan.novak" zadá do buňky alokace hodnotu "150"
    Then je zobrazena chybová zpráva "Alokace musí být mezi 0 a 100"
    And předchozí hodnota je obnovena

  Scenario: Dev uživatel může editovat pouze vlastní alokaci
    Given "petra.kolarova" je přihlášena jako Dev a má projekt otevřený na záložce Kapacita
    When klikne na buňku W5 u "Petra Kolářová" (vlastní řádek)
    Then buňka je editovatelná
    And změní hodnotu na "80"
    And klikne mimo buňku
    Then hodnota 80% je uložena

  Scenario: Dev nemůže editovat cizí alokaci
    Given "petra.kolarova" je přihlášena jako Dev
    When klikne na buňku W5 u "Jan Novák"
    Then buňka není editovatelná (read-only)
    And při pokusu o zápis server vrátí chybu "Nedostatečná oprávnění: Dev může editovat pouze vlastní alokaci"

  Scenario: Zobrazení celkového MD na osobu
    # Ilustrace vzorce nad kalendářem bez svátků: MD = suma(pracovní dny × alokace).
    # Se skutečnými svátky vyjde jiné číslo — viz scénář níž.
    Given "Jan Novák" má 26 týdnů × 100% alokace a každý týden má 5 pracovních dní
    Then zobrazený celkový MD "Jan Novák" je 130 MD (26 × 5 × 100 %)
    When "jan.novak" sníží alokaci W1 na 50%
    Then celkový MD "Jan Novák" se přepočítá na 127,5 MD

  Scenario: Kapacita počítá se státními svátky
    # Harmonogram svátky zohledňuje (gantt.feature), kapacita musí taky —
    # jinak nástroj nadhodnocuje dostupné MD celého týmu.
    Given projekt trvá 2026-01-05 až 2026-07-03
    And do rozsahu spadají 4 státní svátky ve všední den (3.4., 6.4., 1.5., 8.5.)
    And "Jan Novák" má 100% alokaci po celý projekt
    Then zobrazený celkový MD "Jan Novák" je 126 MD, ne 130
    When "jan.novak" sníží alokaci W1 (bez svátku) na 50%
    Then celkový MD "Jan Novák" se přepočítá na 123,5 MD

  Scenario: Správa rolí — přidání nové role (PM)
    When "jan.novak" klikne na "Správa rolí"
    And klikne "Nová role"
    And zadá klíč "QA"
    And zadá label "Quality Assurance"
    And klikne "Přidat"
    Then role "QA — Quality Assurance" je dostupná při přidávání nebo editaci osoby

  Scenario: Správa rolí — smazání role s existujícími osobami
    Given role "BE" je přiřazena "Petra Kolářová"
    When "jan.novak" se pokusí smazat roli "BE"
    Then je zobrazeno varování "Role BE je přiřazena 1 osobě. Odebráním role se zachová osoba, ale její role bude prázdná."
    When potvrdí smazání
    Then role "BE" je odstraněna
    And "Petra Kolářová" nemá přiřazenou roli (zobrazí se jako prázdná)

  Scenario: Sumář kapacity dle rolí
    Given projekt má 1 AR (Jan Novák, 130 MD) a 1 BE (Petra Kolářová, 130 MD)
    Then sekce "Kapacita dle rolí" zobrazuje:
      | Role | Osoba | MD |
      | AR   | Jan Novák | 130 |
      | BE   | Petra Kolářová | 130 |
    And celkový součet projektu je 260 MD

  Scenario: Zobrazení rozpočtu, naplánované práce a kapacity
    # Proti rozpočtu se dřív porovnávala jen kapacita, tedy „má tým víc lidí,
    # než rozpočet platí". Otázka PM je jiná — „vejde se naplánovaná práce do
    # rozpočtu" — a součet MD úkolů se s rozpočtem neporovnával nikde.
    Given rozpočet projektu je 250 MD
    And celková kapacita týmu je 260 MD
    And úkoly projektu mají dohromady 262 MD
    Then záhlaví Kapacity zobrazuje "Rozpočet: 250 MD | Naplánováno: 262 MD | Kapacita: 260 MD"
    And číslo je červené, protože naplánovaná práce přesahuje rozpočet o víc než 8 MD

  Scenario: Naplánovaná práce zahrnuje i backlog
    # Nepřiřazený úkol je pořád práce, kterou někdo odvede — jen se zatím neví kdo.
    Given projekt má úkoly za 200 MD přiřazené osobám
    And backlog obsahuje úkoly za 30 MD
    Then "Naplánováno" je 230 MD

  Scenario: Kapacita nad rozpočtem sama o sobě není chyba
    # Barvu řídí naplánovaná práce, ne kapacita: tým může být větší než
    # rozpočet a přesto se plán do peněz vejde.
    Given rozpočet projektu je 250 MD
    And celková kapacita týmu je 260 MD
    And úkoly projektu mají dohromady 240 MD
    Then číslo v záhlaví Kapacity je zelené

  Scenario: Přetížení osoby v konkrétním týdnu
    Given "Petra Kolářová" má ve W5 alokaci 100% a 5 pracovních dní (5 MD kapacity)
    And má ve W5 rozpracované úkoly za 8 MD
    Then buňka W5 u "Petra Kolářová" je označena jako přetížená
    And tooltip zobrazuje "Kapacita 5 MD, přiřazeno 8 MD — přetíženo o 3 MD"

  Scenario: Nevyužitá kapacita v týdnu
    Given "Jan Novák" má ve W7 alokaci 100% (5 MD kapacity)
    And nemá ve W7 přiřazený žádný úkol
    Then buňka W7 u "Jan Novák" je označena jako nevyužitá

  Scenario: Přehled přetížení nad tabulkou
    Given v projektu je 6 týdnů, kde je někdo přetížený
    Then nad alokační tabulkou je shrnutí "Přetížení: 6 týdnů"
    And kliknutím se tabulka odscrolluje na první přetížený týden

  Scenario: Přetížení sedí na stejném týdnu jako v Ganttu
    # ADR-014. Kapacita četla `s`/`e` jako indexy pole, Gantt jako 1-based čísla
    # týdnů, takže obě záložky odpovídaly na tutéž otázku o týden vedle.
    Given "Petra Kolářová" má úkol za 8 MD v týdnu W3 (kapacita 5 MD)
    Then pruh úkolu je v Ganttu nakreslen ve sloupci W3
    And Gantt označí W3 u "Petra Kolářová" jako přetížený
    And buňka W3 u "Petra Kolářová" je v Kapacitě označena jako přetížená
    And shrnutí nad tabulkou uvádí jako první přetížený týden "W3"

  Scenario: Práce v posledním týdnu projektu se započítá
    # Ořez `Math.min(weeks.length - 1, task.e)` vyráběl u úkolu v posledním
    # týdnu prázdný rozpad MD, takže přetížení na konci projektu bylo neviditelné.
    Given projekt má 8 týdnů
    And "Petra Kolářová" má ve W8 alokaci 100% (5 MD kapacity)
    And má ve W8 úkol za 8 MD
    Then buňka W8 u "Petra Kolářová" je označena jako přetížená

  Scenario: Přiřazení účtu přebere jméno z účtu
    # Řádek vzniká jako „Nový člen"; nechat ho tak po spárování s konkrétním
    # člověkem znamená přepisovat ručně to, co systém už zná.
    Given projekt má osobu "Nový člen" bez přiřazeného účtu
    When "jan.novak" jí přiřadí účet "Tomáš Vondráček"
    Then se osoba jmenuje "Tomáš Vondráček"
    And odejde jediný příkaz update_person s účtem i jménem

  Scenario: Zrušení vazby jméno nemění
    # Osoba v plánu zůstává, jen ji nikdo nevlastní — vyprázdnit jí jméno by
    # byla ztráta dat.
    Given osoba "Tomáš Vondráček" má přiřazený účet
    When "jan.novak" zvolí "— bez účtu —"
    Then se osoba pořád jmenuje "Tomáš Vondráček"

  Scenario: PM přiřadí osobě uživatelský účet
    # FR-ROLE-07. Bez tohohle kroku nemá Dev v projektu nic „vlastního" a role
    # je fakticky read-only — server vazbu uměl, UI ji nenabízelo.
    Given projekt má osobu "Externista" bez přiřazeného účtu
    And "petra.kolarova" je členem projektu
    When "jan.novak" vybere v Kapacitě u osoby "Externista" účet "Petra Kolářová"
    Then osoba "Externista" má přiřazený účet "petra.kolarova"
    And ostatní členové dostanou diff "person_updated"

  Scenario: PM zruší přiřazení účtu
    Given osoba "Petra Kolářová" má přiřazený účet "petra.kolarova"
    When "jan.novak" vybere u osoby volbu "— bez účtu —"
    Then osoba "Petra Kolářová" nemá přiřazený účet
    And "petra.kolarova" už nesmí editovat úkoly té osoby

  Scenario: Jeden účet nesmí patřit dvěma osobám
    # Dvě osoby se stejným účtem by znamenaly, že `ownsTask` platí pro obě —
    # autorizace by ztratila smysl. Hlídá to server, ne UI.
    Given osoba "Petra Kolářová" má přiřazený účet "petra.kolarova"
    When "jan.novak" zkusí přiřadit tentýž účet i osobě "Externista"
    Then je zobrazena chyba "Účet už je v tomto projektu přiřazen osobě Petra Kolářová"
    And osoba "Externista" zůstává bez účtu

  Scenario: Volbu účtu vidí Dev jen ke čtení
    Given "petra.kolarova" je v projektu Dev
    When otevře záložku Kapacita
    Then u každé osoby vidí přiřazený účet jako text
    And nemá k dispozici rozbalovací seznam pro jeho změnu
