Feature: Dokumentace — Knowledge Base

  Background:
    Given existuje projekt "Backend refaktoring"
    And projekt má členy: "jan.novak" (PM), "petra.kolarova" (Dev)
    And projekt má KB stránku "Technická architektura" s obsahem "## Přehled\n\nAplikace používá třívrstvou architekturu..."
    And "petra.kolarova" je přihlášena a má projekt otevřený na záložce Dokumentace

  Scenario: Zobrazení seznamu KB stránek
    Then levý panel zobrazuje seznam stránek: "Technická architektura"
    And stránky jsou seřazeny dle data poslední úpravy (nejnovější nahoře)

  Scenario: Zobrazení obsahu KB stránky
    When "petra.kolarova" klikne na "Technická architektura" v seznamu
    Then je zobrazen obsah stránky jako formátovaný markdown
    And nadpis "Přehled" je zobrazen jako H2

  Scenario: Přidání nové KB stránky (Dev)
    When "petra.kolarova" klikne na tlačítko "+ Nová stránka"
    Then se zobrazí prázdná stránka v editačním módu
    And "petra.kolarova" zadá název "Deployment postup"
    And zadá obsah "## Kroky\n\n1. Build Docker image\n2. Push do registry\n3. Deploy na server"
    And klikne "Uložit"
    Then stránka "Deployment postup" se zobrazí v seznamu
    And obsah je uložen na serveru
    And "jan.novak" vidí novou stránku

  Scenario: PM může také přidávat KB stránky
    Given "jan.novak" je přihlášen a je na záložce Dokumentace
    When klikne "+ Nová stránka" a přidá stránku "Onboarding checklist"
    Then stránka je uložena a viditelná oběma uživatelům

  Scenario: Editace KB stránky
    Given "petra.kolarova" má otevřenou stránku "Technická architektura"
    When klikne na tlačítko "Editovat"
    Then stránka přejde do editačního módu (textarea s markdown obsahem)
    When přidá na konec "## Databáze\n\nSQLite s WAL módem"
    And klikne "Uložit"
    Then stránka je uložena s novým obsahem
    And "jan.novak" vidí aktualizovaný obsah

  Scenario: Live preview markdownu při editaci
    Given "petra.kolarova" edituje KB stránku
    When přepne na záložku "Preview"
    Then je zobrazen formátovaný HTML render aktuálního markdown obsahu
    And nadpisy, tučný text, odrážky jsou správně formátovány

  Scenario: Zrušení editace bez uložení
    Given "petra.kolarova" edituje stránku "Technická architektura"
    And provedla změny ale ještě neklikla "Uložit"
    When klikne "Zrušit"
    Then je zobrazen dialog "Máte neuložené změny. Opravdu chcete zrušit?"
    When potvrdí
    Then stránka se zobrazí v původním stavu bez uložených změn

  Scenario: Smazání KB stránky
    Given "jan.novak" je přihlášen a má otevřenou stránku "Zastaralá dokumentace"
    When klikne "Smazat stránku"
    And potvrdí dialog "Opravdu smazat stránku Zastaralá dokumentace?"
    Then stránka zmizí ze seznamu
    And je trvale odstraněna ze serveru

  Scenario: Dev může smazat KB stránku
    Given "petra.kolarova" má otevřenou stránku "Technická architektura"
    When klikne "Smazat stránku" a potvrdí dialog
    Then stránka je smazána

  Scenario: Fulltext vyhledávání v KB
    Given projekt má 5 KB stránek, z nichž 2 obsahují slovo "Docker"
    When "petra.kolarova" zadá "Docker" do vyhledávacího pole
    Then jsou zobrazeny pouze 2 stránky obsahující "Docker"
    And hledaný výraz je zvýrazněn v náhledu stránky

  Scenario: Vyhledávání hledá v názvech i obsahu
    Given KB stránka "Deployment postup" obsahuje text "...použijeme Kubernetes cluster..."
    When "petra.kolarova" zadá "Kubernetes" do vyhledávání
    Then stránka "Deployment postup" je zobrazena ve výsledcích

  Scenario: Vymazání vyhledávání zobrazí všechny stránky
    Given "petra.kolarova" vyhledávala "Docker" a jsou zobrazeny 2 stránky
    When vymaže vyhledávací pole
    Then jsou zobrazeny všechny KB stránky

  Scenario: Historie verzí stránky
    Given stránka "Technická architektura" byla dvakrát upravena
    When "petra.kolarova" klikne na "Historie"
    Then je zobrazen seznam předchozích verzí s datem a autorem, od nejnovější
    And u každé verze je náhled obsahu

  Scenario: Obnovení starší verze stránky
    Given "petra.kolarova" má otevřenou historii stránky "Technická architektura"
    When klikne na "Obnovit" u verze z 12.8.2026
    And potvrdí dialog
    Then obsah stránky je nahrazen obsahem té verze
    And obnovení se uloží jako běžná změna, takže je vratné stejnou cestou
    And "jan.novak" vidí obnovený obsah

  Scenario: Smazaná stránka zůstává v historii
    Given projekt má stránku "Zastaralá dokumentace"
    When "jan.novak" stránku smaže
    Then její poslední znění zůstává dohledatelné v historii

  Scenario: Historie je omezená na 50 verzí
    Given stránka "Technická architektura" má 50 uložených verzí
    When je uložena další změna
    Then nejstarší verze je odstraněna
    And historie obsahuje stále 50 verzí

  Scenario: Přidání štítků ke stránce
    Given "petra.kolarova" edituje stránku "Deployment postup"
    When přidá štítky "provoz" a "docker"
    And klikne "Uložit"
    Then štítky jsou zobrazeny u stránky v seznamu

  Scenario: Filtrování stránek podle štítku
    Given projekt má 3 stránky se štítkem "provoz" a 5 bez něj
    When "petra.kolarova" klikne na štítek "provoz"
    Then jsou zobrazeny pouze 3 stránky se štítkem "provoz"
    And filtr lze zrušit kliknutím na "Vše"

  Scenario: Simultánní editace stejné KB stránky
    Given "jan.novak" má otevřenou stránku "Technická architektura" v editačním módu
    And "petra.kolarova" otevře tutéž stránku v editačním módu
    When "jan.novak" uloží změny
    Then "petra.kolarova" obdrží notifikaci "Tato stránka byla upravena jiným uživatelem. Chcete obnovit obsah?"
    And "petra.kolarova" si může vybrat: "Obnovit" (ztratí své změny) nebo "Zachovat mé změny" (přepíše serverovou verzi)
    And přepsaná serverová verze zůstává v historii stránky, takže není ztracená

  Scenario: Markdown rendering — všechny základní elementy
    Given KB stránka obsahuje:
      """
      # Nadpis H1
      ## Nadpis H2
      **Tučný text** a *kurzíva*
      - Odrážka 1
      - Odrážka 2
      1. Číslovka 1
      `inline code`
      ```
      blok kódu
      ```
      """
    When "petra.kolarova" zobrazí stránku v preview
    Then všechny markdown elementy jsou správně renderovány jako HTML
