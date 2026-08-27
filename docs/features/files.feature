Feature: Soubory projektu

  Background:
    Given existuje projekt "Backend refaktoring"
    And projekt má členy: "jan.novak" (PM), "petra.kolarova" (Dev)
    And "jan.novak" je přihlášen a má projekt otevřený na záložce Soubory

  Scenario: Upload souboru přes file picker
    When "jan.novak" klikne na "Vybrat soubory"
    And vybere soubor "specifikace-api.pdf" (velikost 2.3 MB)
    Then soubor "specifikace-api.pdf" se zobrazí v seznamu souborů
    And zobrazuje se velikost "2.3 MB" a datum přidání
    And soubor je uložen na serveru (BLOB v SQLite)
    And "petra.kolarova" vidí nový soubor po obdržení SignalR diffu

  Scenario: Upload souboru přes drag-and-drop
    When "jan.novak" přetáhne soubor "diagram-architektury.png" do oblasti pro drag-and-drop
    Then soubor "diagram-architektury.png" se zobrazí v seznamu
    And oblast pro drag-drop zobrazuje vizuální feedback při přetahování

  Scenario: Upload více souborů najednou
    When "jan.novak" vybere 3 soubory najednou (PDF, XLSX, PNG)
    Then všechny 3 soubory jsou nahrány a zobrazeny v seznamu
    And pořadí souborů odpovídá pořadí uploadu

  Scenario: Upload souboru s přílišnou velikostí
    When "jan.novak" se pokusí uploadovat soubor "velka-databaze.bak" (velikost 30 MB)
    Then upload je odmítnut
    And je zobrazena chybová zpráva "Soubor je příliš velký. Maximální povolená velikost je 25 MB."

  Scenario: Běžné projektové přílohy jdou nahrát
    # Whitelist MIME typů odmítal `text/markdown`, `.pfx`, `x-zip-compressed`
    # i `application/octet-stream` — reálný export z provozu tím přišel
    # o polovinu příloh. Uložit bajty není zranitelnost; rozhoduje zobrazení.
    When "jan.novak" nahraje poznámky v Markdownu, ZIP, certifikát i soubor
      neznámého typu
    Then se všechny uloží a objeví v sekci Soubory

  Scenario: Preview obrázku (PNG/JPEG)
    Given projekt má soubor "diagram-architektury.png"
    When "jan.novak" klikne na "Náhled" u souboru "diagram-architektury.png"
    Then je zobrazen preview obrázku přímo v aplikaci
    And obrázek je přiblížen na čitelnou velikost

  Scenario: Preview PDF souboru
    Given projekt má soubor "specifikace-api.pdf"
    When "jan.novak" klikne na "Náhled" u souboru "specifikace-api.pdf"
    Then je zobrazen PDF viewer s obsahem souboru
    And je možné scrollovat po stránkách PDF

  Scenario: Preview Excel souboru (XLSX)
    Given projekt má soubor "kapacitni-plan.xlsx"
    When "jan.novak" klikne na "Náhled" u souboru "kapacitni-plan.xlsx"
    Then je zobrazena tabulka s daty z prvního listu
    And je možné přepínat mezi listy
    And sloupce mají správné nadpisy

  Scenario: Preview Word souboru (DOCX)
    Given projekt má soubor "technicka-dokumentace.docx"
    When "jan.novak" klikne na "Náhled" u souboru "technicka-dokumentace.docx"
    Then je zobrazen obsah dokumentu jako HTML

  Scenario: Stažení souboru
    Given projekt má soubor "specifikace-api.pdf"
    When "jan.novak" klikne na "Stáhnout" u souboru "specifikace-api.pdf"
    Then prohlížeč spustí stažení souboru "specifikace-api.pdf"
    And soubor je stažen v původním formátu bez poškození

  Scenario: Dev může stahovat soubory
    Given "petra.kolarova" je přihlášena a má projekt otevřený na záložce Soubory
    When klikne na "Stáhnout" u souboru "specifikace-api.pdf"
    Then prohlížeč spustí stažení souboru

  Scenario: Editace poznámky k souboru (PM)
    Given projekt má soubor "diagram-architektury.png"
    When "jan.novak" klikne na ikonu editace poznámky u souboru
    And zadá "Architekturální diagram z designu session 10.8.2026"
    And klikne "Uložit"
    Then poznámka je zobrazena pod názvem souboru

  Scenario: Dev může editovat poznámku k vlastnímu souboru
    Given "petra.kolarova" uploadovala soubor "moje-analyza.pdf"
    And "petra.kolarova" je přihlášena a je na záložce Soubory
    When klikne na editaci poznámky u "moje-analyza.pdf"
    Then může editovat poznámku k tomuto souboru (který sama uploadovala)

  Scenario: Dev může nahrávat soubory
    Given "petra.kolarova" je přihlášena a je na záložce Soubory
    When nahraje soubor "moje-analyza.pdf"
    Then soubor je uložen a zobrazen v seznamu
    And "jan.novak" ho vidí po obdržení SignalR diffu

  Scenario: Dev nemůže smazat soubor
    Given "petra.kolarova" je přihlášena a je na záložce Soubory
    Then u souborů chybí tlačítko "Smazat" nebo je neaktivní

  Scenario: Smazání souboru (PM)
    Given projekt má soubor "zastarale-dokumenty.zip"
    When "jan.novak" klikne na "Smazat" u souboru "zastarale-dokumenty.zip"
    And potvrdí dialog "Opravdu smazat soubor zastarale-dokumenty.zip?"
    Then soubor zmizí ze seznamu
    And soubor je trvale smazán ze serveru (BLOB odstraněn z DB)

  Scenario: Zobrazení celkové velikosti souborů
    Given projekt má soubory o celkové velikosti 15.7 MB
    Then záhlaví sekce zobrazuje "Celkem: 15.7 MB"

  Scenario: Neoprávněný přístup k souboru přes přímou URL
    Given existuje soubor s id "abc123" patřící projektu "Backend refaktoring"
    And "neautorizovany.uzivatel" není členem projektu
    When se pokusí stáhnout soubor přes URL "/api/files/abc123"
    Then server vrátí HTTP 403 Forbidden
    And soubor není stažen

  Scenario: Skriptovatelný obsah se nikdy nepošle inline
    # Tady leží celá záruka, ne ve filtru při nahrávání. Stažený soubor se
    # otevírá z `file://`, tedy mimo náš origin a bez přístupu k cookie.
    Given "jan.novak" nahrál "ikona.svg" typu "image/svg+xml" se skriptem uvnitř
    When si klient vyžádá jeho náhled parametrem inline
    Then server ho přesto pošle s hlavičkou "Content-Disposition: attachment"
    And totéž platí pro HTML i neznámé typy

  Scenario: Náhled nikde nevykreslí cizí obsah jako HTML
    # Druhá zábrana — v místě zobrazení. XSS není jen o Content-Disposition,
    # ale i o reflexi: kamkoli se dostane cizí text, musí být escapovaný.
    Given projekt má přílohy různých typů od jiného uživatele
    Then markdown i Word procházejí před vykreslením sanitizací (DOMPurify)
    And text a kód se vykreslují jako escapovaný `<pre>`
    And jméno souboru, poznámka i MIME typ jdou přes JSX, které escapuje samo

  Scenario: Náhled se vynutí jako stažení u typů, které umí spouštět skript
    Given projekt má soubor "poznamky.txt" typu "text/plain"
    When klient si vyžádá náhled souboru "poznamky.txt"
    Then server pošle soubor s hlavičkou "Content-Disposition: attachment"
    And soubor se nezobrazí v prohlížeči na originu aplikace

  Scenario: Náhled obrázku a PDF zůstává inline
    Given projekt má soubor "diagram-architektury.png" typu "image/png"
    And projekt má soubor "specifikace-api.pdf" typu "application/pdf"
    When klient si vyžádá náhled obou souborů
    Then server oba pošle inline, aby šly zobrazit v "<img>" a "<iframe>"

  Scenario: Ovládání náhledu není schované pod horní lištou
    # `TopBar` je `position: fixed` se z-indexem nad obsahem. Celoobrazovkové
    # modaly měly nižší vrstvu, takže jim lišta překrývala horní pruh — a v něm
    # sedí právě „✕ Zavřít" a „↓ Stáhnout". Stejná chyba jako když lišta
    # polykala klikání na „⬆ Import" a „⬇ Export".
    Given "jan.novak" má otevřený náhled přílohy
    Then tlačítka "✕ Zavřít" a "↓ Stáhnout" jsou klikatelná
    And totéž platí pro ostatní celoobrazovkové dialogy (detail úkolu, historie KB, konflikty)
