# ADR-006: Role systém per projekt

## Status
Přijato

## Kontext

Projektový tým se skládá z Project Managera a vývojářů. PM spravuje celý projekt, vývojáři pracují primárně se svými úkoly a vlastní kapacitou. Je nutné definovat systém oprávnění, který reflektuje tuto realitu a zároveň je dostatečně jednoduchý na implementaci a pochopení.

## Rozhodnutí

**Dva role per projekt: `pm` a `dev`. Permissions jsou enforcovány v `ProjectActor` (server-side).**

### Permission matrix

| Funkcionalita | PM | Dev |
|---|---|---|
| **Projekt metadata** (název, data, rozpočet) | R/W | R |
| **Milníky** (přidat, přesunout, checklist) | R/W | R |
| **Changelog / Meeting log** | R/W | R |
| **Poznámky k projektu** | R/W | R |
| **Všechny úkoly** (číst, přesouvat, editovat) | R/W | R |
| **Vlastní úkoly** (přiřazené k uživateli) | R/W | R/W |
| **Progress vlastního úkolu** | R/W | R/W |
| **Přidání/smazání úkolu** | R/W | jen přidání do backlogu |
| **Správa kategorií** | R/W | R |
| **Kapacita — všechny osoby** | R/W | R |
| **Kapacita — vlastní alokace** | R/W | R/W |
| **Správa osob** (přidat, smazat, role) | R/W | — |
| **Správa rolí** (AR, BE, FE…) | R/W | R |
| **Rizika a příležitosti** | R/W | R |
| **ADO Sync konfigurace** | R/W | — |
| **ADO Sync spuštění** | R/W | — |
| **ADO Sync log** (číst) | R/W | R |
| **Soubory** (číst, stáhnout) | R/W | R |
| **Soubory** (uploadovat) | R/W | R/W |
| **Soubory** (smazat) | R/W | — |
| **TODO / Reminders** (vlastní) | R/W | R/W |
| **KB stránky** | R/W | R/W |
| **Quick Notes** (vlastní) | R/W | R/W |
| **Správa členů projektu** | R/W | — |

### Enforcement

Permissions jsou **primárně enforcovány v `ProjectActor`** při zpracování commandu:

```fsharp
let authorizeCommand (userId: string) (role: ProjectRole) (cmd: ProjectCommand) : Result<unit, string> =
    match cmd, role with
    | UpdateProject _, Dev -> Error "Nedostatečná oprávnění: pouze PM může editovat metadata projektu"
    | DeleteTask _, Dev -> Error "Nedostatečná oprávnění: pouze PM může mazat úkoly"
    | UpdateAlloc(personId, _, _), Dev when personId <> userId -> Error "Dev může editovat pouze vlastní alokaci"
    | AdoConfig _, Dev -> Error "Nedostatečná oprávnění: ADO konfigurace je pouze pro PM"
    | _ -> Ok ()
```

UI **skrývá nebo disabluje** prvky pro akce bez oprávnění — ale toto je pouze UX vrstva, ne bezpečnostní vrstva.

## Alternativy

### RBAC s více rolemi (např. Observer, Contributor, Editor, Admin)
- **Pro:** granulárnost
- **Proti:** pro tým do 15 lidí je to overengineering; složitější permission management UI; reálná potřeba je jasná: PM vs. vývojáři

### ACL per entita (per-task permissions)
- **Pro:** maximální granularita (každý úkol má vlastníka)
- **Proti:** velmi složitá správa, UI by byl nepřehledný, neodpovídá pracovnímu stylu PM týmů

### Žádné role (všichni mají plný přístup)
- **Pro:** triviální implementace
- **Proti:** vývojáři mohou omylem smazat cizí úkoly, změnit projekt data, nebo spustit ADO sync s cizím PAT

### Application-level role (ne per-projekt)
- **Pro:** jednodušší datový model
- **Proti:** uživatel může být PM na jednom projektu a Dev na jiném — per-projekt role je správný model

## Důsledky

**Pozitivní:**
- Jednoduchý model odpovídá reálnému use case — PM a vývojáři mají jasně definované zodpovědnosti
- Server-side enforcement znamená, že klient nemůže obejít oprávnění
- Permission check v actoru je synchronní a levný — žádný DB round-trip

**Negativní:**
- Dev nemůže přidávat úkoly přímo na osobu — musí je přidat do backlogu a PM je přiřadí (nebo PM udělí výjimku). Toto může být vnímáno jako omezující — lze zvážit uvolnění v budoucí verzi.
- Při změně role člena (PM → Dev nebo Dev → PM) musí server invalidovat případná oprávnění v aktivních sessions

**Implementační poznámky:**
- `ProjectActorRegistry.GetActor(projectId)` vrací actor; před voláním `actor.Post(Command)` se načte `ProjectRole` uživatele z `project_members` tabulky (cachováno v `UserSessionActor`)
- UI wrapper `<PermissionGate role="pm"><Button>...</Button></PermissionGate>` disabluje/skrývá prvky na základě role z kontextu

## Doplněk — „vlastní" znamená co? Mapování osoby na účet

Ukázka `authorizeCommand` výše porovnává `personId <> userId`, čímž mlčky ztotožňuje **osobu v projektu** s **uživatelským účtem**. To jsou ale dvě různé entity:

- `Person` je entita projektu — má `name`, `role` (AR/BE/FE), `color`, `weekAlloc`. Vzniká v Kapacitě a nemusí jí odpovídat žádný účet (externista, neobsazená pozice, osoba která do nástroje nechodí).
- `AppUser` je účet v `AspNetUsers`, členství drží `project_members`.

`role-permissions.feature` to ukazuje přímo: alokaci mění účet `"petra.kolarova"` u osoby `"Petra Kolářová"`. Bez mapování nelze scénář „Dev může editovat vlastní alokaci" splnit, aniž by se `Person.id` zneužilo jako user id.

**Rozhodnutí:** `Person` dostává pole `userId : string | null` — odkaz na `AspNetUsers.Id`.

- `null` = osoba bez účtu (externista, neobsazená role). Nikdo ji jako „vlastní" nemá; editovat ji smí jen PM.
- Vlastnictví se vyhodnocuje `person.userId = ctx.userId`, nikdy `person.id = ctx.userId`.
- **Vlastnictví úkolu** je odvozené: úkol patří uživateli, právě když `Task.p` ukazuje na osobu, jejíž `userId` se rovná uživateli. Úkol v backlogu (`p` prázdné) nepatří nikomu.
- Mapování nastavuje PM ve správě osob; jedna osoba = nejvýš jeden účet a naopak.

Stejný vzor už v doméně existuje pro ADO (`ADOMemberMapping.plannerId → adoIdentity`), takže nezavádí nový koncept.

**Důsledek pro migraci dat:** existující projekty mají osoby bez `userId`. Po importu je namapuje PM ručně; do té doby jsou pro Dev uživatele read-only, což je bezpečné výchozí chování.


---

## Doplněk: projekt musí mít dosažitelného PM

**Status:** přijato 2026-08-17

Pravidlo „projekt musí mít alespoň jednoho PM" se vynucovalo při odebrání člena
a při změně role. **Deaktivace účtu ho ale obcházela.**

Důsledek byl trvalý: projekt zůstal s PM, který se nepřihlásí, a protože Admin
podle PRD-00 nemá projekt-level oprávnění a členem projektu není, nešlo už
doplnit jiného. Projekt osiřel bez cesty ven.

Deaktivace proto kontroluje `Members.projectsWhereSolePm` a odmítne se s hláškou,
která dotčené projekty vyjmenuje. Správný postup je přiřadit druhého PM a teprve
pak účet deaktivovat.

Pravidlo je tedy: *projekt musí mít alespoň jednoho PM, který se umí přihlásit.*


---

## Doplněk: mapování osoby na účet muselo být opravdu dosažitelné

**Status:** přijato 2026-08-20

Doplněk „vlastní znamená co?" výše končí větou „Mapování nastavuje PM ve správě
osob". Ta věta se nikdy neimplementovala. `Person.userId` existoval v obou
jazycích, `PersonFields.UserId` uměl patch, autorizace na něm stála — a v UI
nebylo jediné místo, kde ho nastavit. `usePeopleEditing.addPerson` zakládal
osobu s `userId: null` a `updatePerson` uměl jen `name`, `role`, `color`.

Důsledek: **role Dev byla fakticky read-only.** Dev nesměl upravit žádný úkol
(`ownsTask` nikdy neplatilo), přesunout pruh v Ganttu, změnit vlastní alokaci
ani si přiřadit úkol, který sám založil. Fungovalo mu jen to, co s osobami
nesouvisí — osobní TODO, připomínky, KB a Quick Notes.

Testy to nezachytily, protože všechny ověřovaly, že **zákaz platí**, a ten
platil správně. Nikdo neověřoval, že povolení je dosažitelné. To je poučení
obecnější než tenhle bug: u každého pravidla typu „X smí jen svoje" musí
existovat i test, který se do stavu „tohle je moje" nejdřív dostane.

Doplňují se dvě pravidla, která původní doplněk neřešil:

- **Jeden účet nejvýš u jedné osoby v projektu.** Vynucuje reducer, ne UI —
  dva lidé „vlastnící" tytéž úkoly by z autorizace udělaly nesmysl. Opačný směr
  (jedna osoba = nejvýš jeden účet) plyne z typu, `UserId` není seznam.
- **Odebrání člena z projektu vazbu ruší.** Jinak by osoba zůstala navázaná na
  účet, který do projektu už nesmí, a po jeho vrácení by mu tiše vrátila práva
  k úkolům, o kterých mezitím nic neví. Dělá to REST vrstva u `removeMember`
  přes `ProjectStore`, protože členství není součástí `AppState`.
