Feature: Gantt harmonogram

  Background:
    Given existuje projekt "Backend refaktoring" s datumy 2026-01-05 až 2026-07-03 (26 týdnů)
    And projekt má osoby: "Jan Novák" (AR, barva #4f9cf9), "Petra Kolářová" (BE, barva #34d399)
    And projekt má úkoly:
      | Název                    | Osoba           | Start | Konec | MD | Progress |
      | API refaktoring          | Petra Kolářová  | W1    | W4    | 15 | 0        |
      | Infrastruktura           | Jan Novák       | W1    | W2    | 5  | 100      |
      | Databázová migrace       | Petra Kolářová  | W5    | W8    | 10 | 0        |
    And milník "M1 — Alpha" je na W4
    And "jan.novak" je přihlášen a má projekt otevřený na záložce Harmonogram

  Scenario: Zobrazení úkolů jako pruhy
    Then jsou zobrazeny pruhy pro všechny 3 úkoly
    And pruh "API refaktoring" začíná v sloupci W1 a končí ve sloupci W4
    And pruh "API refaktoring" má barvu "Petra Kolářová" (#34d399)
    And pruh "Infrastruktura" zobrazuje 100% progress (plně vyplněný)
    And milník "M1 — Alpha" je zobrazen jako diamant v řádku W4

  Scenario: Zobrazení tooltip při hover nad pruhem
    When "jan.novak" najede myší na pruh "API refaktoring"
    Then se zobrazí tooltip s:
      | Pole     | Hodnota        |
      | Název    | API refaktoring |
      | Osoba    | Petra Kolářová |
      | Týdny    | W1–W4          |
      | MD       | 15             |
      | Progress | 0%             |
    And tooltip zmizí když myš opustí pruh

  Scenario: Zobrazení skupin měsíců v záhlaví
    Then záhlaví Gantt view zobrazuje skupiny měsíců: "Leden 2026" (5 týdnů), "Únor 2026" (4 týdny)…
    And každý měsíc má odlišnou barvu pozadí

  Scenario: Zobrazení českých státních svátků
    Given projekt zahrnuje týden W14 (6.–10. 4. 2026) obsahující Velikonoční pondělí
    When "jan.novak" zobrazí Gantt
    Then týden W14 zobrazuje indikátor svátku
    And tooltip týdne zobrazuje "Velikonoční pondělí" a počet pracovních dní (4)

  Scenario: Drag — přesunutí pruhu (move)
    Given pruh "API refaktoring" je na W1-W4
    When "jan.novak" uchopí střed pruhu "API refaktoring" a přetáhne ho o 2 týdny doprava
    Then pruh "API refaktoring" je nyní na W3-W6
    And změna je uložena na serveru (command move_task)
    And "petra.kolarova" vidí aktualizovanou pozici pruhu

  Scenario: Drag — resize pravého okraje (prodloužení)
    Given pruh "API refaktoring" je na W1-W4
    When "jan.novak" uchopí pravý okraj pruhu "API refaktoring" a přetáhne ho 2 týdny doprava
    Then pruh "API refaktoring" je nyní na W1-W6
    And command update_task s e=6 je odeslán na server

  Scenario: Drag — resize levého okraje (zkrácení)
    Given pruh "API refaktoring" je na W1-W4
    When "jan.novak" uchopí levý okraj pruhu "API refaktoring" a přetáhne ho 1 týden doprava
    Then pruh "API refaktoring" je nyní na W2-W4
    And command update_task s s=2 je odeslán na server

  Scenario: Drag se zastaví na hranici projektu
    Given pruh "Databázová migrace" je na W5-W8
    When "jan.novak" se pokusí přetáhnout pruh za W26 (konec projektu)
    Then pruh se zastaví na W26 (maximální konec)
    And pruh nelze přetáhnout za konec projektu

  Scenario: Kliknutí na pruh otevře TaskDetailModal
    When "jan.novak" klikne na pruh "API refaktoring"
    Then se otevře TaskDetailModal s detailem úkolu "API refaktoring"
    And modal zobrazuje: název, osoba, kategorie, W1, W4, 15 MD, 0%

  Scenario: Undo po drag operaci
    Given "jan.novak" právě přesunul pruh "API refaktoring" z W1-W4 na W3-W6
    When stiskne Ctrl+Z
    Then pruh "API refaktoring" se vrátí na W1-W4
    And server přijme reverzní command move_task

  Scenario: Export Gantt jako PNG
    When "jan.novak" klikne na tlačítko "Export PNG" v Gantt view
    Then prohlížeč stáhne soubor "harmonogram.png"
    And PNG obsahuje všechny viditelné pruhy, záhlaví s týdny a milníky
    And Po dobu generování PNG je zobrazen indikátor načítání

  Scenario: Gantt zobrazuje pruhy per-lane (bez překryvu)
    Given "Petra Kolářová" má 2 překrývající se úkoly: "Úkol A" W1-W4 a "Úkol B" W2-W5
    Then oba pruhy jsou zobrazeny v samostatných swimlane řádcích
    And žádné pruhy se nepřekrývají vizuálně

  Scenario: Dev uživatel nemůže drag-and-drop cizí úkol
    Given "petra.kolarova" má projekt otevřený na záložce Harmonogram
    When se pokusí přetáhnout pruh "Infrastruktura" (přiřazený "Jan Novák")
    Then drag je ignorován (pruh se neposouvá)
    And server odmítne případný command s chybou "Nedostatečná oprávnění"

  Scenario: Dev uživatel může drag-and-drop vlastní úkol
    Given "petra.kolarova" má projekt otevřený na záložce Harmonogram
    When přetáhne pruh "API refaktoring" (přiřazený "Petra Kolářová") z W1-W4 na W2-W5
    Then pruh je přesunut na W2-W5
    And změna je uložena na serveru

  Scenario: Kliknutí myší na pruh otevře TaskDetailModal
    # Tažený pruh má `pointer-events: none`, aby neclonil řádek pod kurzorem —
    # `mouseup` tím pádem netrefí tlačítko a `click` prohlížeč vůbec nevyvolá.
    # Rozhodnutí „klik, nebo tažení" proto padá při `mouseup` podle toho, jestli
    # se úkol opravdu posunul, ne podle toho, jestli vznikl náhled.
    Given "jan.novak" má otevřený Harmonogram
    When klikne myší na pruh úkolu "Refaktoring API"
    Then se otevře TaskDetailModal s tím úkolem
    And drobné chvění myší během kliknutí se nepočítá jako tažení

  Scenario: Přetažení úkolu na jiného člena týmu
    # Cíl se hledá přes `elementFromPoint`, ne dopočítáváním výšek řádků.
    # Původní verze začínala na odhadu záhlaví (`headerOffset = 70`) a přičítala
    # vlastní kopii vzorce z `PersonRow` — přeřazení tím vycházelo jednou ano,
    # jednou ne, podle toho, jak blízko hranice řádku kurzor zrovna byl.
    Given "Petra Kolářová" má úkol "Refaktoring API" a v projektu je i "Jan Novák"
    When "jan.novak" přetáhne pruh úkolu na řádek "Jan Novák"
    Then je během tažení zvýrazněn CÍLOVÝ řádek, ne ten zdrojový
    And po puštění je úkol přiřazen "Jan Novák"
    And změna přežije reload
