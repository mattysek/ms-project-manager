Feature: Moje práce napříč projekty (PRD-08)

  Kapacita je vlastnost člověka, ale úkoly i alokace žijí uvnitř jednoho
  projektu. Kdo je na třech projektech po 100 %, není v žádném z nich
  přetížený — a přitom to nemá šanci stihnout. Tahle obrazovka je jediné
  místo, kde je to vidět.

  Background:
    Given "petra.kolarova" je členem projektů "Backend refaktoring" a "Mobilní klient"
    And v obou je spárovaná s osobou (FR-ROLE-07)

  Scenario: Úkoly ze všech projektů na jedné obrazovce
    When "petra.kolarova" otevře "Moje práce"
    Then vidí své úkoly z obou projektů
    And u každého je uvedený projekt, ve kterém leží

  Scenario: Cizí úkoly se do přehledu nedostanou
    Given "jan.novak" má v "Backend refaktoring" vlastní úkoly
    When "petra.kolarova" otevře "Moje práce"
    Then Janovy úkoly nevidí

  Scenario: Úkoly jsou seskupené podle kalendářních týdnů
    # `Task.s`/`e` jsou čísla týdnů *svého* projektu (ADR-014), takže W5
    # v jednom projektu je jiný týden než W5 v druhém. Server je proto převádí
    # na kalendářní data.
    Given projekt "Backend refaktoring" začíná 2026-01-05 a "Mobilní klient" 2026-02-02
    And "petra.kolarova" má v obou úkol ve W1 svého projektu
    When otevře "Moje práce"
    Then ty dva úkoly jsou ve dvou různých týdnech, ne v jednom

  Scenario: Přetížení napříč projekty je vidět
    Given "petra.kolarova" má v jednom týdnu 3 MD v "Backend refaktoring"
    And ve stejném týdnu 4 MD v "Mobilní klient"
    When otevře "Moje práce"
    Then u toho týdne vidí "7 / 5 MD"
    And číslo je červené, protože přesahuje dostupnost

  Scenario: Sváteční týden má menší dostupnost
    # Dostupnost počítá klient z českých svátků (ADR-005), server ji neposílá.
    Given v týdnu od 2026-05-04 je státní svátek 8. 5.
    When "petra.kolarova" otevře "Moje práce"
    Then u toho týdne je dostupnost 4 MD, ne 5

  Scenario: Úkol bez termínu se ukáže zvlášť
    Given projekt "Mobilní klient" nemá nastavené datumy
    When "petra.kolarova" otevře "Moje práce"
    Then jeho úkoly jsou v sekci "Bez termínu"
    And nezkreslují vytížení žádného týdne

  Scenario: Archivované projekty se do přehledu nepočítají
    Given projekt "Mobilní klient" je archivovaný
    When "petra.kolarova" otevře "Moje práce"
    Then vidí jen úkoly z "Backend refaktoring"

  Scenario: Proklik otevře detail toho úkolu
    # Otevřít jen projekt nestačí: uživatel už jednou řekl, o který úkol jde,
    # a hledat ho znovu mezi desítkami řádků je práce navíc. Vlastní obrazovka
    # pro detail nevzniká — úkol se ukazuje tam, kde se i edituje.
    When "petra.kolarova" klikne v přehledu na úkol z "Mobilní klient"
    Then se otevře projekt "Mobilní klient" na záložce Úkoly
    And rovnou je rozbalený detail toho úkolu
    When detail zavře a otevře znovu jiný úkol
    Then se předchozí detail sám neotevře

  Scenario: Přehled začíná na aktuálním týdnu
    # Seznam obsahuje i týdny, které už jsou za námi — nedokončený úkol
    # z minulého měsíce v něm zůstává. Bez posunu uživatel přistane na
    # nejstarší rozdělané práci a k dnešku se musí prorolovat.
    Given "petra.kolarova" má úkoly v minulých i v budoucích týdnech
    When otevře "Moje práce"
    Then je obrazovka posunutá na aktuální týden
    And ten týden je označený jako "tento týden"

  Scenario: Bez práce v aktuálním týdnu se přehled posune na nejbližší další
    Given "petra.kolarova" nemá tento týden žádný úkol
    And nejbližší práci má za dva týdny
    When otevře "Moje práce"
    Then je obrazovka posunutá na ten týden

  Scenario: Ruční obnovení uživatele neodroluje zpátky
    # Přehled se obnovuje často (čte se mimo actory), takže by ho posun při
    # každém kliknutí vytrhl z místa, kam se právě prokoukal.
    Given "petra.kolarova" je v přehledu odrolovaná jinam
    When klikne "Obnovit"
    Then se obrazovka na aktuální týden znovu neposune

  Scenario: Přehled přiznává, že může být pozadu
    # Čte se mimo actory (ADR-015), takže může být až o jeden persist tick
    # pozadu. Radši to řekneme, než aby si uživatel myslel, že je živý.
    When "petra.kolarova" otevře "Moje práce"
    Then podhlavička uvádí, že údaje mohou být až 5 s staré

  Scenario: Bez spárované osoby přehled vysvětlí, co chybí
    # Bez vazby osoba ↔ účet nemá uživatel „vlastní" nic (ADR-006), takže by
    # obrazovka jinak mlčela a vypadala rozbitě.
    Given "novy.clen" není v žádném projektu spárovaný s osobou
    When otevře "Moje práce"
    Then se dozví, že ho musí PM v Kapacitě spárovat s osobou
