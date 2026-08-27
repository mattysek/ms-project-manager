# ADR-012: Statická analýza, formátování a rozpočty na složitost

## Status
Přijato

## Kontext

Projekt dosud **neměl žádný lint ani formátovač** — jediným ověřením byl `tsc`. Výsledkem je kód, který se vymkl kontrole co do velikosti a tvaru. Měření současného stavu (`src/`, 14 183 řádků):

| Metrika | Hodnota |
|---|---|
| Kód v souborech > 400 řádků | **84 %** (12 008 ř.) |
| Funkce > 100 řádků | **21** |
| Nejdelší komponenta | `SeznamView` — **1 533 řádků v jedné funkci** |
| Nejvíc props | `Header` — **21 props** |
| Nálezy Biome (výchozí + naše pravidla) | **338** |
| Soubory vyžadující přeformátování | 24 z 34 |

Migrací přibývá druhý jazyk (F#) a s ním riziko, že tentýž problém vznikne znovu — tentokrát v kódu, který drží autoritativní stav celé aplikace.

Zároveň bude většinu kódu psát agentní tým. Prozaická instrukce v promptu („piš krátké funkce") je slabý nástroj — driftuje v dlouhých sezeních a nedá se ověřit. Potřebujeme **deterministickou, strojově ověřitelnou** hranici.

## Rozhodnutí

### TypeScript — Biome 2.5.7

Jeden Rust binárník, lint i formátovač, řádově milisekundy na celý `src/`. Rychlost je podstatná, protože nástroj má později běžet i v editační smyčce agenta.

| Pravidlo | Limit |
|---|---|
| `complexity/noExcessiveLinesPerFunction` | 60 řádků (bez prázdných) |
| `complexity/useMaxParams` | 4 |
| `complexity/noExcessiveCognitiveComplexity` | 15 |
| `style/noNestedTernary` | zakázáno |

Plus `recommended` sada (a11y, correctness, security).

**Severita je zatím `warn`, ne `error`.** Při 338 nálezech by `error` znamenal, že build je červený od prvního dne a nikdo mu nevěří. Přepnutí na `error` je akceptační kritérium PRD-07.

### F# — FSharpLint 0.27.0

Konfigurace v `fsharplint.json`, odvozená z výchozí konfigurace nástroje. Zapnuli jsme pravidla velikosti a složitosti, která jsou v defaultu vypnutá:

| Pravidlo | ID | Default | Náš limit |
|---|---|---|---|
| `maxLinesInFunction` | FL0025 | vypnuto (100) | **60** |
| `maxLinesInMember` | — | vypnuto (100) | **60** |
| `maxLinesInValue` | — | vypnuto (100) | **80** |
| `maxLinesInModule` | FL0029 | vypnuto (1000) | **400** |
| `maxLinesInFile` | FL0062 | vypnuto (1000) | **500** |
| `maxNumberOfFunctionParameters` | FL0052 | vypnuto (5) | **4** |
| `maxNumberOfItemsInTuple` | — | vypnuto (4) | 4 |
| `maxNumberOfBooleanOperatorsInCondition` | — | vypnuto (4) | 4 |
| `cyclomaticComplexity` | FL0071 | vypnuto (40) | **20** |
| `nestedStatements` | FL0015 | vypnuto (8) | **5** |

**Pozor na past v konfiguraci:** FSharpLint s částečnou konfigurací **vypne všechna neuvedená pravidla**. Ověřeno experimentálně — konfigurace se dvěma pravidly hlásí `97 rules (2 enabled, 95 disabled)`, čímž tiše zmizí 23 defaultně zapnutých pravidel (konvence pojmenování, `failwith` antipatterny, `uselessBinding`…). Proto je `fsharplint.json` odvozený z **úplné** výchozí konfigurace, ne psaný od nuly. Naše konfigurace hlásí `52 enabled`.

**Proč `cyclomaticComplexity` 20 a ne 15:** `match` v F# přirozeně zvyšuje cyklomatickou složitost, aniž by kód byl těžko pochopitelný. 20 propustí dispatch přes doménové slice, ale zastaví jeden moloch obsluhující všech ~40 command typů. Výchozích 40 je pro tento účel bezzubých.

### F# — Fantomas 7.0.5

Formátování se neřeší v code review ani v promptu. Konfigurace žije v `.editorconfig` (Fantomas ho čte nativně), jediný zdroj pravdy, `./build/build.sh format` srovná strom.

### F# — warnings as errors

`Directory.Build.props`: `TreatWarningsAsErrors=true`, `WarningLevel=5`, plus varování, která F# defaultně mlčí:

- `--warnon:1182` — nepoužitá proměnná (obdoba `noUnusedLocals` v `tsconfig`)
- `--warnon:3390` — špatně formovaný XML doc
- `--warnon:3517` — implicitní převod způsobující kopii struktury

**Nejcennější důsledek:** `FS0025` (neúplný pattern match) se stává **chybou**. Přidání nového `ProjectCommand` bez obsloužení ve všech reducerech shodí build, místo aby tiše propadlo za běhu a projevilo se až jako ztracená uživatelská změna. Pro architekturu postavenou na exhaustivním matchování commandů je to podstatná bezpečnostní síť.

Únik pro lokální iteraci: `dotnet build -p:TreatWarningsAsErrors=false`.

### Spouštění

Vše v kontejnerech, konzistentně s ADR-011:

```
./build/build.sh lint      # Biome + FSharpLint
./build/build.sh format    # Biome format + Fantomas (přepisuje soubory)
```

Tooling je pinnutý v `.config/dotnet-tools.json` (Fantomas 7.0.5, FSharpLint 0.27.0) a v `package.json` (Biome ^2.5.7).

## Alternativy

### ESLint místo Biome
- **Pro:** bohatší ekosystém pravidel, `max-lines`, `max-depth`, které Biome nemá
- **Proti:** znatelně pomalejší na velkých souborech, konfigurace přes několik balíčků a plugin pro TS
- **Zamítnuto:** Biome pokrývá vše, co jsme chtěli vynucovat, a rychlost je předpoklad pro budoucí nasazení do editační smyčky. Chybějící pravidla (délka souboru) lze doplnit triviálním skriptem.

### Žádný lint, spolehnout se na code review
- **Proti:** současný stav je přímým důsledkem tohoto přístupu; u agentního týmu navíc neškáluje
- **Zamítnuto**

### Zapnout limity rovnou jako `error`
- **Proti:** 338 nálezů = build červený od začátku; tým si zvykne ho ignorovat, čímž nástroj ztratí veškerou hodnotu
- **Zamítnuto ve prospěch** postupu `warn` → PRD-07 → `error`

### Ratchet mechanismus (baseline per soubor, zákaz zhoršení)
- **Pro:** umožnil by zapnout `error` okamžitě a vynutit postupné zlepšování
- **Odloženo:** dává smysl, ale Fáze 2 většinu dotčených souborů stejně přepisuje. Zavádět ratchet nad kódem, který za chvíli zanikne, je zbytečná režie. Vrátit se k tomu, pokud PRD-07 nedoběhne do konce.

## Důsledky

**Pozitivní**
- Limity velikosti a složitosti jsou strojově ověřitelné, ne otázka názoru v review
- Formátování přestává být téma — Fantomas i Biome mají poslední slovo
- Neúplný pattern match nad commandy je build error, ne runtime bug
- Agent dostává deterministickou zpětnou vazbu místo prozaické instrukce

**Negativní**
- 338 existujících nálezů je dluh, který někdo musí splatit (PRD-07)
- `TreatWarningsAsErrors` občas zdrží při experimentování — proto dokumentovaný únik
- Přeformátování celého `src/` Biomem vytvoří jeden velký diff; má proběhnout jako **samostatný commit** před refaktoringem, ne smíchané s ním

**Otevřené**
- Vynucování počtu props u React komponent nemá vestavěné pravidlo (`useMaxParams` destrukturovaný props objekt nevidí). `Header` s 21 props je přitom nejsilnější signál špatné dekompozice v celé codebase. Chtělo by to ~30řádkový vlastní check.
- Zapojení linteru do editační smyčky agenta (`PostToolUse` hook) je vědomě odloženo — viz „harness" v poznámkách k PRD-07.
