# MS Project Manager

Nástroj pro kapacitní plánování a řízení projektu pro tým do 15 lidí. Běží on-premise jako Windows Service, data zůstávají uvnitř firmy.

Umí harmonogram (Gantt), kapacity a alokace po týdnech, úkoly, milníky s checklistem, rizika a příležitosti, znalostní bázi, osobní TODO s opakujícími se připomínkami, rychlé poznámky a obousměrnou synchronizaci s Azure DevOps. Práce je **v reálném čase sdílená** — změna jednoho člena se ostatním projeví okamžitě, a při výpadku sítě se rozpracované změny odešlou po obnovení spojení.

Aplikace je celá **v češtině**, včetně identifikátorů a komentářů v kódu.

## Struktura

```
build/            build skript a dvě vlastní kontroly (pokrytí scénářů, shoda protokolu)
docs/             adr/ — architektonická rozhodnutí, prd/ — zadání, features/ — Gherkin scénáře
src/client/       frontend: React 18 + TypeScript + Vite
src/server/       backend: F# + ASP.NET Core (.NET 10) + SignalR + SQLite
```

Backend je rozdělený na čtyři projekty: `MSProjectManager.Persistence` (entity a `DbContext`), `MSProjectManager.Migrations` (jediný C# projekt v repu — EF neumí generovat migrace pro F#, viz [ADR-013](docs/adr/ADR-013-ef-migrations-in-fsharp.md)), `MSProjectManager.Server` a testy.

Konfigurace nástrojů patří k té straně, kterou konfiguruje — `package.json`, `biome.json` a `tsconfig` jsou v `src/client/`, `MSProjectManager.slnx`, `Directory.Build.props` a `fsharplint.json` v `src/server/`. V kořeni je jen to sdílené.

## Build a testy

Vše běží **v podman kontejnerech**, takže lokálně není potřeba Node ani .NET SDK. Závislosti žijí v pojmenovaných volumech mimo repo.

```bash
./build/build.sh all         # frontend + backend
./build/build.sh test        # shoda protokolu + Vitest + dotnet test + pokrytí scénářů
./build/build.sh lint        # Biome (TS) + FSharpLint (F#)
./build/build.sh format      # Biome + Fantomas, přepisuje soubory
./build/build.sh publish     # self-contained publish pro Windows VM (win-x64)
./build/build.sh migration X # vygeneruje EF migraci X
```

**Nespouštěj dva cíle najednou.** Každý montuje repo do kontejneru a píše do stejných `obj/` a `bin/`; souběh vyrábí falešné chyby. Podrobnosti a další nástrahy jsou v [CLAUDE.md](CLAUDE.md).

Pro vývoj s lokálním Node:

```bash
cd src/client && npm install && npm run dev
```

## Co je „hotovo"

Definicí hotového jsou Gherkin scénáře v `docs/features/` — aktuálně **255 scénářů**, každý navázaný na konkrétní test značkou `// @scenario:`. Kontrola `./build/build.sh scenarios` spadne, když scénář nemá test nebo značka ukazuje na scénář, který už neexistuje.

## Dokumentace

- [`docs/prd/PRD-00-system-overview.md`](docs/prd/PRD-00-system-overview.md) — přehled systému, začni tady
- [`docs/adr/`](docs/adr/) — 13 architektonických rozhodnutí; jsou **závazná**
- [`CLAUDE.md`](CLAUDE.md) — pracovní pokyny a nástrahy, na které se dá narazit

## Licence

Interní nástroj, nešířený.
