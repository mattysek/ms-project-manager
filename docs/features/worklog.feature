Feature: Vykazování práce (PRD-10)

  Plán říká, kolik práce bude. Tohle je jediné místo, kde je vidět, kolik jí
  doopravdy bylo a kam se poděla. Záznamy jsou soukromé a stojí mimo projekty
  (ADR-017) — vidí je jen jejich autor, ani PM, ani administrátor.

  Background:
    Given "petra.kolarova" je přihlášena
    And je členem projektu "Backend refaktoring"

  # ── Zápis a stopky ────────────────────────────────────────────────────────

  Scenario: Ručně zapsaný záznam ukáže strávený čas
    When "petra.kolarova" zapíše činnost "Code review" od 09:00 do 10:30
    Then je v seznamu vidět s trváním "1:30"

  Scenario: Stopky doplní časy samy
    # „Systémem" je tu prohlížeč, ne server (ADR-017) — uživatel porovnává
    # výkaz s vlastními hodinkami.
    When "petra.kolarova" klikne "Start" u činnosti "Ladění importu"
    Then vznikne záznam se začátkem v ten okamžik a bez konce
    When později klikne "Stop"
    Then má záznam konec v okamžik kliknutí

  Scenario: Spuštění nové činnosti ukončí tu předchozí
    # V liště je jedno tlačítko „Stop". Kdyby mohly běžet dvě činnosti, nemá
    # co zastavovat. Invariantu drží server, ne klient.
    Given "petra.kolarova" má rozdělanou činnost "Ladění importu"
    When spustí činnost "Schůzka s klientem"
    Then je "Ladění importu" ukončená přesně v okamžiku, kdy začala schůzka
    And běží právě jedna činnost

  Scenario: Uživatel se dozví, že mu předchozí činnost skončila
    Given "petra.kolarova" má rozdělanou činnost "Ladění importu"
    When spustí činnost "Schůzka s klientem"
    Then jí aplikace oznámí, že "Ladění importu" byla ukončena

  Scenario: Běžící činnost je v seznamu poznat
    Given "petra.kolarova" má rozdělanou činnost "Ladění importu"
    When otevře seznam výkazů
    Then je "Ladění importu" na prvním místě a označená jako běžící
    And místo konce má narostlý čas

  Scenario: Časy uloženého záznamu jde opravit
    # Ruční oprava je zadaná funkce, takže server na časy není autorita.
    Given "petra.kolarova" má záznam "Code review" od 09:00 do 10:30
    When změní začátek na 08:30
    Then má záznam trvání "2:00"

  Scenario: Konec před začátkem se neuloží
    When "petra.kolarova" zapíše činnost s koncem dřív, než je začátek
    Then server záznam odmítne
    And nic se neuloží

  Scenario: Záznam delší než den se neuloží
    # Zapomenuté stopky přes víkend by jinak rozhodily každý průměr.
    When "petra.kolarova" zapíše činnost dlouhou 30 hodin
    Then server záznam odmítne

  Scenario: Konec v budoucnosti se neuloží
    When "petra.kolarova" zapíše činnost s koncem zítra
    Then server záznam odmítne

  Scenario: Smazání běžícího záznamu zastaví stopky
    Given "petra.kolarova" má rozdělanou činnost "Ladění importu"
    When ten záznam smaže
    Then neběží žádná činnost

  # ── Tagy ──────────────────────────────────────────────────────────────────

  Scenario: Tagy se ukládají ořezané a bez prázdných
    When "petra.kolarova" zapíše činnost s tagy " pohotovost ", "" a "víkend"
    Then má záznam tagy "pohotovost" a "víkend"

  Scenario: Stejný tag s jinou velikostí písmen je jeden tag
    When "petra.kolarova" zapíše činnost s tagy "Pohotovost" a "pohotovost"
    Then má záznam jediný tag "Pohotovost"

  Scenario: Víc než deset tagů se odmítne
    When "petra.kolarova" zapíše činnost s jedenácti tagy
    Then server záznam odmítne

  Scenario: Formulář našeptává dřív použité tagy
    # Bez toho vznikne „pohotovost" i „Pohotovost" a rozpad podle tagů je
    # k ničemu.
    Given "petra.kolarova" už použila tag "pohotovost"
    When píše do pole tagů "poho"
    Then jí aplikace nabídne "pohotovost"

  # ── Soukromí ──────────────────────────────────────────────────────────────

  Scenario: Výkazy jiného uživatele nejsou viditelné
    Given "jan.novak" má vlastní záznamy
    When "petra.kolarova" otevře své výkazy
    Then Janovy záznamy nevidí

  Scenario: Cizí záznam nelze upravit
    Given "jan.novak" má záznam "Nasazení"
    When se "petra.kolarova" pokusí ten záznam upravit
    Then dostane odpověď, že neexistuje

  Scenario: Cizí záznam nelze smazat
    Given "jan.novak" má záznam "Nasazení"
    When se "petra.kolarova" pokusí ten záznam smazat
    Then dostane odpověď, že neexistuje

  Scenario: Ani administrátor cizí výkazy nevidí
    # Není to filtr, který by šlo obejít parametrem — endpoint bere vlastníka
    # z přihlášení a jiná cesta k datům neexistuje (ADR-017).
    Given "jan.novak" má vlastní záznamy
    When se administrátor podívá na své výkazy
    Then Janovy záznamy nevidí

  # ── Projekt ───────────────────────────────────────────────────────────────

  Scenario: Záznam nemusí patřit k žádnému projektu
    When "petra.kolarova" zapíše činnost "Lékař" bez projektu
    Then se záznam uloží
    And v seznamu je uvedený jako "Bez projektu"

  Scenario: Smazání projektu záznam nesmaže
    # Výkaz je záznam o odvedené práci; ta se stala, i když projekt zmizel.
    Given "petra.kolarova" má záznam přiřazený k projektu "Backend refaktoring"
    When je ten projekt smazán
    Then záznam zůstává a je "Bez projektu"

  # ── Seznam ────────────────────────────────────────────────────────────────

  Scenario: Záznamy jsou seskupené po dnech s mezisoučtem
    Given "petra.kolarova" má 2:00 a 1:30 ve stejný den
    When otevře seznam výkazů
    Then je u toho dne mezisoučet "3:30"

  Scenario: Filtr podle období
    Given "petra.kolarova" má záznamy z ledna i z února
    When zvolí období únor
    Then vidí jen únorové záznamy

  Scenario: Filtr podle tagu
    Given "petra.kolarova" má záznamy s tagem "pohotovost" i bez něj
    When filtruje podle tagu "pohotovost"
    Then vidí jen ty s tímhle tagem

  Scenario: Hledání v názvu i popisu
    Given "petra.kolarova" má záznam "Code review" s popisem "PR 412"
    When hledá "412"
    Then ten záznam najde

  # ── Přehled ───────────────────────────────────────────────────────────────

  Scenario: Průměr na den počítá jen dny, ve kterých něco je
    # Jmenovatel jsou dny se záznamem, ne kalendářní ani pracovní dny období
    # (ADR-017) — jinak by průměr srazily víkendy a nevyplněné dny.
    Given "petra.kolarova" odpracovala 8:00 v pondělí a 4:00 ve středu
    And v úterý nemá žádný záznam
    When otevře přehled
    Then průměr na den je "6:00"
    And u čísla je uvedeno, že se počítá ze dnů se záznamem

  Scenario: Prázdné období nehlásí dělení nulou
    Given "petra.kolarova" nemá ve zvoleném období žádný záznam
    When otevře přehled
    Then vidí nuly a ne "NaN"

  Scenario: Rozpad podle projektů pojmenuje záznamy bez projektu
    Given "petra.kolarova" má záznamy s projektem i bez něj
    When otevře přehled
    Then je v rozpadu položka "Bez projektu"

  Scenario: Rozpad podle tagů sečte čas každého tagu
    # Záznam se dvěma tagy se počítá do obou — proto součet rozpadu může být
    # větší než odpracovaný čas a obrazovka to nesmí vydávat za rozdělení.
    Given "petra.kolarova" má hodinu s tagy "pohotovost" a "víkend"
    When otevře přehled
    Then je u obou tagů "1:00"

  Scenario: Graf má sloupec i pro den bez práce
    Given "petra.kolarova" odpracovala něco v pondělí a ve středu
    When otevře přehled za ten týden
    Then má graf sloupec i pro úterý, s nulou

  Scenario: Běžící činnost se počítá k okamžiku zobrazení
    Given "petra.kolarova" má rozdělanou činnost, která běží 45 minut
    When otevře přehled
    Then je těch 45 minut součástí odpracovaného času

  # ── Export ────────────────────────────────────────────────────────────────

  Scenario: Export obsahuje právě to, co je po filtru vidět
    Given "petra.kolarova" filtruje podle tagu "pohotovost"
    When klikne "Export"
    Then jsou v souboru jen záznamy s tímhle tagem

  Scenario: Běžící záznam se neexportuje
    # Nemá konec, takže by ve sloupci trvání lhal.
    Given "petra.kolarova" má rozdělanou činnost
    When exportuje seznam
    Then v souboru není

  Scenario: Export uvádí trvání v hodinách i jako hh:mm
    # Hodiny jako číslo se dají sečíst v Excelu, hh:mm se dá přečíst očima.
    When "petra.kolarova" exportuje záznam dlouhý 1:30
    Then je ve sloupci hodin 1,5 a ve sloupci hh:mm "1:30"

  # ── Lišta a navigace ──────────────────────────────────────────────────────

  Scenario: Panel výkazů se otevírá z horní lišty
    When "petra.kolarova" klikne na "⏱ Výkazy" v horní liště
    Then se otevře panel ve stejném rámu jako poznámky a trezor
    And je dostupný i bez otevřeného projektu

  Scenario: Otevřený je vždy jen jeden panel ze tří
    Given panel výkazů je otevřený
    When "petra.kolarova" klikne na tlačítko "Trezor"
    Then je otevřený trezor
    And panel výkazů je zavřený

  Scenario: Tlačítko v liště ukazuje běžící čas i se zavřeným panelem
    # Zapomenuté stopky jsou nejčastější způsob, jak si člověk rozbije data.
    Given "petra.kolarova" má rozdělanou činnost
    When panel zavře
    Then je na tlačítku v liště vidět narostlý čas

  Scenario: Výkazy jsou dostupné z hlavního menu
    When "petra.kolarova" klikne na "⏱ Výkazy práce" na úvodní obrazovce
    Then se otevře obrazovka výkazů na vlastní adrese
    And tlačítko zpět v prohlížeči ji vrátí na seznam projektů

  Scenario: Běžící stopky přežijí reload stránky
    # Běžící činnost drží server, ne prohlížeč — na rozdíl od trezoru, který
    # se reloadem zamyká (ADR-016).
    Given "petra.kolarova" spustí činnost "Ladění importu"
    When znovu načte stránku
    Then činnost pořád běží a lišta to ukazuje
