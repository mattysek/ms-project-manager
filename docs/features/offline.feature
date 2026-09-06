Feature: Offline podpora

  Background:
    Given existuje projekt "Backend refaktoring" s úkolem "API refaktoring" W1-W4, 15 MD
    And projekt má členy: "jan.novak" (PM), "petra.kolarova" (Dev)
    And "jan.novak" je přihlášen a má projekt otevřený na záložce Harmonogram
    And "petra.kolarova" je přihlášena a má projekt otevřený na záložce Úkoly

  Scenario: Zobrazení offline indikátoru při výpadku sítě
    When server se stane nedostupným (výpadek sítě na stroji "jan.novak")
    Then do 5 sekund se zobrazí banner "⚠ Offline — pracujete bez připojení. Změny budou uloženy při obnovení spojení."
    And indikátor v hlavičce změní z "Uloženo v 14:32" na ikonu "⚡ Offline"

  Scenario: Změny jsou ukládány lokálně při offline
    Given "jan.novak" je offline
    When "jan.novak" přesune úkol "API refaktoring" z W1-W4 na W3-W6
    Then pruh se vizuálně přesune na W3-W6 (optimistická aplikace)
    And command je uložen do IndexedDB pending queue
    And banner zobrazuje "⚠ Offline — 1 čekající změna"

  Scenario: Více změn se kumuluje v pending queue
    Given "jan.novak" je offline
    When "jan.novak" provede 5 různých změn (přesuny úkolů, změny MD)
    Then banner zobrazuje "⚠ Offline — 5 čekajících změn"
    And všech 5 commandů je uloženo v IndexedDB

  Scenario: Pending commandy přežijí reload stránky při offline
    Given "jan.novak" je offline a má 3 čekající změny
    When "jan.novak" zavře záložku prohlížeče a znovu ji otevře
    Then aplikace načte stav z IndexedDB cache
    And banner zobrazuje "⚠ Offline — 3 čekající změny"
    And změny jsou stále v pending queue

  Scenario: Seamless synchronizace při reconnectu bez konfliktů
    Given "jan.novak" je offline a přesunul "API refaktoring" na W3-W6
    And mezitím "petra.kolarova" nezměnila tento úkol
    When se síť obnoví a SignalR se reconnectuje
    Then aplikace přehraje pending command na server
    And server přijme command a broadcastuje diff
    And banner zmizí a zobrazí se "✓ Synchronizováno — 1 změna přenesena"
    And "petra.kolarova" vidí úkol "API refaktoring" na W3-W6

  Scenario: Conflict resolution dialog při reconnectu
    Given "jan.novak" je offline a přesunul "API refaktoring" na W5-W8
    And mezitím "petra.kolarova" (online) přesunula "API refaktoring" na W2-W3
    When se "jan.novak" reconnectuje
    Then se zobrazí dialog "Conflict Resolution — 1 konflikt"
    And dialog zobrazuje:
      | Entita         | API refaktoring                    |
      | Typ konfliktu  | Pozice úkolu (start a konec týdne) |
      | Server má      | W2-W3                              |
      | Vaše změna     | W5-W8                              |
    And dialog nabízí tlačítka "Ponechat serverovou" a "Použít moji"

  Scenario: Conflict resolution — uživatel vybere serverovou verzi
    Given je zobrazen conflict resolution dialog s konfliktem pro "API refaktoring"
    When "jan.novak" klikne "Ponechat serverovou"
    Then úkol "API refaktoring" zůstane na W2-W3
    And pending command je zahozen
    And dialog se zavře

  Scenario: Conflict resolution — uživatel vybere svoji verzi
    Given je zobrazen conflict resolution dialog s konfliktem pro "API refaktoring"
    When "jan.novak" klikne "Použít moji"
    Then pending command je přehrán a úkol se přesune na W5-W8
    And "petra.kolarova" vidí úkol "API refaktoring" přesunutý na W5-W8

  Scenario: Hromadné řešení konfliktů
    Given je zobrazen conflict resolution dialog se 3 konflikty
    When "jan.novak" klikne "Ponechat vše serverové"
    Then všechny 3 pending commandy jsou zahozeny
    And lokální stav se synchronizuje se serverem

  Scenario: Quick Notes fungují offline
    Given "jan.novak" je offline a má otevřený panel Quick Notes
    When přidá poznámku "Nápad z porady"
    Then poznámka se zobrazí v seznamu (optimistická aplikace)
    And operace je uložena do IndexedDB fronty poznámek
    And panel zobrazuje "1 čekající poznámka"

  Scenario: Poznámky se dohrají po obnovení spojení
    Given "jan.novak" je offline a vytvořil, upravil a smazal poznámky (3 operace)
    When se spojení obnoví
    Then operace se přehrají na server v původním pořadí
    And fronta poznámek je prázdná
    And po reloadu jsou poznámky ve stejném stavu

  Scenario: Poznámka vytvořená offline si po dohrání drží identitu
    Given "jan.novak" je offline
    When vytvoří poznámku a hned ji dvakrát upraví
    Then po reconnectu vznikne na serveru jedna poznámka s posledním textem
    And nevzniknou tři samostatné poznámky

  Scenario: ADO Sync je zakázán při offline
    Given "jan.novak" je offline
    When "jan.novak" přejde na záložku "ADO Sync"
    Then tlačítko "Synchronizovat" je neaktivní
    And je zobrazen tooltip "Synchronizace s ADO vyžaduje připojení k internetu"

  Scenario: Upload souborů je zakázán při offline
    # Přílohy jsou jediná operace, která offline zůstat nemůže: binární obsah
    # do 25 MB se nedá rozumně držet ve frontě vedle stavu projektu (ADR-009).
    Given "jan.novak" je offline a je na záložce Soubory
    Then oblast pro drag-drop a tlačítko "Vybrat soubory" jsou neaktivní
    And je zobrazena zpráva "Upload souborů vyžaduje připojení"

  Scenario: Export projektu funguje offline
    Given "jan.novak" je offline
    When klikne na "Export" a vybere "Exportovat jako JSON"
    Then prohlížeč stáhne JSON soubor s aktuálním lokálním stavem
    And soubor obsahuje watermark "Exportováno v offline režimu — stav nemusí být zcela aktuální"

  Scenario: Import projektu je zakázán při offline
    Given "jan.novak" je na LandingPage a je offline
    When klikne na "Importovat projekt"
    Then je zobrazena chybová zpráva "Import projektu vyžaduje připojení k serveru"

  Scenario: Automatické zahození starých pending commandů
    Given "jan.novak" má pending command starý 49 hodin v IndexedDB
    When aplikace se spustí (nebo provede se reload)
    Then je zobrazena notifikace "1 starý čekající změna byla odstraněna (starší než 48 hodin)"
    And starý command je smazán z IndexedDB queue

  Scenario: Undo při offline
    Given "jan.novak" je offline a právě přesunul "API refaktoring" na W3-W6
    When stiskne Ctrl+Z
    Then úkol se vrátí lokálně na W1-W4
    And obě operace (move a reverse-move) jsou v pending queue
    When se reconnectuje, obě operace jsou přehrány sekvenčně
    Then výsledný stav na serveru je W1-W4

  # ── Úvodní obrazovka ──────────────────────────────────────────────────────

  Scenario: Vypnutý server pozná i úvodní obrazovka
    # `navigator.onLine` tu nestačí: vypnutý server nechá prohlížeč „online",
    # takže banner nevyskočil a prázdný seznam vypadal jako smazané projekty.
    # Druhým signálem je proto neúspěšné načtení seznamu.
    Given "jan.novak" je na LandingPage a server přestane odpovídat
    When se seznam projektů obnoví
    Then je zobrazeno, že server neodpovídá a seznam je poslední známý

  Scenario: Seznam projektů přežije výpadek serveru
    # Uvnitř sezení to nebylo vidět — neúspěšné načtení nechalo starý stav —
    # ale návratem z projektu se LandingPage odmontuje a namontuje znovu, takže
    # uživatel uviděl „Žádné uložené projekty" a neměl se jak vrátit tam,
    # odkud právě přišel.
    Given "jan.novak" má otevřený projekt "Backend refaktoring"
    When server přestane odpovídat a "jan.novak" se vrátí na seznam projektů
    Then vidí "Backend refaktoring" v seznamu
    And může ho otevřít z uloženého stavu

  Scenario: Projekt bez uloženého stavu je offline označený
    # Seznam z cache je obvykle větší než to, co jde otevřít: obsahuje
    # i projekty, které uživatel nikdy neotevřel. Bez označení by skončily
    # na věčném „Načítám projekt…".
    Given "jan.novak" je členem projektu "Mobilní klient", který nikdy neotevřel
    And server neodpovídá
    When se podívá na seznam projektů
    Then je "Mobilní klient" označený jako neuložený offline
    When na něj klikne
    Then se dozví, že ho musí otevřít, až bude server dostupný
    And zůstane na seznamu projektů

  Scenario: Chyba spojení je česky, ne hláškou prohlížeče
    # `fetch` při nedostupném serveru vyhodí `TypeError: Failed to fetch`
    # a ten se dostal až na obrazovku — u seznamu členů projektu stálo
    # doslova „Failed to fetch".
    Given server neodpovídá
    When si aplikace vyžádá data přes REST
    Then chyba nese českou hlášku o nedostupném serveru
    And jde odlišit od chyby, kterou vrátil server
