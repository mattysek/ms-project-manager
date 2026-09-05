# ADR-017: Vykazování práce mimo command stream

## Status
Přijato

## Kontext

K plánu (kolik práce *bude*) chybí druhá polovina: kolik práce doopravdy *bylo*. Dnes to nikdo neeviduje — MD u úkolu je odhad, který se po dokončení nikdo nevrací opravit, a skutečně strávený čas končí v soukromém Excelu nebo nikde. Bez toho se nedá říct ani „kolik hodin denně opravdu odpracuju", ani „kolik z toho spolkla pohotovost".

Zadání je tedy: evidovat záznamy o vykonávané činnosti (název, popis, volitelný projekt, začátek, konec, tagy), měřit je stopkami z horní lišty, vidět nad nimi statistiky a umět je vyexportovat do Excelu.

To vypadá jako další záložka projektu, ale není. Vykazovaná činnost **nemusí patřit k projektu** — dovolená, lékař, pohotovost, interní schůze — a i ta, která k projektu patří, je záznam o tom, co dělal jeden konkrétní člověk. Tím se to řadí ke stejné rodině jako Quick Notes (PRD-04), trezor (ADR-016) a „Moje práce" (ADR-015): data, která žijí vedle projektů, ne uvnitř nich.

## Rozhodnutí

**Vykazování práce jsou per-user data přístupná přes REST, mimo `ProjectCommand`/`ProjectDiff`, viditelná výhradně vlastníkovi. Statistiky počítá klient.**

### Mimo command stream, a proč to není volba stylu

`AppState` se broadcastuje **všem členům projektu** při každém `full_state` (ADR-004). Kdyby výkazy byly součástí stavu, poslal by je actor rovnou celé skupině — včetně záznamu „lékař" a včetně toho, kolik hodin kdo skutečně odpracoval. To je přesně ten úraz, kvůli kterému jde přes REST i trezor.

Druhý důvod je tvarový: záznam bez projektu by v projektovém stavu neměl kde bydlet. Actor je jeden na projekt (ADR-002) a „dovolená" nepatří žádnému.

Jde tedy o vlastní tabulku a vlastní REST, stejně jako quick notes: `GET/POST /api/worklog`, `PUT/DELETE /api/worklog/{id}`, plus stopky (`/start`, `/stop`, `/running`).

### Data jsou striktně soukromá

Výkaz vidí **jen jeho autor**. Ne PM projektu, ne admin. Vlastnictví se ověřuje na serveru u každé operace a cizí záznam se tváří jako neexistující (404, ne 403) — stejné pravidlo jako u quick notes (FR-QN-08) a trezoru (FR-VAULT-11).

Rozhodnutí je vědomé a stojí za ním tohle: jakmile výkazy uvidí nadřízený, přestanou být nástrojem uživatele a stanou se výkonovým měřidlem. Pak si do nich lidé přestanou psát „lékař" a „půl hodiny jsem hledal, proč to nejde" — a data, kvůli kterým funkce vzniká, zmizí. Sdílení týmových výkazů je tím pádem **ne-cíl**, ne odložená vlastnost; kdyby se přidávalo, bude to znamenat nový souhlas uživatele a nové ADR, ne rozšíření dotazu o `WHERE`.

Praktický důsledek: `/api/worklog` nikdy nebere `userId` z požadavku. Bere ho z přihlášení, a nikde není cesta, jak se zeptat na cizí.

### Čas posílá klient, server ho jen validuje

Zadání říká „čas zaznamená systém sám". Systémem je v tomhle případě **prohlížeč**, ne server:

- Uživatel porovnává výkaz s vlastními hodinkami. Čas serveru se od nich může lišit a hlavně nemá jak vysvětlit rozdíl.
- Když „Stop" selže na síti, správný okamžik je ten, kdy uživatel klikl — ne ten, kdy se požadavek nakonec podařilo doručit. Klientem posílaný čas dovolí opakovat pokus beze změny výsledku.
- Ruční oprava časů je stejně explicitně požadovaná funkce, takže server v žádném případě není autoritou na to, kdy práce začala.

Server proto časy **přijímá a kontroluje**, nevyrábí: musí to být platné ISO 8601, `startedAt ≤ endedAt`, konec nesmí být dál než hodinu v budoucnosti (tolerance na rozjetý klientský čas) a jeden záznam smí trvat nejvýš 24 hodin. Neplatný vstup je 400, ne tiché zaokrouhlení.

Ukládá se **UTC s `Z`**, jako všude jinde v téhle databázi (`Common.Clock.nowIso`). Není to kosmetika: repozitáře řadí podle času `OrderBy` nad textovým sloupcem, a s pomíchanými offsety (`+02:00` vs `+01:00`) přestane lexikografické řazení odpovídat chronologickému. Převod do místního času — a tím i rozhodnutí, do kterého **dne** záznam patří — dělá klient, stejně jako u dat úkolů (`parseLocalDate`, ADR-005).

### Nejvýš jedny běžící stopky

Nedokončený záznam je řádek s `ended_at IS NULL`. Uživatel jich smí mít **nejvýš jeden**, a vynucuje to server: `POST /api/worklog/start` uzavře případný předchozí běžící záznam ve stejném okamžiku, ve kterém začíná nový.

Alternativa „start odmítni, dokud neukončíš" i „ať běží kolik chce" se zavrhly ze stejného důvodu: v horní liště je jedno tlačítko „Stop". Kdyby mohly běžet dvě činnosti, nemá to tlačítko co dělat a celý rychlý vstup z lišty — druhá polovina zadání — se rozpadne na výběr ze seznamu. Zavření předchozího na `startedAt` toho nového navíc znamená, že mezi navazujícími záznamy nevznikne ani díra, ani překryv.

Souběžné vykazování (pohotovost běžící přes celý den *přes* běžnou práci) tím padá. Je to skutečné omezení a řeší se ručně zadaným záznamem s vlastními časy, ne stopkami — překryvy záznamů zakázané nejsou, jen je neumí vyrobit stopky.

### Tagy jsou volný text v jednom sloupci

Tagy se ukládají jako JSON pole v jednom textovém sloupci, ne do vazební tabulky. Server podle nich nikdy nefiltruje ani neagreguje — filtrování i statistiky běží na klientovi nad staženým rozsahem — takže join by nekupoval nic než dvě tabulky navíc.

Tagy nemají žádnou sémantiku. „Dovolená" i „lékař" jsou pro součty obyčejný čas jako každý jiný; přehled je umí rozpadnout podle tagů a uživatel si sám řekne, co za práci považuje. Příznak „nepočítat jako práci" by znamenal spravovaný číselník a rozhodnutí, kdo ho spravuje — a to je víc mechaniky, než kolik unese nástroj, který má hlavně ukázat, kam se poděl den.

Normalizace je proto minimální a dělá ji server: ořezat bílé znaky, zahodit prázdné, sloučit duplicity bez ohledu na velikost písmen (zapsaná varianta zůstává první zadaná), nejvýš 10 tagů po 32 znacích.

### Statistiky počítá klient

Server vrací záznamy v požadovaném rozsahu a nic víc. Průměry, součty, rozpady i grafy vznikají v prohlížeči, protože:

- den je hranice v **místním** čase, kterou by server musel odvozovat z časové zóny, kterou nezná;
- klient už umí české svátky a pracovní dny (`utils/dates.ts`), server tuhle znalost mimo `Domain/Weeks.fs` nemá;
- je to stejné dělení práce jako u odvozených dat projektu (ADR-005): stav ze serveru, odvozeniny přes `useMemo`.

**Průměrná odpracovaná doba za den se počítá ze dnů, ve kterých nějaký záznam je** — ne ze všech kalendářních ani ze všech pracovních dnů v období. Odpovídá to na „když pracuju, kolik toho odpracuju" a nesráží průměr víkendy a dny, kdy si uživatel prostě nic nezapsal. Obrazovka to musí říct popiskem, jinak si každý přečte jiné číslo.

### Grafy se kreslí ručně v SVG

Žádná knihovna grafů. Bundle je součástí ADR-011 a aplikace už jeden netriviální vizuál (Gantt) kreslí sama; přidat kvůli třem sloupcovým grafům závislost velikosti Rechartu by bylo nepoměrné. Grafy jsou inline `<svg>` nad daty, která už komponenta stejně má spočítaná.

### Export do Excelu na klientovi

`xlsx` už v projektu je a už se přes něj exportují úkoly (`views/Seznam/exportTasksToExcel.ts`). Export výkazů jde stejnou cestou: čistá funkce nad vyfiltrovaným seznamem, žádný endpoint. Data má klient v ruce, posílat je na server jen proto, aby je poslal zpátky jako soubor, nedává smysl.

## Alternativy

### Výkazy jako součást `AppState` (další záložka projektu)
- **Pro:** zdarma undo/redo, offline fronta, realtime mezi záložkami; žádné nové API
- **Proti:** broadcast celé skupině (ADR-004) — soukromá data by šla všem členům. A záznam bez projektu nemá v projektovém stavu kde být

### Vazba výkazu na úkol místo na projekt
- **Pro:** skutečnost vedle odhadu na jednom místě, MD by šlo porovnat s realitou
- **Proti:** vykazuje se i to, co žádný úkol nemá (schůze, pohotovost, dovolená), takže vazba musí být stejně volitelná. A `Task.id` je unikátní jen uvnitř projektu, takže by výkaz musel nést dvojici — víc vazeb, které se rozbijí, když se úkol smaže. Vazba na úkol je smysluplné rozšíření, ne základ

### Čas generuje server
- **Pro:** jedna autorita, uživatel si čas nemůže posunout
- **Proti:** uživatel si čas posunout **musí umět** — ruční oprava je zadaná funkce, takže server autoritou stejně není. A selhaný „Stop" by se zapsal s časem doručení místo času kliknutí

### PM vidí výkazy svého projektu
- **Pro:** reporting, fakturace, podklad pro plánování
- **Proti:** mění to funkci z osobního nástroje na měřidlo výkonu a tím i to, co si do ní lidé napíšou. Viz výše — vědomý ne-cíl

## Důsledky

**Pozitivní:**
- Výkazy nemají s projektovými actory nic společného, takže nemůžou zpomalit ani rozbít command stream
- Soukromí je vynucené tvarem API, ne jen filtrem — neexistuje cesta, jak se zeptat na cizí data
- Statistiky i export se dají měnit bez zásahu do serveru

**Negativní:**
- Třetí per-user REST oblast vedle quick notes a trezoru; sdílená je jen `httpClient` a `FloatingPanel`
- Bez serverové agregace se pro dlouhé období stahují všechny záznamy rozsahu. Pro jednoho člověka a řádově tisíce záznamů za rok je to jednotky set kB, takže se s tím počítá — ne však s reportem za celý tým
- Souběžné stopky nejdou; překryv se dá zapsat jen ručně
- Data jsou v UTC, ale den je místní. Jakýkoli výpočet nad výkazy na **serveru** by tuhle znalost neměl a musel by ji dostat zvenčí

## Doplněk: offline je mimo rozsah

Stejně jako trezor (ADR-016) a soubory (ADR-010), a na rozdíl od quick notes (ADR-009): vykazování je online-only. Fronta by musela řešit, co se stane, když stopky běží v jedné záložce offline a v druhé online — a invariantu „nejvýš jedny běžící stopky" drží server, takže offline se nedá udržet vůbec.

Zbývá zmírnění, které stojí za to: protože časy posílá klient, **selhaný požadavek si drží původní okamžik**. Když „Stop" neprojde, záznam zůstane běžící, uživatel dostane hlášku a opakování zapíše ten čas, kdy skutečně kliknul, ne ten, kdy se síť vrátila.
