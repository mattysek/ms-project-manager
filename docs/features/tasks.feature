Feature: Správa úkolů

  Background:
    Given existuje projekt "Backend refaktoring" s datumy 2026-01-05 až 2026-07-03 (26 týdnů)
    And projekt má osoby: "Jan Novák" (AR, barva #4f9cf9), "Petra Kolářová" (BE, barva #34d399)
    And projekt má kategorie: "obecne" (šedá), "backend" (modrá)
    And "jan.novak" je přihlášen jako PM
    And "jan.novak" má projekt otevřený na záložce Úkoly

  Scenario: Přidání nového úkolu
    When "jan.novak" klikne "Přidat úkol"
    And vyplní název "Implementace REST API"
    And vybere osobu "Petra Kolářová"
    And vybere kategorii "backend"
    And nastaví začátek W1 a konec W3
    And nastaví 12 MD
    And klikne "Uložit"
    Then úkol "Implementace REST API" je zobrazen v seznamu
    And úkol je přiřazen "Petra Kolářová" s kategorií "backend", W1-W3, 12 MD
    And úkol je uložen na serveru

  Scenario: Přidání úkolu do backlogu (bez přiřazení)
    When "jan.novak" klikne "Přidat úkol"
    And vyplní název "Budoucí feature X"
    And nechá pole Osoba prázdné
    And klikne "Uložit"
    Then úkol "Budoucí feature X" se zobrazí v sekci "Backlog"
    And úkol nemá přiřazenou osobu

  Scenario: Editace názvu úkolu inline
    Given projekt má úkol "Implementace REST API" přiřazený "Petra Kolářová"
    When "jan.novak" klikne na název "Implementace REST API" v seznamu
    And změní text na "Implementace REST API — fáze 1"
    And stiskne Enter
    Then úkol se jmenuje "Implementace REST API — fáze 1"
    And změna je uložena na serveru

  Scenario: Otevření detailu úkolu a editace
    Given projekt má úkol "Implementace REST API" přiřazený "Petra Kolářová", W1-W3, 12 MD, progress 0%
    When "jan.novak" klikne na ikonu detailu úkolu
    Then se otevře TaskDetailModal
    And zobrazuje: název, osoba, kategorie, začátek W1, konec W3, 12 MD, progress 0%
    When změní MD na 15
    And nastaví progress na 20%
    And klikne "Uložit"
    Then modal se zavře
    And úkol zobrazuje 15 MD a progress 20%

  Scenario: Přidání popisu (markdown) k úkolu
    Given "jan.novak" má otevřený detail úkolu "Implementace REST API"
    When napíše do pole Popis "## Popis\n\nImplementovat CRUD operace pro entity User, Project, Task.\n\n- GET /api/users\n- POST /api/users"
    And přepne na náhled
    Then je zobrazen formátovaný markdown s nadpisem "Popis" a odrážkami
    And přepínač náhledu nic neukládá — je to jen jiné zobrazení téhož pole

  Scenario: Popis se ukládá společně se zbytkem úkolu
    # Popis měl vlastní editační režim s tlačítky „✎ Upravit" a „Uložit popis",
    # takže jediné pole v dialogu se ukládalo jinak než všechna ostatní — a kdo
    # to druhé tlačítko nenašel, o rozepsaný text přišel.
    Given "jan.novak" má otevřený detail úkolu "Implementace REST API"
    When změní popis i MD
    And klikne "Uložit změny"
    Then odejde jeden příkaz update_task s oběma poli

  Scenario: Přidání externího odkazu k úkolu
    Given "jan.novak" má otevřený detail úkolu "Implementace REST API"
    When přejde do sekce "Externí odkazy"
    And klikne "Přidat odkaz"
    And vyplní label "Confluence specifikace"
    And vyplní URL "https://confluence.firma.cz/display/BE/REST-API"
    And klikne "Uložit odkaz"
    Then odkaz "Confluence specifikace" je zobrazen v seznamu odkazů
    And kliknutím na odkaz se otevře URL v novém tabu

  Scenario: Smazání odkazu
    Given úkol "Implementace REST API" má odkaz "Confluence specifikace"
    When "jan.novak" klikne na ikonu smazání u odkazu "Confluence specifikace"
    Then odkaz je odstraněn ze seznamu

  Scenario: Nastavení progress slideru
    Given "jan.novak" má otevřený detail úkolu "Implementace REST API"
    When posune slider progress na 75%
    Then hodnota progress se zobrazí jako "75%"
    When klikne "Uložit"
    Then progress 75% je uložen

  Scenario: Přeřazení úkolu na jinou osobu (PM)
    Given "jan.novak" má projekt na záložce Úkoly
    And úkol "Implementace REST API" je přiřazen "Petra Kolářová"
    When "jan.novak" otevře detail úkolu
    And změní osobu z "Petra Kolářová" na "Jan Novák"
    And klikne "Uložit"
    Then úkol "Implementace REST API" je nyní přiřazen "Jan Novák"
    And v Gantt view je zobrazen barvou "Jan Novák"

  Scenario: Drag-and-drop přeřazení úkolu na jinou osobu (SeznamView)
    Given úkol "Implementace REST API" je přiřazen "Petra Kolářová"
    When "jan.novak" přetáhne řádek "Implementace REST API" na sekci "Jan Novák" v tabulce
    Then úkol je přeřazen na "Jan Novák"
    And změna je uložena na serveru

  Scenario: Smazání úkolu (PM)
    Given "jan.novak" má otevřený detail úkolu "Stará feature"
    When klikne na "Smazat úkol"
    And potvrdí dialog "Opravdu smazat úkol Stará feature?"
    Then modal se zavře
    And úkol "Stará feature" zmizí ze seznamu úkolů a z Gantt view

  Scenario: Filtrování úkolů dle osoby
    Given projekt má úkoly přiřazené "Jan Novák" (3 úkoly) a "Petra Kolářová" (5 úkolů)
    When "jan.novak" vybere filtr "Petra Kolářová"
    Then jsou zobrazeny pouze 5 úkolů přiřazených "Petra Kolářová"
    And backlog úkoly bez osoby jsou skryty

  Scenario: Filtrování úkolů dle kategorie
    Given projekt má úkoly v kategorii "backend" (4 úkoly) a "obecne" (2 úkoly)
    When "jan.novak" vybere filtr kategorie "backend"
    Then jsou zobrazeny pouze 4 úkoly v kategorii "backend"

  Scenario: Přidání nové kategorie
    When "jan.novak" klikne na "Správa kategorií"
    And klikne "Nová kategorie"
    And zadá label "frontend"
    And vybere barvu #a78bfa (fialová)
    And klikne "Přidat"
    Then kategorie "frontend" je dostupná v dropdownu kategorií u úkolů

  Scenario: Export úkolů do Excelu
    Given projekt má 10 úkolů
    When "jan.novak" klikne "Export Excel"
    Then prohlížeč stáhne soubor Excel s listem "Úkoly"
    And soubor obsahuje sloupce: Název, Osoba, Kategorie, Začátek (týden), Konec (týden), MD, Progress

  Scenario: Detail úkolu ukazuje, kdo ho naposledy změnil
    Given úkol "Implementace REST API" naposledy upravila "Petra Kolářová"
    When "jan.novak" otevře detail úkolu
    Then v patičce je uvedeno "Naposledy změnil Petra Kolářová" s datem a časem
    And razítko doplňuje server, klient ho nemůže podvrhnout

  Scenario: Úkol založený před zavedením razítka nemá autora
    Given úkol "Stará položka" nemá uložené razítko autora
    When "jan.novak" otevře jeho detail
    Then řádek "Naposledy změnil" není zobrazen

  Scenario: Undo po přidání úkolu
    Given "jan.novak" právě přidal úkol "Testovací úkol"
    When stiskne Ctrl+Z
    Then úkol "Testovací úkol" zmizí ze seznamu
    And server je informován o reverzní operaci (delete_task)
