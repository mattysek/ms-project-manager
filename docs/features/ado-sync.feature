Feature: Azure DevOps synchronizace

  Background:
    Given existuje projekt "Backend refaktoring" s datumy 2026-01-05 až 2026-07-03
    And projekt má členy: "jan.novak" (PM), "petra.kolarova" (Dev)
    And projekt má osoby: "Jan Novák" (AR), "Petra Kolářová" (BE)
    And projekt má úkoly:
      | Název              | Osoba          | Start | Konec | MD | ADO Link                                          |
      | API refaktoring    | Petra Kolářová | W1    | W4    | 15 | https://dev.azure.com/firma/NPEZ/_workitems/edit/1234 |
      | Databázová migrace | Jan Novák      | W5    | W8    | 10 | (bez linku)                                       |
    And "jan.novak" je přihlášen a má projekt otevřený na záložce "ADO Sync"

  Scenario: Uložení ADO konfigurace (PM only)
    When "jan.novak" vyplní konfiguraci:
      | Pole                   | Hodnota                              |
      | Organization URL       | https://dev.azure.com/firma          |
      | ADO Project            | NPEZ                                 |
      | Area Path              | NPEZ\Backend                         |
      | Tracked WI Types       | Bug, Product Backlog Item            |
      | Default Push WI Type   | Product Backlog Item                 |
      | Default Iteration      | NPEZ\Sprint 42                       |
      | 1 MD = N hodin         | 8                                    |
    And klikne "Uložit nastavení"
    Then konfigurace je uložena na serveru
    A je zobrazena zpráva "Konfigurace uložena"

  Scenario: Dev uživatel nevidí ADO konfiguraci
    Given "petra.kolarova" přejde na záložku "ADO Sync"
    Then sekce "Nastavení připojení" není zobrazena
    And pole pro zadání PAT chybí
    And tlačítko "Synchronizovat" chybí nebo je neaktivní

  Scenario: Zadání a uložení PAT (PM only)
    When "jan.novak" zadá PAT do pole "Personal Access Token"
    And klikne "Uložit PAT"
    Then server uloží PAT zašifrovaný pomocí Data Protection API
    And UI zobrazí "PAT uložen — poslední aktualizace: 11.8.2026 14:30"
    And PAT hodnota není nikde zobrazena zpětně

  Scenario: Stav PATu přežije reload stránky
    # PAT ani informace o jeho existenci nejsou součástí stavu projektu (jsou
    # per-user), takže po reloadu o něm klient neví nic a musí se zeptat.
    # Dokud se neptal, tvrdil „PAT není nastaven" a nepustil ani synchronizaci.
    Given "jan.novak" má uložený PAT
    When znovu načte stránku a otevře záložku "ADO Sync"
    Then UI zobrazí "PAT uložen — poslední aktualizace: …"
    And tlačítko "Synchronizovat" je aktivní

  Scenario: Ověření připojení k ADO
    Given "jan.novak" má uloženou konfiguraci a PAT
    When klikne na "Ověřit připojení"
    Then server provede testovací API volání na ADO
    And je zobrazeno "Připojení úspěšné — přihlášen jako Jan Novák (jan.novak@firma.cz)"

  Scenario: Ověření připojení selže (špatný PAT)
    Given "jan.novak" uložil neplatný PAT
    When klikne na "Ověřit připojení"
    Then server obdrží 401 od ADO
    And je zobrazena chybová zpráva "Ověření selhalo: Neplatný nebo expirovaný Personal Access Token"

  Scenario: Mapování členů týmu na ADO identity
    When "jan.novak" přejde do sekce "Mapování členů"
    Then vidí seznam osob projektu: "Jan Novák", "Petra Kolářová"
    When pro "Petra Kolářová" zadá ADO identitu "petra.kolarova@firma.cz"
    And klikne "Uložit mapování"
    Then mapování je uloženo
    A bude použito při push/pull operacích pro správné přiřazení

  Scenario: Spuštění synchronizace
    Given "jan.novak" má uloženou konfiguraci a PAT
    When klikne na tlačítko "Synchronizovat"
    Then je zobrazen progress: "Stahuji work items… (0/1)"
    And "Porovnávám změny…"
    And "Hotovo — 1 WI zkontrolováno"
    And je zobrazen timestamp "Poslední synchronizace: 11.8.2026 14:35"

  Scenario: Detekce regrese stavu WI (ADO → Planner)
    Given WI #1234 byl v ADO ve stavu "In Review" při posledním snapshotu
    And WI #1234 je nyní ve stavu "In Progress" (regrese)
    When "jan.novak" spustí synchronizaci
    Then je zobrazena změna:
      | Typ       | Stav WI regredoval zpět na In Progress |
      | Závažnost | HIGH                                   |
      | WI        | #1234 — Refaktoring API autentizace    |
      | Stará h.  | In Review                              |
      | Nová h.   | In Progress                            |
    And jsou dostupné akce: "Přijmout (aktualizovat progress)", "Potvrdit (Acknowledge)", "Ignorovat"

  Scenario: Přijetí změny stavu z ADO
    Given je zobrazena změna stavu WI #1234 (In Progress → Done)
    When "jan.novak" klikne "Přijmout — aktualizovat progress"
    Then úkol "API refaktoring" v plánovači se aktualizuje na progress 100%
    And do sync logu se přidá záznam "ACKNOWLEDGED — WI #1234 — progress aktualizován na 100%"

  Scenario: Acknowledge změny (viděno, bez akce)
    Given je zobrazena změna stavu WI #1234
    When "jan.novak" klikne "Potvrdit (Acknowledge)"
    Then změna zmizí ze seznamu změn
    And do sync logu se přidá záznam "ACKNOWLEDGED — WI #1234"
    And při příštím syncu (pokud WI zůstane ve stejném stavu) se tato změna nezobrazí znovu

  Scenario: Potvrzení platí jen pro viděnou hodnotu
    # Klíč potvrzení dřív nesl jen (WI, typ), takže jedno odkliknutí umlčelo
    # daný typ změny pro daný WI navždy — i výrazně horší regresi později.
    Given "jan.novak" potvrdil regresi WI #1234 ze stavu "In Review" na "In Progress"
    When WI #1234 později regreduje ze stavu "Done" na "New"
    Then je tato změna zobrazena jako nová
    And potvrzení předchozí regrese ji neumlčí

  Scenario: Remaining Work z nuly se nehlásí jako nekonečno
    Given WI #1234 měl v posledním snapshotu Remaining Work 0 hodin
    When je v ADO nastaven na 5 hodin
    Then je zobrazena změna s popisem "nově odhadnuto"
    And v textu není "Infinity"

  Scenario: Dva úkoly odkazující na stejný WI
    Given úkoly "API refaktoring" i "API testy" odkazují na WI #1234
    When "jan.novak" spustí synchronizaci a WI #1234 změní stav
    Then změna je zobrazena u obou úkolů
    And žádný z nich tiše nevypadne z detekce

  Scenario: Work item mimo stažený vzorek si podrží historii
    Given WI #1400 byl v předchozím snapshotu
    And v tomto syncu se na něj plánovač neptal (úkol na něj dočasně neodkazuje)
    When synchronizace doběhne
    Then jeho záznam ve snapshotu zůstává zachován
    And po opětovném navázání se detekuje regrese proti původní hodnotě

  Scenario: Ignorování změny
    Given je zobrazena změna WI #1234
    When "jan.novak" klikne "Ignorovat"
    Then změna zmizí ze seznamu
    And při příštím syncu se tato konkrétní změna nezobrazí (je označena jako ignored v snapshotu)

  Scenario: Akce nad změnou ji odbaví ze seznamu
    # Server za push ani za přebrání hodnoty žádný diff neposílá — bez
    # lokálního odbavení zůstal řádek viset se stejnými tlačítky a vypadalo to,
    # že klik nic neudělal.
    Given je zobrazena změna WI #1234
    When "jan.novak" na ní provede akci (přijmout z ADO, push do ADO, merge)
    Then změna zmizí ze seznamu bez čekání na další synchronizaci
    And ostatní změny v seznamu zůstanou

  Scenario: Odmítnutá akce vrátí změnu zpět
    Given "jan.novak" provedl akci nad změnou WI #1234
    When server akci odmítne (chyba z ADO nebo smazaný úkol)
    Then je změna znovu v seznamu
    And uživatel ji může zkusit vyřešit jinak

  Scenario: Propsaná hodnota se příštím syncem nevrací
    # Baseline se po zápisu do ADO srovná, jinak by ji další sync porovnal se
    # stavem před pushem a nabídl uživateli k potvrzení jeho vlastní změnu —
    # obráceně, jako by přišla z ADO.
    Given úkol "API refaktoring" má jiné přiřazení než WI #1234
    When "jan.novak" klikne "Synchronizovat do ADO →"
    And spustí synchronizaci znovu
    Then rozdíl přiřazení už není hlášen
    And není hlášena ani opačná změna "přiřazení v ADO se změnilo"

  Scenario: Rozdíl popisu se nehlásí kvůli formátování
    # Plánovač drží markdown, ADO HTML; převod tam a zpátky je ztrátový
    # (prázdné řádky, číslování). Porovnává se proto text, ne jeho tvar.
    Given popis úkolu "API refaktoring" byl odeslán do ADO
    When "jan.novak" spustí synchronizaci
    Then změna popisu není hlášena
    But pokud se texty skutečně liší obsahem, změna hlášena je

  Scenario: Detekce rozdílu přiřazení (Planner → ADO)
    Given úkol "API refaktoring" je přiřazen "Petra Kolářová" v plánovači
    And WI #1234 je přiřazen "jan.novak@firma.cz" v ADO (nesouhlasí)
    When "jan.novak" spustí synchronizaci
    Then je zobrazena změna:
      | Typ      | Přiřazení se liší: Planner → ADO |
      | Planner  | Petra Kolářová                   |
      | ADO      | jan.novak@firma.cz               |
    And jsou dostupné akce: "Synchronizovat do ADO →", "← Přijmout z ADO"

  Scenario: Push přiřazení do ADO
    Given je zobrazena neshoda přiřazení pro WI #1234
    When "jan.novak" klikne "Synchronizovat do ADO →"
    Then server zavolá ADO PATCH API a nastaví AssignedTo na "petra.kolarova@firma.cz"
    And do sync logu se přidá "PUSHED_TO_ADO — WI #1234 — AssignedTo aktualizováno"

  Scenario: Synchronizace popisu (Description diff)
    Given WI #1234 má v ADO jiný popis než úkol "API refaktoring" v plánovači
    When "jan.novak" spustí synchronizaci
    Then je zobrazena změna typu "Popis se liší"
    And je zobrazen diff panel: vlevo "ADO verze", vpravo "Planner verze"
    And jsou dostupné akce: "← Přijmout z ADO", "→ Synchronizovat do ADO", "Merge obousměrně"

  Scenario: Merge popisu obousměrně
    Given je zobrazen description diff pro WI #1234
    When "jan.novak" klikne "Merge obousměrně"
    Then je zobrazen editor s kombinovaným textem (oba texty spojeny)
    And "jan.novak" může výsledný text upravit
    When klikne "Uložit merge"
    Then výsledný text je uložen jako popis úkolu v plánovači
    And je zaslán do ADO přes server PATCH API
    And do sync logu: "DESC_SYNC_BOTH — WI #1234"

  Scenario: Push úkolu bez ADO linku do ADO
    Given úkol "Databázová migrace" nemá ADO link
    And v sekci "Úkoly bez ADO linku" je zobrazen "Databázová migrace"
    When "jan.novak" klikne "Přidat do ADO" u úkolu "Databázová migrace"
    Then se zobrazí dialog s předvyplněnými daty:
      | Pole             | Hodnota                        |
      | Typ WI           | Product Backlog Item           |
      | Název            | Databázová migrace             |
      | Popis            | (prázdný)                      |
      | Area Path        | NPEZ\Backend                   |
      | Iterace          | NPEZ\Sprint 42                 |
      | Přiřadit         | Jan Novák (jan.novak@firma.cz) |
      | Remaining Work   | 80 hodin (10 MD × 8h)          |
    When "jan.novak" klikne "Vytvořit WI"
    Then server vytvoří nový WI v ADO a obdrží ID (např. #1567)
    And úkol "Databázová migrace" dostane odkaz "WI #1567"
    And do sync logu: "PUSHED_TO_ADO — nový WI #1567 vytvořen"

  Scenario: Úkoly bez ADO linku se nabízejí všechny
    # Seznam byl natvrdo uříznutý na dvaceti položkách a úkoly bez přiřazené
    # osoby se přeskakovaly úplně, takže se nově založený úkol do nabídky
    # nedostal a vypadalo to, že ho ADO Sync nevidí.
    Given projekt má 25 úkolů bez ADO linku, z toho jeden bez přiřazené osoby
    When "jan.novak" otevře sekci "Úkoly bez ADO linku"
    Then je nabídnuto zobrazení všech 25 úkolů
    And úkol bez přiřazené osoby je mezi nimi

  Scenario: Coverage gap — WI v ADO bez linku v plánovači
    Given WI #1400 "Frontend integrace" existuje v ADO pod areaPath "NPEZ\Backend"
    And žádný úkol v plánovači nemá link na WI #1400
    When "jan.novak" spustí synchronizaci
    Then sekce "Coverage gap" zobrazuje WI #1400 "Frontend integrace"
    And jsou dostupné akce: "Přidat do plánu", "Ignorovat"

  Scenario: Přidání WI z coverage gap do plánu
    Given WI #1400 "Frontend integrace" je v sekci Coverage gap
    When "jan.novak" klikne "Přidat do plánu" u WI #1400
    Then se zobrazí dialog s předvyplněnými daty z WI:
      | Název   | Frontend integrace |
      | Osoba   | (podle mapování nebo prázdné) |
      | Start   | W1 |
      | Konec   | W2 |
      | MD      | 5  |
    When "jan.novak" vyplní chybějící údaje a klikne "Přidat úkol"
    Then nový úkol "Frontend integrace" je vytvořen v plánu s linkem na WI #1400
    And WI #1400 zmizí z coverage gap sekce

  Scenario: Ignorování coverage gap
    Given WI #1400 je v sekci Coverage gap
    When "jan.novak" klikne "Ignorovat" u WI #1400
    Then WI #1400 zmizí z coverage gap sekce
    And při příštím syncu se WI #1400 nezobrazí znovu (ignorován v snapshotu)

  Scenario: Sync log zobrazuje historii akcí
    Given synchronizace proběhla a bylo provedeno 5 akcí
    When "jan.novak" scrolluje do sekce "Sync log"
    Then jsou zobrazeny záznamy s: timestamp, typ akce, WI ID, WI název, detaily
    And záznamy jsou seřazeny sestupně (nejnovější nahoře)
    And "petra.kolarova" vidí tytéž záznamy (read-only)

  Scenario: Export sync logu do CSV (PM only)
    Given "jan.novak" (PM) je v sekci "Sync log" a log obsahuje záznamy
    When klikne na "↓ Export CSV"
    Then je stažen CSV soubor se všemi záznamy sync logu

  Scenario: Dev nevidí export sync logu
    Given "petra.kolarova" (Dev) je v sekci "Sync log"
    Then tlačítko "↓ Export CSV" je neaktivní

  Scenario: Smazání PAT
    Given "jan.novak" má uložený PAT
    When klikne "Smazat PAT"
    And potvrdí dialog
    Then PAT je odstraněn ze serveru
    And UI zobrazí "PAT není nastaven"
    And synchronizace vyžaduje nové zadání PAT
