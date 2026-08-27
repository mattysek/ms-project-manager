# ADR-013: EF Core migrace v F# projektu

## Status
Přijato — **hlavní rozhodnutí bylo 2026-08-17 nahrazeno**, viz doplněk na konci

## Kontext

ADR-001 volí F# jako primární jazyk backendu a EF Core + SQLite jako persistenci. PRD-00 (Fáze 1) předpokládá „SQLite databáze s EF Core migracemi".

Při implementaci se ukázalo, že **EF Core 10 neumí migrace pro F# vygenerovat**. `dotnet ef migrations add` skončí:

```
The project language 'F#' isn't supported by the built-in IMigrationsCodeGenerator.
```

Není to konfigurační chyba ani mezera v našem nastavení — `IMigrationsCodeGenerator` má v boxu jen C# implementaci a F# scaffolding nikdy nebyl dodán. Komunitní generátory pro F# existují, ale nedrží krok s verzemi EF Core.

Migrace přitom potřebujeme: databáze na Windows VM je dlouhoživá a schéma se bude vyvíjet. `EnsureCreated()` je pro produkci nepoužitelný — neumí evolvovat existující databázi.

## Rozhodnutí

**Migrace se píší ručně v F# jako `migrationBuilder.Sql(...)` s DDL odvozeným z EF modelu.**

- `AppDbContext` zůstává jediným zdrojem pravdy o schématu (mapování, klíče, FK, indexy).
- DDL pro novou migraci se získá z modelu (`Database.GenerateCreateScript()` pro první migraci; pro navazující ruční diff proti předchozímu stavu) a vloží se do `Up`/`Down` jako `migrationBuilder.Sql`.
- Migrace se aplikují za běhu přes `Database.Migrate()` při startu služby.
- **Neexistuje `ModelSnapshot`.** EF tedy neumí zjistit, co se v modelu změnilo — diff proti předchozí verzi je ruční práce autora migrace.

### Co to znamená pro každodenní práci

Změna schématu má tři kroky, ne dva:

1. Upravit entitu a mapování v `AppDbContext`.
2. Napsat migraci s explicitním `ALTER TABLE` / `CREATE TABLE` (SQLite má omezené `ALTER TABLE` — u složitějších změn je nutný vzor „nová tabulka → `INSERT SELECT` → `DROP` → `RENAME`").
3. **Test**, který migraci aplikuje na prázdnou databázi a ověří, že výsledné schéma odpovídá modelu.

Krok 3 je povinný — nahrazuje bezpečnostní síť, kterou by jinak dělal `ModelSnapshot`. Bez něj se model a migrace rozejdou tiše a projeví se to až za běhu.

## Alternativy

### Samostatný C# projekt jen pro `DbContext` a migrace
- **Pro:** plný `dotnet ef` scaffolding, `ModelSnapshot`, automatický diff — tedy přesně to, o co přicházíme
- **Proti:** `AppDbContext` by se musel vytáhnout z F# projektu do sdílené C# knihovny (jinak cyklická reference), čímž se doménové entity rozdělí mezi dva jazyky. ADR-001 volí F# jako primární jazyk backendu právě proto, aby doména žila v jednom idiomu.
- **Zamítnuto** pro tento rozsah, ale je to **cesta ven**, pokud se ruční migrace ukážou jako brzda. Rozhodovací kritérium: až budou migrace s netriviálním `ALTER TABLE` častější než jednou za pár měsíců.

### `EnsureCreated()` bez migrací
- **Pro:** nulová práce, dokud se schéma nemění
- **Proti:** neumí evolvovat existující databázi; první změna schématu po nasazení znamená ruční SQL na produkci nebo ztrátu dat
- **Zamítnuto**

### Migrační nástroj mimo EF (DbUp, Evolve, FluentMigrator)
- **Pro:** čisté SQL migrace, jazykově neutrální, verzované soubory
- **Proti:** druhý nástroj vedle EF Core, který schéma stejně popisuje v `AppDbContext`; dva zdroje pravdy místo jednoho. FluentMigrator navíc znovu zavádí C#.
- **Zamítnuto** — ruční `migrationBuilder.Sql` dává totéž bez další závislosti.

## Důsledky

**Pozitivní**
- Doména i persistence zůstávají celé v F#, konzistentně s ADR-001
- Migrace jsou čitelné SQL — u SQLite, kde je `ALTER TABLE` omezené, je explicitní DDL stejně srozumitelnější než vygenerovaný C# kód
- Žádná další závislost

**Negativní**
- Ruční diff modelu je práce navíc a **nejpravděpodobnější zdroj chyby** při změně schématu
- Chybí `ModelSnapshot`, takže EF nezachytí rozpor mezi modelem a migracemi — hlídá to test, ne nástroj
- Vývojář, který zná `dotnet ef migrations add`, tady narazí; postup patří do onboardingu

**Neutrální**
- Poprvé se to projeví až u druhé migrace; první je celá vygenerovaná z modelu

---

## Doplněk: migrace se generují, jen bydlí v C# projektu

**Status:** přijato 2026-08-17 — **nahrazuje rozhodnutí výše**

Původní rozhodnutí („migrace se píší ručně jako `migrationBuilder.Sql`")
vycházelo z toho, že jedinou alternativou je přestěhovat celý model do C#, což
by doménu rozdělilo mezi dva jazyky. Ta alternativa ale nebyla jediná.

EF Core generátor se řídí jazykem **migračního** projektu, ne jazykem projektu,
ve kterém žije `DbContext`. Stačí tedy do C# přesunout migrace, ne model.

### Rozhodnutí

Tři projekty místo jednoho:

```
MSProjectManager.Persistence (F#)   entity, AppDbContext, SQLite pragmy, DesignTime
        ↑                    ↑
MSProjectManager.Migrations (C#)    generované migrace + ModelSnapshot
        ↑                           |
MSProjectManager.Server (F#) ───────┘
```

Server referencuje migrační projekt kvůli běhu (`Database.Migrate()` musí
assembly najít), v F# kódu se na něj nesahá. Kruh nevzniká, protože
`AppDbContext` je v samostatné knihovně, kterou referencují oba.

`MigrationsAssembly "MSProjectManager.Migrations"` se nastavuje na dvou
místech: v `Services.register` pro běh a v `DesignTime.AppDbContextFactory`
pro nástroje.

Generování zabaluje `./build/build.sh migration <Název>`.

### Ověření

Spike proti skutečnému modelu (F# záznamy s `[<CLIMutable>]`, Identity tabulky,
`HasCheckConstraint`, snake_case sloupce) vygeneroval migraci, jejíž schéma je
proti dosavadní ruční migraci **shodné — 26 objektů, nula rozdílů**. Ruční
migrace byla proto nahrazena vygenerovanou; ponechala si původní id
`20260810120000_InitialCreate`, aby databáze, které ji už aplikovaly,
nezkoušely tabulky vytvořit znovu.

### Co se tím získalo

- `dotnet ef migrations add` funguje;
- `ModelSnapshot` existuje, takže EF umí diff modelu proti předchozímu stavu —
  odpadá nejpravděpodobnější zdroj chyby, který původní ADR pojmenovávalo;
- entity i `DbContext` zůstávají v F#, konzistentně s ADR-001.

### Co zůstává v platnosti

Test, který migrace aplikuje na prázdnou databázi a porovná výsledné schéma
s modelem (`PersistenceTests`), **se neruší**. `ModelSnapshot` hlídá, že migrace
odpovídá modelu v době generování; test hlídá, že to celé skutečně proběhne
proti reálné SQLite včetně pragem a cizích klíčů.

### Cena

Jeden C# projekt v jinak F# repozitáři a o dva projekty víc v solution. Obsah
`Migrations/` je generovaný a needituje se ručně; FSharpLint ho přeskakuje
a `Directory.Build.props` v něm vypíná `TreatWarningsAsErrors`, protože
generovaný kód naše warningy nesplňuje.
