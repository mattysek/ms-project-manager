# ADR-011: Build frontendu, cache strategie a kontejnerizovaný build

## Status
Přijato

## Kontext

Původní aplikace se distribuovala jako **jeden soubor**. `vite-plugin-singlefile` inlinoval veškerý JS, CSS i fonty do `dist/index.html` (~2 395 kB) — aplikace se spouštěla prostým otevřením souboru v prohlížeči, bez serveru a bez externích assetů.

Migrací na multi-user architekturu (ADR-001) tento model přestává dávat smysl:

- Aplikaci servíruje ASP.NET Core z `wwwroot` — server pro assety existuje
- Inlinovaný bundle **nelze cachovat po částech**. Jakákoliv změna aplikačního kódu invaliduje celý soubor a klient stahuje znovu všech 2,4 MB včetně fontů a knihoven, které se nezměnily
- Aplikace se používá denně a nasazuje se často — opakované stahování celého bundlu je zbytečná zátěž i na intranetu
- Fonty (IBM Plex Mono/Sans, ~28 souborů) se prakticky nikdy nemění, ale byly součástí každého downloadu

Zároveň tým nechce mít lokálně nainstalovaný kompletní toolchain (`.NET SDK` na vývojářských strojích chybí) a potřebuje reprodukovatelný build nezávislý na verzi Node.js na konkrétním stroji.

## Rozhodnutí

### 1. Zrušení `vite-plugin-singlefile`

Frontend se builduje standardním Vite outputem: `index.html` + `assets/` s hashovanými názvy souborů (`index-CAmQVI6u.js`, `react-CKGW1AWR.js`, …).

### 2. Rozdělení do cacheovatelných chunků

Těžké knihovny jdou přes `manualChunks` do vlastních souborů, aby se změna aplikačního kódu nedotkla jejich cache:

| Chunk | Obsah | Velikost (gzip) |
|---|---|---|
| `index` | aplikační kód | 197 kB (49 kB) |
| `react` | react, react-dom | 141 kB (45 kB) |
| `xlsx` | export do Excelu | 424 kB (142 kB) |
| `docx` | mammoth (preview Wordu) | 493 kB (129 kB) |
| `canvas` | html2canvas (PNG export) | 201 kB (48 kB) |
| `markdown` | marked, turndown | 53 kB (17 kB) |

Změna v `src/` nově invaliduje pouze chunk `index` (~49 kB gzip) místo celých 2,4 MB.

### 3. Cache hlavičky

Server rozlišuje dva režimy podle toho, jestli má soubor hash v názvu:

| Soubor | `Cache-Control` | Důvod |
|---|---|---|
| `index.html` | `no-cache, no-store, must-revalidate` | Nemá hash v názvu; musí se vždy načíst čerstvý, jinak by klient odkazoval na staré assety |
| `assets/*` | `public, max-age=31536000, immutable` | Hash v názvu = obsah se nikdy nezmění; při změně vznikne nový název |

Implementace v ASP.NET Core:

```fsharp
app.UseStaticFiles(
    StaticFileOptions(
        OnPrepareResponse = fun ctx ->
            let headers = ctx.Context.Response.Headers
            if ctx.File.Name = "index.html" then
                headers.CacheControl <- "no-cache, no-store, must-revalidate"
            else
                headers.CacheControl <- "public, max-age=31536000, immutable"
    )
) |> ignore

// SPA fallback — všechny nesouborové cesty vrací index.html
app.MapFallbackToFile("index.html") |> ignore
```

### 4. Build output do `wwwroot`

Build frontendu kopíruje `dist/` do `src/server/MSProjectManager.Server/wwwroot/`. Adresář `wwwroot` je **vlastněný buildem** — jeho obsah (`index.html`, `assets/`) se při každém buildu přepisuje a nepatří do verzování.

### 5. Kontejnerizovaný build přes podman

Oba stacky se buildují v kontejnerech, nic není potřeba instalovat lokálně:

| Stack | Image | Verze |
|---|---|---|
| Frontend | `docker.io/library/node:24-bookworm-slim` | Node 24 LTS (24.19.0) |
| Backend | `mcr.microsoft.com/dotnet/sdk:10.0` | .NET 10 LTS (10.0.302) |

Pinuje se **major verze**, patch se aktualizuje sám. Obojí je k datu rozhodnutí aktuální LTS. Node 26 se stane LTS v říjnu 2026 — bump je vědomé rozhodnutí, ne automatika, aby build nezměnil chování sám od sebe.

Závislosti (`node_modules`, NuGet cache) žijí v pojmenovaných podman volumes, ne v repozitáři — nekolidují s případnou lokální instalací Node.js a nezanášejí pracovní strom.

Orchestruje `build/build.sh` s příkazy `web`, `server`, `all`, `publish`, `clean`.

Deployment na Windows VM: `./build/build.sh publish` vytvoří framework-dependent `win-x64` publish včetně zbuildovaného frontendu ve `wwwroot`.

## Alternativy

### Zachovat `vite-plugin-singlefile`
- **Pro:** triviální deployment (jeden soubor), zachovaná možnost spustit aplikaci bez serveru
- **Proti:** žádné cachování — 2,4 MB při každém načtení; fonty a knihovny se stahují opakovaně bez důvodu; ztrácí se hlavní výhoda toho, že server nově existuje
- **Zamítnuto:** hlavní argument pro singlefile (žádný server) migrací zanikl

### Dva build targety (`build` + `build:single`)
- **Pro:** zachovala by se možnost vyexportovat samostatný offline artefakt
- **Proti:** dvojí konfigurace a dvojí testovací povrch kvůli scénáři, který v multi-user nasazení nemá odběratele — aplikace bez serveru nemá přístup k datům ani k autentizaci
- **Zamítnuto:** offline režim řeší ADR-009 (command queue + cache), ne samostatný HTML soubor

### Build lokálně bez kontejnerů
- **Pro:** rychlejší, jednodušší
- **Proti:** vyžaduje `.NET SDK` a konkrétní verzi Node.js na každém stroji; build závisí na lokálním prostředí
- **Zamítnuto:** tým `.NET SDK` lokálně nemá a nechce instalovat

### Multi-stage Containerfile produkující image
- **Pro:** plně reprodukovatelný artefakt, vhodné pro CI
- **Proti:** cílem je Windows Service, ne kontejner; pro lokální iteraci pomalejší (build image při každé změně)
- **Odloženo:** dává smysl přidat, až vznikne CI pipeline

## Důsledky

**Pozitivní**
- Opakované načtení aplikace stahuje jen změněný chunk (~49 kB gzip) místo 2,4 MB
- Fonty a knihovny se cachují prakticky napořád (`immutable`, 1 rok)
- Build nevyžaduje lokální toolchain — stačí podman
- Reprodukovatelný build napříč stroji

**Negativní**
- Aplikaci už nelze spustit prostým otevřením souboru — vyžaduje běžící server
- `wwwroot` musí být v `.gitignore`, jinak se build artefakty dostanou do repozitáře
- Přibyl krok navíc mezi buildem frontendu a spuštěním serveru (kopie do `wwwroot`)

**Otevřené — doporučený follow-up**

`manualChunks` řeší **cachování**, ne **odložené načítání**. Chunky `xlsx`, `docx` a `canvas` (dohromady ~320 kB gzip) jsou stále součástí initial load, přestože je potřebuje jen menšina akcí:

- `xlsx` — export do Excelu v `SeznamView`
- `mammoth` — preview Wordu v `SouboryView`
- `html2canvas` — PNG export v `GanttView`

Převedení na dynamický `import()` v místě použití by zmenšilo initial load zhruba na polovinu. Jde o změnu aplikačního kódu, proto je mimo rozsah tohoto ADR.
