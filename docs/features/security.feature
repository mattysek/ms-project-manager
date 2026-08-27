Feature: Zabezpečení HTTP vrstvy

  Hlavičky, cookie a cachování — věci, které nejsou vidět v UI, ale rozhodují
  o tom, jestli se z uživatelského obsahu dá udělat útok na ostatní členy týmu.
  Viz ADR-003 a jeho doplněk.

  Background:
    Given server běží a je dostupný na intranetu

  Scenario: Odpověď nese bezpečnostní hlavičky
    When klient si vyžádá jakoukoli stránku aplikace
    Then odpověď obsahuje hlavičku "X-Content-Type-Options: nosniff"
    And odpověď obsahuje hlavičku "X-Frame-Options: DENY"
    And odpověď obsahuje hlavičku "Referrer-Policy: no-referrer"
    And odpověď obsahuje "Content-Security-Policy" s direktivou "frame-ancestors 'none'"

  Scenario: Content-Security-Policy nepouští cizí skripty
    When klient si vyžádá "index.html"
    Then "Content-Security-Policy" obsahuje "default-src 'self'"
    And obsahuje "script-src 'self'" bez "unsafe-inline"
    And obsahuje "object-src 'none'"

  Scenario: Server neprozrazuje použitou technologii
    When klient si vyžádá jakoukoli stránku aplikace
    Then odpověď neobsahuje hlavičku "Server"
    And odpověď neobsahuje hlavičku "X-Powered-By"

  Scenario: Přihlašovací cookie je chráněná
    Given uživatel "jan.novak" se úspěšně přihlásil
    Then přihlašovací cookie má příznak "HttpOnly"
    And přihlašovací cookie má "SameSite=Strict"

  Scenario: Hashované assety se cachují napořád
    When klient si vyžádá soubor z "/assets/"
    Then odpověď má "Cache-Control: public, max-age=31536000, immutable"

  Scenario: index.html a API se necachují
    When klient si vyžádá "index.html"
    Then odpověď má "Cache-Control: no-cache, no-store, must-revalidate"
    When klient si vyžádá endpoint pod "/api/"
    Then odpověď má "Cache-Control: no-cache, no-store, must-revalidate"

  Scenario: SPA fallback taky dostane hlavičky
    When klient si vyžádá cestu, kterou obsluhuje SPA fallback
    Then odpověď má "Cache-Control: no-cache, no-store, must-revalidate"
    And odpověď obsahuje hlavičku "X-Content-Type-Options: nosniff"
