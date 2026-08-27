# ADR-015: Čtení napříč projekty jako projekce mimo actory

## Status
Přijato

## Kontext

Kapacita je vlastnost člověka, ale `Person.weekAlloc` i úkoly žijí uvnitř
`AppState` jednoho projektu. Kdo je na třech projektech po 100 %, není v žádném
z nich přetížený — a přitom nemá šanci to stihnout. Aplikace na to do teď
neuměla odpovědět vůbec; Dev navíc neměl žádný pohled na svoje úkoly jinde než
projekt po projektu.

Přehled napříč projekty ale naráží na ADR-002: stav vlastní `ProjectActor`,
jeden na projekt. Přímočaré řešení — zeptat se každého actoru — má dva
problémy:

- `ProjectActorRegistry.Get` actor **vytvoří**, když neexistuje. Dotaz na
  přehled by tedy probudil actor každého projektu, do kterého uživatel patří,
  načetl jeho stav z DB a nechal ho v paměti dalších 15 minut
  (`IdleTimeout`) — kvůli obrazovce, která nic nemění.
- Serializace přes mailbox je tu k ničemu. Actor existuje kvůli pořadí
  **zápisů**; čtení jednoho snímku žádné pořadí nepotřebuje.

## Rozhodnutí

Čtení napříč projekty je **projekce nad `state_json`**, mimo actory.
`Projects.listWithStateForUser` načte projekty uživatele i s uloženým stavem
jedním dotazem; `WorkloadApi` z nich vybere úkoly osob navázaných na jeho účet.

Actory zůstávají jediná cesta k **zápisu**. Z projekce se nic nezapisuje a
nesmí — právě proto je bezpečná.

### Daň: projekce může být pozadu

Actor persistuje po ticku (`ActorOptions.PersistInterval`, 5 s), ne po každém
commandu. Projekce tedy může být až o tolik pozadu — změna provedená před
sekundou v ní ještě nemusí být.

To se **neschovává**: `WorkloadResponse.StaleAfterSeconds` to nese na klienta a
obrazovka to má napsané v podhlavičce („údaje mohou být až 5 s staré"). Pro
otázku „co mám tenhle týden" je to bez významu; pro rozhodnutí o zápisu by
nestačilo, a odsud se nezapisuje.

Alternativa — flushovat actory před každým dotazem — by z read-only přehledu
udělala zápisovou operaci nad celou databází. Nestojí to za pět sekund.

### Co počítá server a co klient

Server posílá **fakta**: který úkol, v jakém projektu, kolik MD, od kdy do kdy
v **kalendářních datech**. Převod čísla týdne na datum patří na server, protože
`Task.S`/`E` jsou 1-based indexy do časové osy *svého* projektu (ADR-014) — W5
v jednom projektu je jiný týden než W5 v druhém a každý konzument by si ten
převod jinak dělal po svém. Tomu se ADR-014 vyhýbá.

Kapacitu server neposílá vůbec. Závisí na českých svátcích a pracovních dnech,
což je klientský výpočet (ADR-005, `utils/dates.ts`). Klient tedy rozpouští MD
do kalendářních týdnů a porovnává je s dostupností — stejným poměrným dělením
podle pracovních dnů, jaké uvnitř projektu dělá `useWeeklyLoad`.

### Rozsah první verze

Jen **vlastní** práce přihlášeného uživatele. Cross-project vytížení *cizí*
osoby (co by chtěl PM) vyžaduje oprávnění napříč projekty, do kterých ten PM
nemusí patřit — to je vlastní rozhodnutí o přístupu a nepatří do stejné dávky.

Časová osa se swimlanes (projekty jako řádky) se vědomě nestaví: `GanttView`
pracuje s čísly týdnů jednoho projektu, takže napříč projekty by vznikla druhá,
paralelní implementace časové osy — přesně konstelace, ze které vzešel bug
opravený v ADR-014. Seznam po kalendářních týdnech odpovídá na stejnou otázku
levněji.

## Důsledky

- Přibyl jeden REST endpoint (`GET /api/me/workload`) a jedna obrazovka mimo
  `ProjectWorkspace` (`/moje-prace`). Není to desátá záložka projektu, protože
  nepatří žádnému projektu.
- `Projects.listWithStateForUser` je od teď společný podklad pro čtení nad víc
  projekty. Používá ho i kontrola osiřelé práce při deaktivaci účtu.
- Kdo přidá další přehled napříč projekty, má kam sáhnout — a ví, že actory
  obchází vědomě a za jakou cenu.
