Feature: Quick Notes — osobní poznámky

  Background:
    Given existuje projekt "Backend refaktoring"
    And existuje projekt "Frontend redesign"
    And "petra.kolarova" je přihlášena jako Dev a je na záložce Harmonogram projektu "Backend refaktoring"

  Scenario: Otevření Quick Notes panelu
    When "petra.kolarova" klikne na ikonu "📝 Poznámky" v hlavičce
    Then se otevře Quick Notes panel jako plovoucí karta vpravo pod horní lištou
    And panel zobrazuje nadpis "Moje poznámky"
    And panel je přístupný bez změny aktuálního view

  Scenario: Panel poznámek vypadá stejně jako trezor
    # Dřív byly poznámky celovýšková lišta přilepená ke kraji a trezor plovoucí
    # karta pod lištou — ve stejné aplikaci to vypadalo jako dvě různé. Rám je
    # proto jeden sdílený a nesmí se znovu rozejít.
    Given "petra.kolarova" otevře panel poznámek
    And podívá se na panel trezoru
    Then mají oba stejný rám, polohu i šířku

  Scenario: Otevřený je vždy jen jeden panel
    # Oba panely sedí na stejném místě obrazovky, takže dva otevřené se
    # překrývaly a spodní byl nedosažitelný.
    Given panel poznámek je otevřený
    When "petra.kolarova" klikne na tlačítko "Trezor"
    Then je otevřený trezor
    And panel poznámek je zavřený

  Scenario: Tlačítko v liště ukazuje, který panel je otevřený
    Given panel poznámek je otevřený
    Then tlačítko "Poznámky" je označené jako aktivní
    And tlačítko "Trezor" označené není
    When "petra.kolarova" přepne na trezor
    Then je jako aktivní označené tlačítko "Trezor"
    And tlačítko "Poznámky" už aktivní není

  Scenario: Uživatelské menu je nad otevřeným panelem
    # Panely i menu se renderují uvnitř horní lišty, takže o pořadí rozhoduje
    # z-index uvnitř ní. Když bylo menu níž, panel ho překryl a položky nešly
    # kliknout — vypadalo to, že menu chybí.
    Given panel poznámek nebo trezoru je otevřený
    When "petra.kolarova" rozbalí uživatelské menu
    Then je menu nad panelem a jeho položky jdou kliknout

  Scenario: Zavření Quick Notes panelu
    Given Quick Notes panel je otevřen
    When "petra.kolarova" klikne na "×" v panelu nebo na ikonu "📝" znovu
    Then panel se zavře
    And uživatel vidí stránku ve stejném stavu jako před otevřením panelu

  Scenario: Quick Notes panel je dostupný na všech záložkách
    Given Quick Notes panel je zavřen
    When "petra.kolarova" přejde na záložku Úkoly
    And klikne na ikonu "📝"
    Then panel se otevře i na záložce Úkoly

  Scenario: Quick Notes panel je dostupný i na LandingPage
    Given "petra.kolarova" je na stránce se seznamem projektů (žádný projekt neotevřen)
    When klikne na ikonu "📝"
    Then panel se otevře
    And zobrazuje poznámky bez linku na projekt

  Scenario: Přidání nové poznámky
    Given Quick Notes panel je otevřen
    When "petra.kolarova" klikne na "+ Nová poznámka"
    Then se otevře prázdný editor poznámky
    When zadá text "Podívat se na PR #156 — nejasná business logika kolem stavů objednávek"
    And klikne mimo editor (blur)
    Then poznámka je uložena na serveru
    And zobrazí se v seznamu poznámek jako první (nejnovější nahoře)

  Scenario: Minimální obsah poznámky
    Given Quick Notes panel je otevřen
    When "petra.kolarova" klikne na "+ Nová poznámka"
    And ihned klikne mimo editor (bez zadání textu)
    Then prázdná poznámka není uložena
    And zobrazí se upozornění nebo poznámka tiše zmizí

  Scenario: Editace existující poznámky
    Given "petra.kolarova" má poznámku "Podívat se na PR #156"
    When klikne na tuto poznámku v seznamu
    Then poznámka se otevře v editačním módu
    When změní text na "PR #156 — zkontrolováno, schváleno 11.8.2026"
    And klikne mimo nebo na "Uložit"
    Then poznámka je aktualizována

  Scenario: Autosave při editaci
    Given "petra.kolarova" edituje poznámku
    When přestane psát na 2 sekundy
    Then poznámka je automaticky uložena na server (bez nutnosti kliknutí "Uložit")
    And je zobrazen indikátor "Uloženo" vedle poznámky

  Scenario: Preview markdownu v poznámce
    Given "petra.kolarova" má otevřenou poznámku v editačním módu
    When napíše "## TODO\n\n- [ ] Zkontrolovat testy\n- [ ] Aktualizovat dokumentaci"
    And přepne na záložku "Preview"
    Then je zobrazen formátovaný markdown s nadpisem a checkboxy

  Scenario: Smazání poznámky
    Given "petra.kolarova" má poznámku "Zastaralá poznámka"
    When klikne na tuto poznámku a poté na "Smazat"
    And potvrdí dialog "Opravdu smazat tuto poznámku?"
    Then poznámka "Zastaralá poznámka" zmizí ze seznamu
    And je trvale odstraněna ze serveru

  Scenario: Link poznámky na projekt
    Given Quick Notes panel je otevřen a "petra.kolarova" edituje poznámku
    When klikne na "Přiřadit k projektu"
    And vybere "Backend refaktoring" z dropdownu
    And uloží
    Then poznámka zobrazuje tag "Backend refaktoring" vedle textu

  Scenario: Filtrování poznámek dle projektu
    Given "petra.kolarova" má 3 poznámky linkované na "Backend refaktoring" a 2 bez linku
    When vybere filtr "Backend refaktoring" v Quick Notes panelu
    Then jsou zobrazeny pouze 3 poznámky linkované na "Backend refaktoring"

  Scenario: Konverze poznámky na úkol
    Given "petra.kolarova" má otevřený projekt "Backend refaktoring"
    And má poznámku "Implementovat rate limiting pro API endpoint /users" přiřazenou k projektu "Backend refaktoring"
    When otevře tuto poznámku
    And klikne na "→ Přidat jako úkol"
    Then se otevře TaskDetailModal s předvyplněnými daty:
      | Pole  | Hodnota                                                  |
      | Název | Implementovat rate limiting pro API endpoint /users      |
      | Popis | Implementovat rate limiting pro API endpoint /users      |
    And ostatní pole jsou s výchozími hodnotami (backlog, 1 MD)
    When "petra.kolarova" upraví MD na 3 a klikne "Uložit"
    Then úkol "Implementovat rate limiting pro API endpoint /users" je vytvořen v projektu
    And poznámka je označena jako konvertovaná: zobrazuje tag "→ Úkol: Implementovat rate limiting…"
    And poznámka je read-only (nelze konvertovat znovu)

  Scenario: Právě napsanou poznámku lze hned převést na úkol
    # Nová poznámka dřív po uložení v editoru dál vystupovala jako neuložená,
    # takže tlačítko zůstalo zašedlé, dokud ji uživatel znovu neotevřel ze
    # seznamu — vypadalo to, že převod smí jen PM.
    Given "petra.kolarova" je v projektu "Backend refaktoring" Dev
    When klikne na "+ Nová poznámka", napíše text a přiřadí poznámku k projektu "Backend refaktoring"
    Then tlačítko "→ Přidat jako úkol" je aktivní bez opětovného otevření poznámky

  Scenario: Konverze otevře úkol v projektu poznámky
    Given "petra.kolarova" je na stránce se seznamem projektů
    And má poznámku "Doplnit audit log" přiřazenou k projektu "Frontend redesign"
    When klikne u poznámky na "→ Přidat jako úkol"
    Then se otevře projekt "Frontend redesign" na záložce Úkoly
    And nad ní TaskDetailModal s předvyplněnými daty
    When klikne "Uložit"
    Then úkol "Doplnit audit log" je vytvořen v projektu "Frontend redesign"
    And nad záložkou Úkoly je rovnou otevřený jeho detail

  Scenario: Dev smí úkol z poznámky přiřadit jen sobě nebo do backlogu
    Given "petra.kolarova" je v projektu "Backend refaktoring" Dev
    When převádí poznámku na úkol
    Then v poli „Přiřazeno" nabízí formulář jen Backlog a osobu namapovanou na její účet

  Scenario: Tlačítko konverze je neaktivní u poznámky bez projektu
    Given "petra.kolarova" má poznámku, která není přiřazená k žádnému projektu
    When ji otevře
    Then tlačítko "→ Přidat jako úkol" je neaktivní

  Scenario: Fulltext vyhledávání v poznámkách
    Given "petra.kolarova" má 5 poznámek, z nichž 2 obsahují slovo "rate limiting"
    When zadá "rate limiting" do vyhledávacího pole v Quick Notes panelu
    Then jsou zobrazeny pouze 2 poznámky obsahující "rate limiting"
    And hledaný výraz je zvýrazněn

  Scenario: Poznámky jiného uživatele nejsou viditelné
    Given "jan.novak" má poznámku "Soukromá PM poznámka"
    And "petra.kolarova" je přihlášena
    When "petra.kolarova" otevře Quick Notes panel
    Then "Soukromá PM poznámka" není zobrazena
    And server odmítne požadavek na čtení cizích poznámek s HTTP 403

  Scenario: Stav panelu (otevřen/zavřen) přežije reload stránky
    Given "petra.kolarova" má Quick Notes panel otevřen
    When provede reload stránky
    Then panel je stále otevřen (stav je uložen v localStorage)

  Scenario: Dosažení limitu poznámek
    Given "petra.kolarova" má 500 poznámek
    When se pokusí přidat další
    Then poznámka není vytvořena
    And je zobrazena zpráva "Dosáhli jste limitu 500 poznámek. Smažte některé starší."

  Scenario: Varování při blížícím se limitu poznámek
    Given "petra.kolarova" má 400 poznámek
    When otevře Quick Notes panel
    Then je zobrazeno varování "Máte 400 z 500 poznámek — blížíte se limitu."
    And varování nebylo zobrazeno při 399 poznámkách
