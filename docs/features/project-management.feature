Feature: Správa projektů

  Background:
    Given existuje uživatel "jan.novak" (PM) a "petra.kolarova" (Dev)
    And "jan.novak" je přihlášen

  Scenario: Vytvoření nového projektu
    Given "jan.novak" je na stránce se seznamem projektů
    When klikne na tlačítko "Nový projekt"
    And zadá název projektu "Mobilní aplikace v2"
    And klikne "Vytvořit"
    Then je přesměrován do projektu "Mobilní aplikace v2"
    And projekt je zobrazen v seznamu projektů
    And "jan.novak" je automaticky přiřazen jako PM projektu

  Scenario: Otevření existujícího projektu
    Given existuje projekt "Backend refaktoring" kde je "jan.novak" PM
    And "jan.novak" je na stránce se seznamem projektů
    When klikne na projekt "Backend refaktoring"
    Then se otevře projekt "Backend refaktoring"
    And je zobrazeno view "Projekt"
    And záhlaví zobrazuje název projektu

  Scenario: Seznam projektů je seřazen dle poslední úpravy
    Given existují projekty "Projekt A" (upraven včera) a "Projekt B" (upraven před hodinou)
    When "jan.novak" přejde na stránku se seznamem projektů
    Then "Projekt B" je zobrazen jako první

  Scenario: Archivace projektu (PM only)
    Given existuje projekt "Starý projekt" kde je "jan.novak" PM
    When "jan.novak" klikne na "Archivovat" u projektu "Starý projekt" na LandingPage
    And potvrdí dialog
    Then projekt "Starý projekt" zmizí ze seznamu aktivních projektů
    And je zobrazen v sekci "Archiv"
    And jeho data (úkoly, soubory, členové) zůstávají zachována

  Scenario: Vrácení projektu z archivu
    Given projekt "Starý projekt" je archivovaný
    When "jan.novak" klikne na "Vrátit z archivu"
    Then projekt "Starý projekt" je opět v seznamu aktivních projektů
    And jeho data jsou beze změny

  Scenario: Smazat lze jen archivovaný projekt
    Given existuje aktivní projekt "Běžící projekt" kde je "jan.novak" PM
    Then u projektu "Běžící projekt" není nabídnuto "Smazat"
    And server na pokus o smazání odpoví "Smazat lze jen archivovaný projekt. Nejdřív ho archivujte."

  Scenario: Trvalé smazání archivovaného projektu (PM only)
    Given projekt "Starý projekt" je archivovaný
    When "jan.novak" klikne v archivu na "Smazat trvale" u projektu "Starý projekt"
    And potvrdí dialog "Opravdu trvale smazat projekt Starý projekt? Tuto akci nelze vrátit."
    Then projekt "Starý projekt" zmizí i z archivu
    And všechna data projektu (úkoly, soubory, členové) jsou trvale smazána

  Scenario: Dev uživatel nemůže smazat projekt
    Given existuje projekt "Aktivní projekt" kde je "petra.kolarova" Dev
    And "petra.kolarova" je přihlášena
    When "petra.kolarova" přejde na stránku se seznamem projektů
    Then tlačítko "Smazat" u projektu "Aktivní projekt" není přítomno nebo je neaktivní

  Scenario: Export projektu bez příloh jako JSON
    Given "jan.novak" má otevřený projekt "Backend refaktoring" bez souborových příloh
    When klikne na "Export" v hlavičce
    And vybere "Exportovat jako JSON"
    Then prohlížeč stáhne soubor "backend-refaktoring.json"
    And soubor obsahuje kompletní data projektu (tasks, people, risks, milestones, kb, todos)
    And soubor neobsahuje ADO PAT

  Scenario: Export projektu se soubory jako ZIP
    Given "jan.novak" má otevřený projekt "Backend refaktoring" s 3 soubory (PDF, XLSX, PNG)
    When klikne na "Export" v hlavičce
    Then prohlížeč stáhne soubor "backend-refaktoring.zip"
    And ZIP obsahuje "project.json" s metadaty projektu
    And ZIP obsahuje složku "files/" s 3 soubory

  Scenario: Import projektu z JSON souboru
    Given "jan.novak" je na LandingPage
    When klikne na "Importovat projekt"
    And vybere soubor "zaloha-projektu.json"
    Then se otevře importovaný projekt s daty ze souboru
    And projekt je uložen na serveru
    And "jan.novak" je PM importovaného projektu

  Scenario: Import projektu z ZIP souboru
    # Přílohy nesmí jet uvnitř `full_state_import`: `ImportedFile` nemá
    # `addedBy`, které je na serveru povinné pole `FileRef`, takže se celý
    # command odmítne na vazbě argumentů a z celého ZIPu se neuloží NIC.
    # Správné pořadí je stav bez příloh, pak upload přes REST (ADR-010).
    Given "jan.novak" je na LandingPage
    When klikne na "Importovat projekt"
    And vybere soubor "projekt-s-prilohy.zip"
    Then se importují data projektu i soubory
    And soubory jsou dostupné v sekci "Soubory"
    And příloha, kterou se nepodařilo nahrát, se ohlásí — import kvůli ní nepadá

  Scenario: Import do otevřeného projektu z hlavičky není
    # Import v hlavičce přepisoval celý stav otevřeného projektu jedním
    # `full_state_import` a stál vedle nenápadného „⬇ Export". Smysluplný import
    # je „ze zálohy udělej nový projekt" — ten je na LandingPage, kde nemá co
    # přepsat.
    Given "jan.novak" má otevřený projekt
    Then v hlavičce je jen "⬇ Export"
    And import je dostupný z LandingPage

  Scenario: Import velkého ZIPu s přílohami
    # Vzorek z provozu: 9,6 MB ZIP, 20 příloh, ~150 kB dat projektu. Narazil na
    # dvě nezávislé překážky, obě mlčky:
    #   1. naparsovaná data se odkládala do `sessionStorage` VČETNĚ base64
    #      obsahu příloh → „exceeded the quota" (limit ~5 MB),
    #   2. `full_state_import` je jeden příkaz (ADR-005) a přesáhl výchozí
    #      strop SignalR na zprávu (32 kB) → spadlé spojení, ne odmítnutý příkaz.
    Given "jan.novak" je na LandingPage
    When naimportuje ZIP s přílohami za 9 MB a daty projektu přes 100 kB
    Then se projekt otevře se všemi úkoly, osobami i dokumentací
    And přílohy se nahrají na server zvlášť přes REST
    And obsah příloh se nikdy neukládá do úložiště prohlížeče

  Scenario: Import staršího exportu bez vazby na účty
    # `Person.userId` (ADR-006) přibyl až s rolemi a na serveru je povinný.
    # Chybějící neoptional pole je tvrdá chyba vazby argumentů, takže starší
    # export neselhal „jen v osobách" — server odmítl celý příkaz a projekt
    # zůstal prázdný. Import je místo, kde se stará data dorovnávají na dnešek.
    Given "jan.novak" má export z verze, která osobám ještě neukládala účet
    When ho naimportuje
    Then se naimportují osoby i všechno ostatní
    And osoby jsou bez přiřazeného účtu, dokud je PM nespáruje

  Scenario: Import s neúplnou alokací kapacit
    # Alokaci kratší, než kolik má projekt týdnů, umí uložit jedině import —
    # `update_project` si délku srovnává sám (`recalculate`). Navenek to
    # nevypadalo jako poškozená data: klient chybějící týdny dopadá stovkami,
    # takže se tabulka Kapacity vykreslila celá. Zapsat do ní ale nešlo —
    # klient mapuje přes uložené pole, nad prázdným seznamem tedy nevznikne
    # žádná změna a tím ani žádný command. Procenta jen skákala zpátky
    # a na server neodešlo nic, bez chyby a bez odmítnutí.
    Given "jan.novak" má export, kde osoby mají kratší alokaci než kolik má projekt týdnů
    When ho naimportuje
    Then se alokace dorovná na počet týdnů projektu
    And chybějící týdny mají 100 %
    And už uložená procenta zůstanou beze změny

  Scenario: Import souboru s neplatným formátem
    Given "jan.novak" je na LandingPage
    When klikne na "Importovat projekt"
    And vybere soubor "dokument.docx"
    Then je zobrazena chybová zpráva "Nepodporovaný formát souboru. Použijte JSON nebo ZIP."

  Scenario: Přidání člena do projektu (PM)
    Given "jan.novak" je PM projektu "Backend refaktoring"
    And "petra.kolarova" existuje jako uživatel systému
    When "jan.novak" přejde do nastavení projektu (záložka Projekt)
    And klikne "Přidat člena"
    And vybere "Petra Kolářová" z dropdownu dostupných uživatelů
    And přiřadí roli "Vývojář (Dev)"
    And klikne "Přidat"
    Then "Petra Kolářová" je zobrazena v seznamu členů projektu s rolí "Dev"
    And "petra.kolarova" vidí projekt v seznamu svých projektů

  Scenario: Odebrání člena z projektu (PM)
    Given projekt "Backend refaktoring" má členy: "jan.novak" (PM), "petra.kolarova" (Dev)
    When "jan.novak" klikne na "Odebrat" u "Petra Kolářová"
    And potvrdí dialog
    Then "Petra Kolářová" zmizí ze seznamu členů projektu
    And "petra.kolarova" nemá přístup k projektu

  Scenario: Změna role člena projektu
    Given projekt "Backend refaktoring" má členy: "jan.novak" (PM), "petra.kolarova" (Dev)
    When "jan.novak" změní roli "petra.kolarova" na "PM"
    Then "Petra Kolářová" je zobrazena s rolí "PM"
    And "petra.kolarova" dostane diff "role_changed" na své spojení, ne PM, který změnu udělal
    And "petra.kolarova" má nově plný přístup jako PM bez nutnosti obnovit stránku

  Scenario: PM se nemůže odebrat jako poslední PM
    Given projekt "Backend refaktoring" má jednoho PM: "jan.novak"
    When "jan.novak" se pokusí odebrat sám sebe z projektu
    Then je zobrazena chybová zpráva "Projekt musí mít alespoň jednoho Project Managera"

  Scenario: Zavření projektu
    # Dřív se tu čekalo na debounced autosave. Ten po ADR-004 neexistuje:
    # každá změna odchází jako command hned při vzniku, takže není na co čekat.
    Given "jan.novak" má otevřený projekt a právě provedl změnu
    When klikne na "← Zpět" v hlavičce
    Then aplikace přejde na LandingPage okamžitě, bez čekání na uložení
    And změna už je na serveru, protože se odeslala v okamžiku vzniku

  Scenario: Úkol v posledním týdnu přežije uložení datumů projektu
    # ADR-014. Server ořezával `S`/`E` na `weekCount - 1`, tedy o týden míň,
    # než kolik je platných. Stačilo znovu uložit stejné datum a úkol z
    # posledního týdne se tiše posunul dopředu — včetně `task_updated` diffu,
    # takže se ten posun i uložil.
    Given projekt "Backend refaktoring" trvá 8 týdnů
    And "Petra Kolářová" má úkol "Nasazení" v posledním týdnu W8
    When "jan.novak" uloží v záložce Projekt stejné datum konce, jaké už tam je
    Then úkol "Nasazení" zůstává ve W8
    And ostatním členům nedorazí žádný diff, který by úkol posunul

  Scenario: Zkrácení projektu ořízne úkoly za novým koncem
    Given projekt "Backend refaktoring" trvá 8 týdnů
    And "Petra Kolářová" má úkol "Nasazení" ve W8
    When "jan.novak" zkrátí projekt na 6 týdnů
    Then úkol "Nasazení" je posunut do W6
    And ostatní členové dostanou diff "task_updated" s novým rozsahem

  Scenario: Archivovaný projekt je jen ke čtení
    # Archiv byl doteď jen filtr v seznamu: projekt z něj šlo otevřít a plně
    # editovat, protože `ArchivedAt` nekontroloval actor ani hub.
    Given projekt "Backend refaktoring" je archivovaný
    When "jan.novak" ho otevře z archivu
    Then vidí pruh "Projekt je archivovaný — jen ke čtení"
    And obsah projektu si může normálně prohlížet
    When zkusí změnit MD úkolu
    Then server command odmítne s hláškou "Projekt je archivovaný — nejdřív ho vraťte z archivu"
    And změna se v UI vrátí zpět

  Scenario: Do archivovaného projektu nelze nahrát přílohu
    # Přílohy jdou přes REST, ne přes hub — zámek archivu je proto musí
    # kontrolovat zvlášť.
    Given projekt "Backend refaktoring" je archivovaný
    When "jan.novak" zkusí nahrát soubor
    Then je požadavek odmítnut s hláškou "Projekt je archivovaný — nejdřív ho vraťte z archivu"

  Scenario: Vrácení z archivu zápis zase povolí
    Given projekt "Backend refaktoring" je archivovaný
    When "jan.novak" ho vrátí z archivu
    Then pruh o archivaci zmizí
    And změna MD úkolu se uloží

  Scenario: Sledování ostatních v archivovaném projektu funguje dál
    # Presence není obsah projektu, ale informace o tom, kdo se dívá — bez ní
    # by v archivu zmizely avatary ostatních čtenářů.
    Given projekt "Backend refaktoring" je archivovaný
    And "jan.novak" i "petra.kolarova" ho mají otevřený
    Then oba vidí avatar toho druhého
    And přepnutí záložky se ostatním promítne

  Scenario: Odmítnutý command uživatel uvidí
    # `ErrorOccurred` se zpracovával odjakživa (rollback na poslední potvrzený
    # stav), ale nikde se nevykresloval — změna se tiše vrátila zpět.
    Given "petra.kolarova" je v projektu Dev
    When zkusí smazat úkol, na což nemá oprávnění
    Then se zobrazí hláška "Nedostatečná oprávnění: pouze PM může mazat úkoly"
    And úkol zůstává v seznamu

  Scenario: Seznam projektů se obnoví po návratu do okna
    # Přidání do projektu nemá vlastní diff (na rozdíl od změny role) —
    # uživatel, který zrovna kouká na seznam, by nový projekt neviděl, dokud
    # stránku sám neobnoví.
    Given "petra.kolarova" má otevřený seznam projektů
    When ji "jan.novak" mezitím přidá do projektu "Backend refaktoring"
    And "petra.kolarova" se vrátí do okna prohlížeče
    Then se v jejím seznamu objeví "Backend refaktoring"

  Scenario: Chyba importu se zobrazí jako pruh, ne jako dialog prohlížeče
    Given "jan.novak" je na seznamu projektů
    When zvolí k importu soubor v nepodporovaném formátu
    Then se zobrazí pruh "Import selhal: Nepodporovaný formát souboru. Použijte JSON nebo ZIP."
    And nevznikne žádný nový projekt
