Feature: TODO a opakující se připomínky

  Background:
    Given existuje projekt "Backend refaktoring"
    And "petra.kolarova" je přihlášena a má projekt otevřený na záložce TODO

  Scenario: Přidání nové TODO položky
    When "petra.kolarova" zadá "Zkontrolovat pull request od Jana" do pole pro nové TODO
    And stiskne Enter nebo klikne "Přidat"
    Then úkol "Zkontrolovat pull request od Jana" se zobrazí v seznamu TODO
    And je označen jako nesplněný (prázdný checkbox)
    And je uložen na serveru

  Scenario: Označení TODO jako splněné
    Given "petra.kolarova" má TODO "Zkontrolovat pull request od Jana"
    When klikne na checkbox u tohoto TODO
    Then TODO je označeno jako splněné (přeškrtnutý text, vyplněný checkbox)
    And je uložen stav completed = true na serveru

  Scenario: Odznačení TODO (vrácení na nesplněné)
    Given "petra.kolarova" má splněné TODO "Zkontrolovat pull request od Jana"
    When klikne znovu na checkbox
    Then TODO se vrátí do stavu nesplněné

  Scenario: Editace textu TODO
    Given "petra.kolarova" má TODO "Zkontrolovat PR"
    When dvojklikne na text "Zkontrolovat PR"
    And změní na "Zkontrolovat PR #42 od Jana Nováka"
    And stiskne Enter
    Then TODO zobrazuje aktualizovaný text

  Scenario: Smazání TODO
    Given "petra.kolarova" má TODO "Zastaralý úkol"
    When klikne na ikonu smazání u TODO "Zastaralý úkol"
    Then TODO "Zastaralý úkol" zmizí ze seznamu

  Scenario: Vymazání všech splněných TODO
    Given "petra.kolarova" má 3 splněné a 2 nesplněné TODO
    When klikne na tlačítko "Vymazat hotové"
    Then jsou odstraněny všechny 3 splněné TODO
    And zůstávají 2 nesplněné TODO

  Scenario: TODO jsou soukromé per-user
    Given "petra.kolarova" přidá TODO "Soukromý úkol"
    And "jan.novak" má projekt otevřený na záložce TODO
    Then "jan.novak" nevidí TODO "Soukromý úkol" (vidí pouze své vlastní TODO)

  Scenario: Přidání weekly opakující se připomínky
    When "petra.kolarova" klikne "Přidat připomínku"
    And zadá název "Týdenní status meeting"
    And zadá popis "Připravit status report a body k diskuzi"
    And nastaví datum zahájení "2026-08-17" (pondělí)
    And vybere opakování "Každý týden"
    And klikne "Uložit"
    Then připomínka "Týdenní status meeting" se zobrazí v sekci připomínek
    And zobrazuje "Každý týden od 17.8.2026"

  Scenario: Přidání biweekly připomínky
    When "petra.kolarova" přidá připomínku "Retrospektiva" s opakováním "Každé dva týdny" od 2026-08-17
    Then připomínka zobrazuje "Každé 2 týdny od 17.8.2026"

  Scenario: Přidání monthly připomínky
    When "petra.kolarova" přidá připomínku "Měsíční reportování" s opakováním "Každý měsíc" od 2026-08-01
    Then připomínka zobrazuje "Každý měsíc od 1.8.2026"

  Scenario: Zobrazení nadcházejících připomínek
    Given "petra.kolarova" má weekly připomínku "Týdenní status meeting" od 2026-08-17
    And dnes je 2026-08-10
    Then v sekci "Nadcházející připomínky" je zobrazena připomínka "Týdenní status meeting"
    And zobrazuje se datum "17.8.2026 (za 7 dní)"

  Scenario: Označení připomínky jako splněné (pro tento výskyt)
    Given je 2026-08-17 a připomínka "Týdenní status meeting" je splatná
    When "petra.kolarova" klikne na "Hotovo" u připomínky "Týdenní status meeting"
    Then lastCompleted se nastaví na "2026-08-17"
    And připomínka zmizí ze sekce nadcházejících
    And příští výskyt je "2026-08-24"

  Scenario: Pozdní odškrtnutí rozvrh neposune
    # Další výskyt se dřív počítal jako `lastCompleted + interval`, takže
    # pondělní status odškrtnutý ve středu se natrvalo přestěhoval na středu —
    # a s každým dalším zpožděním znovu.
    Given "petra.kolarova" má weekly připomínku "Status" od pondělí 2026-08-03
    When ji odškrtne až ve středu 2026-08-05
    Then příští výskyt je pondělí 2026-08-10, ne středa 2026-08-12
    And měsíční přehled ukazuje tytéž pondělky

  Scenario: Zmeškaný výskyt se nepřeskakuje
    # `lastCompleted` znamená „výskyty do tohoto dne včetně jsou hotové",
    # ne „počítej odteď" — nesplněný výskyt v minulosti musí zůstat po termínu.
    Given "petra.kolarova" má weekly připomínku "Status" od 2026-08-03
    And naposledy ji odškrtla 2026-08-03
    And dnes je 2026-08-20
    Then nejbližší nesplněný výskyt je 2026-08-10
    And připomínka je označena jako po termínu

  Scenario: Měsíční připomínka na konci měsíce neuteče na začátek
    # Posouvání po měsíci přes `setMonth` přeteklo únor (31. 1. → 3. 3.) a od
    # té chvíle běželo na třetím dni v měsíci. Rozvrh se proto počítá přímo
    # z data zahájení a den se ořízne na délku cílového měsíce.
    Given "petra.kolarova" má monthly připomínku "Fakturace" od 2026-01-31
    Then výskyty jsou 31. 1., 28. 2., 31. 3. a 30. 4.

  Scenario: Disable připomínky
    Given "petra.kolarova" má připomínku "Týdenní status meeting" (enabled)
    When klikne na toggle "Vypnout" u připomínky
    Then připomínka je deaktivována
    And nezobrazuje se v sekci nadcházejících připomínek
    And zůstane v seznamu s označením "Vypnuto"

  Scenario: Enable připomínky
    Given "petra.kolarova" má vypnutou připomínku "Týdenní status meeting"
    When klikne na toggle "Zapnout"
    Then připomínka je aktivní
    A zobrazí se opět v sekci nadcházejících připomínek

  Scenario: Smazání připomínky
    Given "petra.kolarova" má připomínku "Zastaralá připomínka"
    When klikne na ikonu smazání a potvrdí dialog
    Then připomínka je trvale odstraněna

  Scenario: Přehled připomínek pro aktuální měsíc
    Given "petra.kolarova" má weekly připomínku "Status" od 2026-08-03
    And dnes je 2026-08-10
    Then přehled zobrazuje výskyty pro srpen 2026: 17.8., 24.8., 31.8.
    And minulé výskyty (3.8., 10.8.) jsou vizuálně odlišeny

  Scenario: Odznak splatných připomínek v hlavičce
    # Bez odznaku byla připomínka vidět jen po otevření záložky TODO,
    # takže funkce fakticky nepřipomínala.
    Given "petra.kolarova" má 2 splatné připomínky
    And je na záložce Harmonogram
    Then v hlavičce je u ikony TODO odznak s číslem 2
    When otevře záložku TODO a jednu připomínku označí jako hotovou
    Then odznak zobrazuje 1

  Scenario: Bez splatných připomínek se odznak nezobrazuje
    Given "petra.kolarova" nemá žádnou splatnou připomínku
    Then v hlavičce není u ikony TODO žádný odznak

  Scenario: TODO přežijí reload stránky
    Given "petra.kolarova" přidala 5 TODO položek
    When provede reload stránky
    Then všech 5 TODO je stále zobrazeno (načteno ze serveru)

  Scenario: Odškrtnutí připomínky zavře i její editaci
    # Nová připomínka se otevírá rovnou k editaci, takže po zadání názvu a
    # kliknutí na „Hotovo" zůstávala s poli dokořán a jediná cesta ven bylo
    # najít ještě „✓ Zavřít".
    Given "petra.kolarova" právě přidala novou připomínku a je otevřená k editaci
    When klikne na "Hotovo"
    Then se editace zavře a karta se zobrazí jen ke čtení
