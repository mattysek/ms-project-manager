# PRD-10: Vykazování práce

## Přehled

Osobní evidence odvedené práce: uživatel si zapisuje činnosti (název, popis, volitelný projekt, začátek, konec, tagy), měří je stopkami z horní lišty a nad nasbíranými záznamy vidí přehled se statistikami a grafy. Seznam jde vyexportovat do Excelu.

Doplňuje to plán o skutečnost. Kapacita a Gantt říkají, kolik práce se **plánuje**; tohle je jediné místo, kde je vidět, kolik jí doopravdy bylo a kam se poděla.

Data jsou striktně soukromá a žijí mimo projekty (ADR-017), stejně jako Quick Notes (PRD-04) a trezor (PRD-09).

## Cíle

- Zapsat činnost za pár vteřin, ideálně bez odchodu z rozdělané práce
- Nemuset opisovat časy — spustit a zastavit stopky, časy doplní aplikace
- Vidět, kolik času kam odteklo (podle dnů, projektů a tagů)
- Dostat seznam do Excelu, když ho někdo potřebuje jinde

## Non-goals

- Sdílení výkazů s PM, týmem nebo administrátorem — výslovný ne-cíl, ne odložená vlastnost (ADR-017)
- Schvalovací workflow, uzávěrky období, zamykání odeslaných výkazů
- Fakturace, sazby, náklady
- Vazba výkazu na konkrétní úkol a porovnání s odhadem MD
- Offline režim (online-only, viz ADR-017 doplněk)
- Souběžně běžící stopky
- Import výkazů z jiných nástrojů

## Uživatelé a role

Vykazování nemá projektové role. Každý přihlášený uživatel má vlastní evidenci a k cizí se nedostane; vlastnictví ověřuje server u každé operace a cizí záznam vrací 404. Přiřazení k projektu je jen štítek — nevyžaduje členství a nedává nikomu jinému právo záznam vidět.

## Funkcionální požadavky

### FR-WL-01: Ruční záznam
- Pole: **Název** (povinný), Popis (nepovinný), Projekt (nepovinný, výběr z projektů uživatele), **Začátek**, **Konec**, Tagy
- Začátek i konec se zadávají jako datum a čas; konec smí zůstat prázdný (= běžící záznam)
- Konec nesmí být dřív než začátek; při porušení se záznam neuloží a formulář to řekne u pole
- Jeden záznam smí trvat nejvýš 24 hodin
- Konec nesmí ležet víc než hodinu v budoucnosti (tolerance na rozjetý čas prohlížeče)

### FR-WL-02: Stopky
- Tlačítko "Start" zapíše záznam se začátkem v okamžik kliknutí a bez konce
- Tlačítko "Stop" doplní konec v okamžik kliknutí
- Čas určuje prohlížeč, ne server (ADR-017); server ho jen validuje
- Běžící záznam je v seznamu vidět na prvním místě a průběžně ukazuje narostlý čas

### FR-WL-03: Nejvýš jedny běžící stopky
- Uživatel má nejvýš jeden nedokončený záznam
- Start nové činnosti ukončí tu předchozí **ve stejném okamžiku**, ve kterém nová začíná (žádná díra, žádný překryv)
- Ukončení předchozí činnosti se uživateli oznámí, aby se to nestalo za jeho zády
- Invariantu drží server; klient na ni nespoléhá, jen ji zobrazuje

### FR-WL-04: Úprava časů
- Začátek i konec už uloženého záznamu jde ručně opravit
- Opravit jde i běžící záznam (typicky začátek, když si uživatel vzpomněl pozdě)
- Úprava podléhá stejným pravidlům jako FR-WL-01

### FR-WL-05: Tagy
- Tagy jsou volný text, k záznamu jich smí být nejvýš 10, každý nejvýš 32 znaků
- Server ořeže bílé znaky, zahodí prázdné a sloučí duplicity bez ohledu na velikost písmen
- Formulář našeptává tagy použité v předchozích záznamech, aby "pohotovost" a "Pohotovost" nebyly dva
- Tagy nemají zvláštní význam pro výpočty — "dovolená" se do součtu času počítá jako všechno ostatní (ADR-017)

### FR-WL-06: Smazání
- Záznam jde smazat po potvrzení, bez koše
- Smazání běžícího záznamu stopky zastaví

### FR-WL-07: Seznam záznamů
- Záznamy jsou seskupené po dnech, od nejnovějšího
- U každého: čas od–do, **strávený čas** jako rozdíl, název, projekt, tagy
- U každého dne mezisoučet odpracovaného času
- Filtrování podle období, projektu, tagu a textu v názvu/popisu
- Výchozí období je aktuální měsíc

### FR-WL-08: Přehled a statistiky
- Vlastní podstránka vedle seznamu, nad stejným zvoleným obdobím
- Metriky: celkem odpracováno, počet dní se záznamem, **průměr na den**, nejdelší den, počet záznamů, průměrná délka záznamu
- **Průměr na den se počítá ze dnů, ve kterých je aspoň jeden záznam** — ne z kalendářních ani ze všech pracovních dnů. Obrazovka to musí u čísla napsat, jinak si ho každý přečte jinak
- Grafy: odpracovaný čas po dnech (sloupcový), rozpad podle projektů, rozpad podle tagů
- Záznam bez projektu se v rozpadu podle projektů ukazuje jako "Bez projektu", ne že chybí
- Běžící záznam se do statistik počítá stavem k okamžiku zobrazení

### FR-WL-09: Export do Excelu
- Tlačítko v seznamu exportuje **právě to, co je vidět po filtru**, ne celou historii
- Sloupce: Datum, Začátek, Konec, Trvání (h), Trvání (hh:mm), Název, Popis, Projekt, Tagy
- Hlavička souboru uvádí období, filtr, počet záznamů a součet času
- Běžící záznam se neexportuje — nemá konec, takže by v tabulce lhal

### FR-WL-10: Rychlý vstup z horní lišty
- Tlačítko "⏱ Výkazy" v horní liště vedle "📝 Poznámky" a "🔐 Trezor", dostupné i na LandingPage bez otevřeného projektu
- Panel umí: spustit novou činnost (název, projekt, tagy), zastavit běžící, a proklik na celou obrazovku
- Když stopky běží, tlačítko v liště to ukazuje i zavřené (běžící čas)
- Otevřený smí být vždy jen jeden ze tří panelů

### FR-WL-11: Vstup z hlavního menu
- Na LandingPage je tlačítko "⏱ Výkazy práce" vedle "Moje práce"
- Obrazovka má vlastní cestu (`/vykazy`), takže na ni jde odkázat i se vrátit tlačítkem zpět v prohlížeči

### FR-WL-12: Izolace uživatelů
- Server bere vlastníka z přihlášení, nikdy z těla požadavku
- Cizí záznam vrací 404, ne 403 — existence cizích dat se nepotvrzuje
- Neexistuje endpoint, kterým by šlo číst výkazy jiného uživatele, ani pro administrátora
- Smazání účtu odstraní jeho výkazy kaskádou; deaktivace je nechává být
- Smazání projektu záznamy nemaže, jen u nich zruší vazbu (zůstane "Bez projektu")

## Non-funkcionální požadavky

- Časy se ukládají jako ISO 8601 v UTC (`...Z`); převod na místní čas i rozhodnutí, do kterého dne záznam patří, dělá klient
- Statistiky se počítají na klientovi nad staženým rozsahem, ne na serveru
- Název záznamu nejvýš 200 znaků, popis nejvýš 4000
- Nejvýš 20 000 záznamů na uživatele (řádově 20 let denního vykazování; brání tomu, aby se z tabulky stalo úložiště logů)
- Seznam za měsíc se vykreslí do 300 ms nad 500 záznamy
- Vykazování nesmí sáhnout na `AppState`, actory ani SignalR

## Uživatelské rozhraní

**Obrazovka `/vykazy`** — mimo `ProjectWorkspace`, stejně jako "Moje práce" (PRD-08). Dvě podstránky:

- **Záznamy** — filtry, tlačítko "+ Nový záznam", tlačítko "⬇ Export", seznam seskupený po dnech s mezisoučty.
- **Přehled** — dlaždice s metrikami a tři grafy nad stejným obdobím.

Grafy jsou inline SVG bez knihovny (ADR-017), barvy a třídy z `AppStyles` jako zbytek aplikace. Stránka renderuje `<AppStyles />` — bez toho by měla neostylovaná tlačítka, což už se jednou stalo "Mojí práci".

**Panel v liště** — `FloatingPanel` sdílený s poznámkami a trezorem, aby se ty tři obrazovky nemohly vizuálně rozejít. Obsahuje běžící činnost s velkým časem a tlačítkem "Stop", nebo formulář pro rychlý start, a dole odkaz "Otevřít výkazy".

Úrovně `z-index` z `constants/layers.ts`, ne vymyšlené (viz PRD-07).

## Out of scope

- Připomínka "zapomněl jsi zastavit stopky"
- Automatické rozpoznání nečinnosti a nabídka zkrátit záznam
- Opakující se šablony činností
- Kalendářní (týdenní) pohled na výkazy místo seznamu
- Souhrn za tým a jakýkoli pohled napříč uživateli
- Vazba na Azure DevOps work items
