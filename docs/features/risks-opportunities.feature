Feature: Stav, rizika a příležitosti

  Background:
    Given existuje projekt "Backend refaktoring"
    And projekt má členy: "jan.novak" (PM), "petra.kolarova" (Dev)
    And "jan.novak" je přihlášen a má projekt otevřený na záložce "Stav & Rizika"

  Scenario: Přidání rizika se závažností HIGH
    When "jan.novak" klikne "Přidat riziko"
    And vybere závažnost "HIGH — Vysoké"
    And zadá zodpovědnou osobu "Jan Novák"
    And zadá název "Zpoždění externího dodavatele"
    And zadá detail "Dodavatel API komponent má skluz 3 týdny, ovlivňuje W8-W12"
    And klikne "Přidat"
    Then riziko "Zpoždění externího dodavatele" je zobrazeno v sekci rizik
    And je označeno červeným štítkem "VYSOKÉ"
    And je viditelné i "petra.kolarova"

  Scenario: Přidání rizika se závažností MEDIUM
    When "jan.novak" přidá riziko závažnosti MEDIUM "Fluktuace v týmu"
    Then riziko je označeno oranžovým štítkem "STŘEDNÍ"

  Scenario: Přidání rizika se závažností LOW
    When "jan.novak" přidá riziko závažnosti LOW "Drobné technické dluhy"
    Then riziko je označeno zeleným štítkem "NÍZKÉ"

  Scenario: Editace existujícího rizika
    Given projekt má riziko "Zpoždění externího dodavatele" (HIGH)
    When "jan.novak" klikne na ikonu editace u rizika "Zpoždění externího dodavatele"
    And změní závažnost na "MEDIUM"
    And změní detail na "Skluz byl upraven na 1 týden, dopad minimální"
    And klikne "Uložit"
    Then riziko "Zpoždění externího dodavatele" zobrazuje závažnost "STŘEDNÍ"
    And detail je aktualizován

  Scenario: Smazání rizika (PM)
    Given projekt má riziko "Obsoletní riziko"
    When "jan.novak" klikne na ikonu smazání u "Obsoletní riziko"
    And potvrdí dialog
    Then riziko "Obsoletní riziko" zmizí ze seznamu

  Scenario: Dev nemůže přidávat ani mazat rizika
    Given "petra.kolarova" je přihlášena a je na záložce "Stav & Rizika"
    Then tlačítko "Přidat riziko" je neaktivní nebo chybí
    And u existujících rizik nejsou ikony editace ani smazání

  Scenario: Přidání příležitosti
    When "jan.novak" klikne "Přidat příležitost"
    And zadá název "Zrychlení nasazení pomocí nového CI/CD"
    And zadá detail "Přechod na GitHub Actions zkrátí deployment z 30 min na 5 min"
    And klikne "Přidat"
    Then příležitost "Zrychlení nasazení pomocí nového CI/CD" je zobrazena v sekci příležitostí

  Scenario: Editace příležitosti
    Given projekt má příležitost "Nová knihovna pro testování"
    When "jan.novak" klikne na editaci příležitosti
    And změní název na "Nová testovací knihovna — 30% méně kódu"
    And klikne "Uložit"
    Then příležitost je aktualizována s novým názvem

  Scenario: Smazání příležitosti (PM)
    Given projekt má příležitost "Zastaralá příležitost"
    When "jan.novak" klikne na smazání příležitosti a potvrdí dialog
    Then příležitost zmizí ze seznamu

  Scenario: Editace poznámek k projektu (PM)
    When "jan.novak" klikne do pole "Poznámky k projektu"
    And napíše "Sprint 5 proběhl dle plánu. Tým pracuje dobře."
    And klikne mimo pole (blur)
    Then poznámky jsou uloženy na serveru
    And "petra.kolarova" vidí tyto poznámky (read-only)

  Scenario: Dev nemůže editovat poznámky k projektu
    Given "petra.kolarova" je na záložce "Stav & Rizika"
    Then pole "Poznámky k projektu" je read-only

  Scenario: Přidání záznamu do changelogu / meeting logu
    When "jan.novak" zadá text "Sprint planning 11.8.2026 — dohodnut scope pro Q3" do pole pro nový záznam
    And klikne "Přidat záznam"
    Then záznam je přidán s datem "11.8.2026" a textem "Sprint planning 11.8.2026 — dohodnut scope pro Q3"
    And záznam je zobrazen na vrcholu seznamu (nejnovější nahoře)

  Scenario: Záznamy changelogu jsou chronologicky seřazeny
    Given changelog má záznamy z 1.8., 5.8. a 10.8.2026
    Then záznamy jsou seřazeny: 10.8. → 5.8. → 1.8. (nejnovější nahoře)

  Scenario: Dev vidí changelog ale nemůže přidávat záznamy
    Given "petra.kolarova" je na záložce "Stav & Rizika"
    Then changelog záznamy jsou zobrazeny
    And tlačítko "Přidat záznam" je neaktivní nebo chybí

  Scenario: Automatické vygenerování statusové zprávy
    Given projekt má: 3 rizika (1 HIGH, 1 MEDIUM, 1 LOW), celkový progress 45%, 2 příležitosti
    When "jan.novak" klikne tlačítko "AUTO" u pole pro statusovou zprávu
    Then je vygenerován text sumarizující stav projektu
    And text obsahuje: celkový progress, počet a závažnost rizik, přehled příležitostí
    And "jan.novak" může text před uložením upravit

  Scenario: Rizika jsou seřazena dle závažnosti
    Given projekt má rizika: LOW "Drobný problém", HIGH "Kritický problém", MEDIUM "Středně závažný"
    Then rizika jsou zobrazena v pořadí: HIGH → MEDIUM → LOW

  Scenario: Rozepsaná statusová zpráva přežije přepnutí záložky
    # Zpráva se generuje právě proto, aby si k ní člověk došel pro čísla jinam.
    # Přepnutí view komponentu odmountuje, takže `useState` obsah zahodil.
    Given "jan.novak" si nechal vygenerovat statusovou zprávu a doplnil do ní vlastní text
    When přepne na záložku Harmonogram a vrátí se na Stav & Rizika
    Then je text statusové zprávy pořád vyplněný
    And koncept se drží per projekt, takže jiný projekt má vlastní

  Scenario: Poznámky k projektu jsou Markdown
    # Do poznámek se stejně píšou odkazy a odrážky. Přepínač zdroj ⇄ náhled je
    # tentýž vzor jako u popisu úkolu — mění jen zobrazení, nic neukládá.
    Given "jan.novak" je na záložce Stav & Rizika
    When napíše do poznámek "## Kontakty\n\n- [Wiki](https://wiki.firma.cz)"
    And přepne na náhled
    Then je zobrazen nadpis "Kontakty" a odkaz "Wiki"
    When přepne zpět na zdroj
    Then vidí původní text s hvězdičkami a pomlčkami
