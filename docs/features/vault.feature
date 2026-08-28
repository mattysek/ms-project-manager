# Trezor hesel — PRD-09, ADR-016.
#
# Klíčové pravidlo, které se táhne celým souborem: server obsah trezoru nikdy
# nevidí. Šifruje a dešifruje se v prohlížeči, heslo k trezoru neopouští
# záložku. Scénáře proto rozlišují, co se ověřuje na klientovi a co na drátu.
Feature: Trezor hesel

  Background:
    Given uživatel "jan.novak" je přihlášen

  Scenario: Založení trezoru při prvním otevření
    Given uživatel ještě nemá trezor
    When otevře trezor z horní lišty
    Then je vyzván ke zvolení hesla k trezoru
    And je upozorněn, že zapomenuté heslo nelze obnovit
    When zadá heslo "TrezorHeslo123" a potvrdí ho
    And klikne "Založit trezor"
    Then je trezor odemčený a prázdný

  Scenario: Heslo k trezoru musí mít alespoň 12 znaků
    Given uživatel ještě nemá trezor a zakládá ho
    When zadá heslo "kratke" a potvrdí ho
    Then je zobrazena chybová zpráva "Heslo k trezoru musí mít alespoň 12 znaků"
    And trezor není založen

  Scenario: Potvrzení hesla se musí shodovat
    Given uživatel ještě nemá trezor a zakládá ho
    When zadá heslo "TrezorHeslo123" a potvrdí ho jako "TrezorHeslo456"
    Then je zobrazena chybová zpráva "Hesla se neshodují"
    And trezor není založen

  Scenario: Odemčení trezoru správným heslem
    Given uživatel má trezor s heslem "TrezorHeslo123"
    And trezor je zamčený
    When zadá heslo "TrezorHeslo123"
    And klikne "Odemknout"
    Then je trezor odemčený
    And vidí své uložené záznamy

  Scenario: Odemčení špatným heslem
    Given uživatel má trezor s heslem "TrezorHeslo123"
    And trezor je zamčený
    When zadá heslo "SpatneHeslo999"
    And klikne "Odemknout"
    Then je zobrazena chybová zpráva "Nesprávné heslo k trezoru"
    And trezor zůstává zamčený
    And není zobrazen žádný záznam

  Scenario: Ruční zamčení trezoru
    Given uživatel má odemčený trezor se záznamem "Testovací server"
    When klikne "Zamknout"
    Then je trezor zamčený
    And záznam "Testovací server" není zobrazen

  Scenario: Automatické zamčení po nečinnosti
    # Odemčený trezor na opuštěné obrazovce je otevřený trezor.
    Given uživatel má odemčený trezor
    When 15 minut s trezorem nepracuje
    Then je trezor automaticky zamčený

  Scenario: Reload stránky trezor zamkne
    # Klíč žije jen v paměti záložky — nikde se neukládá.
    Given uživatel má odemčený trezor
    When provede reload stránky (F5)
    Then je trezor zamčený a žádá heslo

  Scenario: Přidání záznamu
    Given uživatel má odemčený a prázdný trezor
    When klikne "+ Nový záznam"
    And zadá název "Testovací server", uživatelské jméno "svc_test", heslo "Tajne123" a URL "https://test.firma.cz"
    And klikne "Uložit"
    Then je záznam "Testovací server" v seznamu
    And po zamčení a odemčení trezoru je záznam stále čitelný

  Scenario: Název záznamu je povinný
    Given uživatel má odemčený trezor a zakládá záznam
    When nechá název prázdný a klikne "Uložit"
    Then je zobrazena chybová zpráva "Název je povinný"
    And záznam není uložen

  Scenario: Úprava záznamu
    Given uživatel má odemčený trezor se záznamem "Testovací server"
    When otevře záznam k úpravě
    And změní uživatelské jméno na "svc_test2"
    And klikne "Uložit"
    Then záznam "Testovací server" má uživatelské jméno "svc_test2"

  Scenario: Smazání záznamu
    Given uživatel má odemčený trezor se záznamem "Testovací server"
    When klikne na smazání záznamu
    And potvrdí smazání
    Then záznam "Testovací server" v seznamu není

  Scenario: Heslo je ve výpisu maskované
    Given uživatel má odemčený trezor se záznamem s heslem "Tajne123"
    When si prohlíží seznam záznamů
    Then heslo "Tajne123" není na obrazovce vidět

  Scenario: Zobrazení hesla na vyžádání
    Given uživatel má odemčený trezor se záznamem s heslem "Tajne123"
    When klikne na "Zobrazit heslo"
    Then je heslo "Tajne123" zobrazeno
    When klikne znovu
    Then je heslo opět maskované

  Scenario: Kopírování hesla do schránky
    Given uživatel má odemčený trezor se záznamem s heslem "Tajne123"
    When klikne na "Kopírovat heslo"
    Then je heslo "Tajne123" ve schránce
    And heslo nebylo při kopírování zobrazeno

  Scenario: Schránka se po chvíli vyprázdní
    # Heslo ve schránce přežije zavření aplikace, takže tam nesmí zůstat.
    Given uživatel zkopíroval heslo do schránky
    When uplyne 30 sekund
    Then schránka už zkopírované heslo neobsahuje

  Scenario: Hledání v trezoru
    Given uživatel má odemčený trezor se záznamy "Testovací server" a "Produkční databáze"
    When do hledání zadá "produkč"
    Then je zobrazen jen záznam "Produkční databáze"

  Scenario: Generátor hesel
    Given uživatel má odemčený trezor a zakládá záznam
    When klikne na "Generovat heslo"
    Then je pole hesla vyplněno náhodným heslem o délce 20 znaků
    And dvě po sobě vygenerovaná hesla se liší

  Scenario: Změna hesla k trezoru
    Given uživatel má odemčený trezor se záznamem "Testovací server"
    When zvolí "Změnit heslo trezoru"
    And zadá stávající heslo "TrezorHeslo123" a nové heslo "NoveTrezorHeslo456"
    And klikne "Změnit heslo"
    Then je heslo změněno
    And po zamčení lze trezor odemknout heslem "NoveTrezorHeslo456"
    And původní heslo "TrezorHeslo123" je odmítnuto
    And záznam "Testovací server" je stále čitelný

  Scenario: Změna hesla trezoru se špatným stávajícím heslem
    Given uživatel má odemčený trezor s heslem "TrezorHeslo123"
    When zvolí "Změnit heslo trezoru"
    And zadá stávající heslo "SpatneHeslo999" a nové heslo "NoveTrezorHeslo456"
    Then je zobrazena chybová zpráva "Nesprávné heslo k trezoru"
    And trezor je stále přístupný původním heslem

  Scenario: Zrušení trezoru bez znalosti hesla
    # Jediné východisko ze zapomenutého hesla — obsah je nenávratně pryč.
    Given uživatel má zamčený trezor a nepamatuje si heslo
    When zvolí "Zrušit trezor"
    And potvrdí opsáním slova "SMAZAT"
    Then je trezor i všechny jeho záznamy smazán
    And při dalším otevření je nabídnuto založení nového trezoru

  Scenario: Server obsah trezoru nevidí
    Given uživatel uloží záznam s heslem "Tajne123"
    When se obsah tabulky trezoru přečte přímo na serveru
    Then se v uložených datech nevyskytuje "Tajne123" ani název záznamu
    And uložený blob nejde dešifrovat bez hesla uživatele

  Scenario: Cizí trezor není dostupný
    Given uživatel "jan.novak" má v trezoru záznam
    And existuje jiný uživatel "petra.kolarova"
    When se "petra.kolarova" pokusí načíst záznam uživatele "jan.novak"
    Then je odpověď 404
    And ve své vlastní odpovědi vidí jen své záznamy

  Scenario: Trezor je dostupný i bez otevřeného projektu
    Given uživatel je na stránce se seznamem projektů
    Then je tlačítko "Trezor" v horní liště dostupné
