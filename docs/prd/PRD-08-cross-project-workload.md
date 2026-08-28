# PRD-08: Moje práce napříč projekty

## Přehled

Nástroj se pořizuje kvůli kapacitnímu plánování, ale kapacitu do teď měřil jen
uvnitř jednoho projektu. `Person.weekAlloc` i úkoly jsou součástí `AppState`
jednoho projektu, takže člověk na třech projektech po 100 % se v žádném z nich
jako přetížený neukáže. Dev navíc neměl žádný pohled na to, co ho čeká — musel
obcházet projekt po projektu.

Tahle obrazovka je první místo, kde se práce jednoho člověka sečte přes všechny
projekty.

## Cíle

1. Dev vidí na jednom místě, co má tenhle a příští týdny, ať to leží kdekoli
2. Přetížení napříč projekty je vidět — MD proti reálné dostupnosti v týdnu
3. Proklik do projektu, kde úkol leží

## Non-goals (první verze)

- **Editace odsud.** Každý projekt je vlastní actor a vlastní SignalR skupina;
  zápis by znamenal připojit se do N hubů nebo obejít actor (ADR-002, ADR-015).
- **Vytížení cizí osoby.** Co by chtěl PM — „je Petra přetížená celkově?" —
  potřebuje oprávnění napříč projekty, do kterých ten PM nemusí patřit. Vlastní
  rozhodnutí o přístupu, vlastní dávka.
- **Časová osa se swimlanes.** Viz ADR-015: vznikla by druhá implementace
  časové osy vedle `GanttView`.
- **Archivované projekty.** Je to přehled rozdělané práce, ne archiv.

## Funkcionální požadavky

### FR-WORK-01: Moje úkoly napříč projekty
- `GET /api/me/workload` vrací úkoly osob, jejichž `userId` odpovídá
  přihlášenému uživateli (ADR-006 — nikdy podle `Person.Id`)
- Rozsah úkolu je v **kalendářních datech**, ne v číslech týdnů (ADR-014)
- Archivované projekty se vynechávají
- Nečitelný `state_json` jednoho projektu přehled neshodí — projekt se přeskočí

### FR-WORK-02: Rozpad do kalendářních týdnů
- Úkoly se seskupí podle pondělků kalendářních týdnů
- MD úkolu se dělí přes týdny **poměrně podle pracovních dnů**, stejně jako
  `useWeeklyLoad` uvnitř projektu — zkrácený sváteční týden nedostane plnou porci
- Týden bez práce se nezobrazuje

### FR-WORK-03: Vytížení proti dostupnosti
- Pro každý týden se ukazuje `přiřazeno / dostupné MD`
- Dostupnost = pracovní dny týdne po odečtení českých svátků (klientský výpočet,
  ADR-005)
- Barva: přes kapacitu červeně, nad 85 % žlutě, jinak zeleně

### FR-WORK-04: Přiznané zpoždění dat
- Přehled se čte mimo actory, takže může být až `staleAfterSeconds` pozadu
- Hodnotu posílá server a obrazovka ji uvádí v podhlavičce

### FR-WORK-05: Proklik do projektu
- Klik na úkol otevře projekt, ve kterém leží

### FR-WORK-06: Prázdný stav vysvětluje, co chybí
- Bez přiřazené práce se ukáže, že osobu musí PM v Kapacitě spárovat s účtem
  (FR-ROLE-07) — bez toho uživatel nemá „vlastní" nic a přehled by mlčel

### FR-WORK-07: Přehled začíná na aktuálním týdnu
- Po otevření je obrazovka posunutá na **aktuální týden**, ne na začátek seznamu
- Aktuální týden je v seznamu vizuálně označený („tento týden"), aby byl posun srozumitelný
- Když v aktuálním týdnu není žádná práce, posune se na **nejbližší příští** týden s prací; když je všechno v minulosti, na poslední
- Posun se děje **jednou za otevření obrazovky**. Ruční „Obnovit" uživatele nevrací zpátky — přehled se obnovuje často a odrolovaného uživatele by to pokaždé vytrhlo z místa, kam se prokoukal

> **Proč to je potřeba:** seznam obsahuje i týdny, které už jsou za námi (nedokončený úkol z minulého měsíce v něm zůstává), takže bez posunu uživatel přistane na nejstarší rozdělané práci a k dnešku se musí prorolovat.

## Non-funkcionální požadavky

- Jeden REST dotaz, žádné probouzení actorů (ADR-015)
- Obrazovka je read-only — z projekce se nikdy nezapisuje
- Cesta `/moje-prace`, mimo `ProjectWorkspace` (nepatří žádnému projektu)
