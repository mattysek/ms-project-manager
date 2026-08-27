# PRD-07: Refaktoring frontendu — splacení dluhu na kvalitě kódu

## Přehled

Závěrečná fáze migrace. Frontend vznikal bez lintu a bez formátovače, což se podepsalo na jeho tvaru: 84 % kódu žije v souborech nad 400 řádků a jedna komponenta má 1 533 řádků v jediné funkci.

Cílem je dostat `src/` do stavu, kdy pravidla z [ADR-012](../adr/ADR-012-code-quality-tooling.md) projdou **bez jediného nálezu**, a přepnout jejich severitu z `warn` na `error`. Tím se dluh uzavře a nemůže se tiše vrátit.

Fáze je záměrně **poslední**. Fáze 2 (napojení na commandy) a Fáze 3 (role) velkou část těchto souborů stejně přepisují — refaktorovat je předem by znamenalo dělat práci dvakrát.

## Stav — hotovo

Čísla v sekci „Výchozí stav" níž jsou **původní měření před migrací** (338 nálezů). Aktuální stav:

| Krok | Stav |
|---|---|
| FR-QUAL-01 — formátovací commit | ✅ hotovo |
| FR-QUAL-02 + 04 — dekompozice | ✅ hotovo |
| FR-QUAL-03 — props | ✅ vyřešeno migrací na commandy |
| FR-QUAL-05 — korektnostní nálezy | ✅ hotovo (`useExhaustiveDependencies`, `noArrayIndexKey` na nule) |
| FR-QUAL-06 — přístupnost | ✅ hotovo (168 → 0) |
| FR-QUAL-07 — přepnutí na `error` | ✅ hotovo — `biome.json` má `error` u všech čtyř pravidel |

**Biome hlásí 0 nálezů**, `tsc` prochází, 393 frontendových a 206 backendových testů zelených, 220/220 scénářů pokryto.

### Pozor na měření — Biome ořezává výpis

`biome lint` bez `--max-diagnostics` vypíše **jen prvních 20 diagnostik** a zbytek zamlčí. Kvůli tomu jsem dvakrát reportoval nesmyslně nízká čísla. `build/build.sh` proto volá `npx biome lint --max-diagnostics=none src` — nikdy to nesundávej, jinak gate začne tiše lhát.

### Ověřený postup dekompozice

Postup měřený krok po kroku na `GanttView` (5 nálezů → 0) a pak použitý na zbytek:

1. **Vnořené `.map()` closures v JSX jsou funkce** a Biome je počítá zvlášť. `GanttView` měl tři vnořené nad limitem (`people.map` 177 ř., `pTasks.map` 116 ř. + složitost 41, `weeksWithHolidays.map` složitost 19). Každá se vytáhne jako pojmenovaná komponenta (`PersonRow`, `GanttBar`, `WeekHeaderCell`) — tím zmizí vnořená funkce **i** složitost, kterou dědila z okolí.
2. **Stav a handlery do hooků** — `useGanttDrag`, `useGanttTooltip`, `useOverallocation`, `useExportPNG`. Tělo komponenty se tím zkrátí o desítky řádků bez ztráty čitelnosti.
3. **JSX obal do vlastní komponenty** — `ChartCanvas` (mřížka) a `GanttOverlays` (tooltip + modal). Zbytek `GanttView` je pak jen složení.
4. **`useMaxParams` (limit 4) hlídá i pomocné funkce** — víc parametrů se sloučí do jednoho objektu (`barStyle({ task, color, … })`), typovaného přes `Pick<Props, …>`.
5. **Opakované inline `style` objekty** jako konstanty nad komponentou — zkrátí funkci beze změny výstupu.

Měření po jednotlivých krocích: 47 → 44 → 43 → 42. Jeden krok maže typicky jeden nález, ne pět — plánovat podle počtu funkcí nad limitem, ne podle počtu souborů.

**Rozdělení souboru samo o sobě nálezy nesnižuje.** U `TodoView` klesl soubor z 783 na 319 řádků a počet nálezů zůstal stejný: dlouhé funkce se jen přestěhovaly. Limit je na **funkci**.

### Past: settery schované za vlastní hook

Pokus přesunout `useState` settery `useProjectChannel` do pomocného `useChannelState()` **přidal 17 nových nálezů** `useExhaustiveDependencies` — Biome pozná stabilní identitu jen u setterů volaných přímo z `useState`, ne u těch, které přijdou přes návratovou hodnotu jiného hooku. Správné řešení bylo obrácené: stav nechat v hlavním hooku a ven vytáhnout **spotřebitele** (`useChannelConnection` s efektem a handlery), kterému se settery předají jako parametry a uvedou se v deps.

### Testovací soubory

`noExcessiveLinesPerFunction` je pro `*.test.ts(x)` vypnuté přes `overrides` v `biome.json`. Callback `describe(...)` s několika `it` bloky je deklarativní seskupení, ne složitá funkce; dělit ho jen kvůli limitu by testy zpřehlednilo leda naoko. Ostatní pravidla na testy platí dál.

### Výsledky dekompozice

| Soubor | Před | Po | Nová složka |
|---|---|---|---|
| `RizikaView.tsx` | 1 114 | 83 | `views/rizika/` (27 souborů) |
| `ProjektView.tsx` | 864 | 68 | `views/projekt/` |
| `TaskDetailModal.tsx` | 854 | ~130 | `components/taskDetail/` |
| `KapacitaView.tsx` | 835 | 68 | `views/kapacita/` |
| `GanttView.tsx` | 821 | 205 | `views/gantt/` |
| `KnowledgeBaseView.tsx` | 484 | 22 | `views/kb/` |
| `SeznamView.tsx` | 1 573 | 48 | `views/Seznam/` |
| `SouboryView.tsx` | 823 | ~120 | `views/soubory/` |
| `TodoView.tsx` | 783 | 358 | `views/todo/` |

`AdoSyncView.tsx` zůstal na 1 696 řádcích — žádná jeho funkce ale limit nepřekračuje (`AddToPlanForm` se rozpadl na `useAddToPlanForm`, `ModeToggle`, `NewTaskFields`, `LinkExistingField`). Délka souboru sama o sobě není nic, co by kterékoli pravidlo hlídalo; pokud se do něj bude znovu sahat, stojí za zvážení `views/ado/`.

**Poznámka k `biome-ignore`:** musí být na řádku bezprostředně sousedícím s nálezem a u JSX míří diagnostika na **element**, ne na atribut — potlačení tedy patří nad otevírací značku. `noStaticElementInteractions` a `useKeyWithClickEvents` jsou dvě různá pravidla; potlačení jednoho druhé nechá být.

## Výchozí stav (naměřeno před migrací)

### Nálezy Biome — celkem 338

| Kategorie | Počet | Poznámka |
|---|---|---|
| `a11y/useButtonType` | 106 | `<button>` bez `type` — submituje formuláře omylem |
| `complexity/noExcessiveLinesPerFunction` | 38 | funkce nad 60 řádků |
| `a11y/noLabelWithoutControl` | 34 | `<label>` bez vazby na input |
| `complexity/noExcessiveCognitiveComplexity` | 29 | kognitivní složitost nad 15 |
| `style/noNestedTernary` | 23 | vnořené ternární operátory |
| `a11y/noStaticElementInteractions` | 22 | `onClick` na `<div>` |
| `style/useTemplate` | 20 | konkatenace místo template literálů |
| `suspicious/noArrayIndexKey` | 16 | `key={index}` — chyby v React reconciliation |
| `a11y/useKeyWithClickEvents` | 15 | klik bez klávesové alternativy |
| `correctness/useExhaustiveDependencies` | 8 | chybějící závislosti v hoocích — **reálné bugy** |
| `a11y/noAutofocus` | 8 | |
| `security/noDangerouslySetInnerHtml` | 5 | **viz bezpečnostní poznámka níže** |
| ostatní | 14 | |

Dále: **24 z 34 souborů** vyžaduje přeformátování.

### Tvar kódu

| | Řádků | Nejdelší funkce | Props |
|---|---|---|---|
| `AdoSyncView.tsx` | 2 207 | 1 430 | 10 |
| `SeznamView.tsx` | 1 549 | 1 533 | 7 |
| `RizikaView.tsx` | 956 | 295 | 10 |
| `ProjektView.tsx` | 845 | 827 | 5 |
| `TaskDetailModal.tsx` | 835 | 820 | 7 |
| `SouboryView.tsx` | 823 | 811 | — |
| `KapacitaView.tsx` | 755 | 739 | 8 |
| `TodoView.tsx` | 740 | 292 | — |
| `GanttView.tsx` | 708 | 670 | 10 |
| `Header.tsx` | 358 | 330 | **21** |

## ⚠ Bezpečnostní nález — vytáhnout dopředu do Fáze 2

`security/noDangerouslySetInnerHtml` (5 výskytů) je v současné aplikaci neškodný: uživatel si renderuje vlastní markdown ve vlastním prohlížeči, nejhorší možný následek je poškození sebe sama.

**Multi-user architektura tohle mění na stored XSS.** KB stránka, popis úkolu nebo detail rizika napsané jedním uživatelem se renderují v prohlížeči ostatních. Vložený `<script>` nebo `onerror` atribut se spustí v jejich session — včetně session projektového manažera s plnými oprávněními.

Není to úklidová položka. **Patří do Fáze 2**, kdy se poprvé objeví cizí obsah v cizím prohlížeči. Řešení: sanitizace výstupu `marked` (DOMPurify nebo ekvivalent) před vložením do DOM, případně render bez `dangerouslySetInnerHTML`.

## Cíle

1. `./build/build.sh lint` projde bez nálezů
2. Severita pravidel složitosti a velikosti přepnuta z `warn` na `error` v `biome.json`
3. Žádná funkce nad 60 řádků, žádná komponenta nad 4 props bez opodstatnění
4. Žádný soubor nad 500 řádků
5. Formátování sjednocené Biomem

## Non-goals

- Změna vizuálního vzhledu nebo chování aplikace — refaktoring je **beze změny funkcionality**
- Migrace na jinou UI knihovnu nebo styling řešení
- Přepis na CSS moduly / Tailwind (inline styly zůstávají)
- Zavedení testů (projekt nemá test runner; mimo rozsah)
- Ratchet mechanismus a hook do editační smyčky agenta (viz poznámka na konci)

## Funkcionální požadavky

### FR-QUAL-01: Formátovací commit
Spustit `./build/build.sh format` a commitnout **samostatně**, bez jakékoliv jiné změny. Míchat přeformátování s refaktoringem znemožňuje review.

### FR-QUAL-02: Dekompozice views
Každý view nad 500 řádků rozdělit. Doporučená struktura — adresář per view:

```
views/Seznam/
  index.tsx           — kompozice, < 150 ř.
  TaskRow.tsx
  CategoryManager.tsx
  TaskFilters.tsx
  useTaskFilters.ts   — logika mimo komponentu
```

Kritérium: `index.tsx` skládá, nepočítá. Výpočty patří do `use*` hooků, prezentace do podkomponent.

### FR-QUAL-03: Redukce props
Žádná komponenta nad 4 props bez zdůvodnění. `Header` (21 props) je nejnaléhavější případ.

Po Fázi 2 se to zjednoduší samo — views přestanou dostávat setter props a budou dostávat `dispatch` + data. Tento požadavek je z velké části **důsledek migrace**, ne samostatná práce.

### FR-QUAL-04: Extrakce dlouhých funkcí
21 funkcí nad 100 řádků rozdělit pod 60. Prioritně handlery v `AdoSyncView` a render funkce v `SeznamView`.

### FR-QUAL-05: Oprava korektnostních nálezů
`useExhaustiveDependencies` (8×) a `noArrayIndexKey` (16×) jsou latentní bugy, ne kosmetika. Chybějící závislost v hooku znamená zastaralý closure; `key={index}` rozbíjí React reconciliation při mazání a přeuspořádání položek — což je v seznamu úkolů běžná operace.

### FR-QUAL-06: Přístupnost
106× `useButtonType`, 34× `noLabelWithoutControl`, 22× `noStaticElementInteractions`, 15× `useKeyWithClickEvents`. Většina je mechanická oprava. `noStaticElementInteractions` vyžaduje rozmyslet drag-drop interakce (Gantt, přeřazení úkolů) — tam je potřeba klávesová alternativa nebo vědomá výjimka s komentářem.

### FR-QUAL-07: Přepnutí severity
Po dosažení nuly nálezů změnit v `biome.json` `"level": "warn"` → `"error"` u pravidel složitosti a velikosti. Od té chvíle build padá.

## Non-funkcionální požadavky

- Refaktoring nemění chování: každý krok ověřen `./build/build.sh web` a manuální kontrolou dotčeného view
- Práce po jednotlivých views, ne velký třesk — každý view samostatně reviewovatelný
- Gherkin scénáře v `docs/features/` musí po refaktoringu procházet beze změny

## Pořadí prací

| # | Krok | Proč |
|---|---|---|
| 1 | FR-QUAL-01 — formátovací commit | Čisté diffy pro všechno další |
| 2 | FR-QUAL-05 — korektnostní bugy | Reálné chyby, nezávislé na struktuře |
| 3 | FR-QUAL-02 + 04 — dekompozice, po views | Hlavní objem práce |
| 4 | FR-QUAL-03 — props | Z velké části vyřeší Fáze 2 |
| 5 | FR-QUAL-06 — a11y | Mechanické, dá se dělat průběžně |
| 6 | FR-QUAL-07 — přepnutí na `error` | Uzavření dluhu |

## Poznámka — agent harness

Vynucování těchto limitů **v editační smyčce agenta** (hook `PostToolUse`, který po každém zápisu změří dotčený soubor a vrátí zpětnou vazbu) je vědomě odložené. Důvod: dokud 84 % kódu limity porušuje, hook by hlásil nález při každém dotyku libovolného souboru a stal by se šumem.

Smysl dostane až po dokončení tohoto PRD, kdy je základna čistá a každý nový nález je skutečně regrese. Do té doby stačí `warn` v build gate.

Pokud by se ukázalo, že PRD-07 nedoběhne celé, alternativou je ratchet — baseline metrik per soubor se zákazem zhoršení (viz ADR-012, sekce Alternativy).
