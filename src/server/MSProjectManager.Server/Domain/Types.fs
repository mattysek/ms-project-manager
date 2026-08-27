/// Doménové typy projektu — zrcadlí `src/types/index.ts` (kontrakt s frontendem).
///
/// Názvy polí jsou v F# PascalCase, na wire se převádějí camelCase politikou
/// (viz modul Json), takže `Md` je `md` a `WeekIndex` je `weekIndex`. Krátká
/// pole úkolu (`P`, `S`, `E`, `Md`, `Cat`) zůstávají krátká i tady;
/// `S`/`E` jsou indexy do pole týdnů, ne datumy.
module MSProjectManager.Domain.Types

open System.Text.Json.Serialization

// ── Projekt a milníky ───────────────────────────────────────────────────────

/// Položka changelogu projektu.
type ChangelogEntry =
    {
        Id: string
        Date: string
        Text: string
    }

/// Položka checklistu milníku.
type MilestoneCheckItem =
    {
        Id: string
        Text: string
        Completed: bool
    }

/// Milník. `WeekIndex` je 0-based index do pole týdnů — na rozdíl od `Task.S`/`E`
/// (1-based), viz ADR-014.
type Milestone =
    {
        Id: string
        Title: string
        WeekIndex: int
        CheckItems: MilestoneCheckItem list
    }

/// Metadata projektu.
type Project =
    {
        Name: string
        StartDate: string
        EndDate: string
        Budget: float
        Milestones: Milestone list
        Notes: string
        Changelog: ChangelogEntry list
    }

// ── Role a osoby ────────────────────────────────────────────────────────────

/// Definice projektové role (AR, BE, FE, TE…).
type RoleDefinition = { Label: string }

/// Keyed record rolí — klíčem je zkratka role.
type Roles = Map<string, RoleDefinition>

/// Osoba v projektu. `WeekAlloc` je alokace v procentech per týden.
///
/// `UserId` je vazba na účet v `AspNetUsers` (ADR-006, doplněk). `null` znamená
/// osobu bez účtu — externistu nebo neobsazenou pozici; ta nepatří nikomu a
/// editovat ji smí jen PM. Vlastnictví se vyhodnocuje vždy přes `UserId`,
/// nikdy přes `Id`.
type Person =
    {
        Id: string
        UserId: string | null
        Name: string
        Role: string
        Color: string
        WeekAlloc: float list
    }

// ── Úkoly ───────────────────────────────────────────────────────────────────

/// Poznámka přenesená z ADO při synchronizaci.
type AdoNote = { Ts: string; Text: string }

/// Odkaz na úkolu (typicky work item v ADO).
type TaskLink =
    {
        Id: string
        Label: string
        Url: string
    }

/// Úkol. `P` je id osoby, `Md` člověkodny, `Cat` klíč kategorie.
///
/// `S`/`E` jsou **1-based** čísla týdnů (ADR-014): `1` je první týden projektu,
/// `Weeks.count` poslední. `Milestone.WeekIndex` je naopak 0-based — rozdíl je
/// vědomý, viz ADR-014.
///
/// `UpdatedBy`/`UpdatedAt` razítkuje reducer při každé mutaci — klient je
/// neposílá a poslat nemůže, protože se vždycky přepíšou. Není to audit log
/// (ten je v PRD-00 mimo rozsah), jen odpověď na „kdo to naposledy sáhl".
type Task =
    {
        Id: string
        P: string
        Name: string
        Cat: string
        S: int
        E: int
        Md: float
        Progress: int
        Desc: string
        Links: TaskLink list
        AdoNotes: AdoNote list option
        UpdatedBy: string option
        UpdatedAt: string option
    }

// ── Kategorie ───────────────────────────────────────────────────────────────

/// Barevná definice kategorie úkolů.
type Category =
    {
        Bg: string
        Bd: string
        Tx: string
        Label: string
    }

/// Keyed record kategorií — klíčem je klíč kategorie.
type Categories = Map<string, Category>

// ── Rizika a příležitosti ───────────────────────────────────────────────────

/// Závažnost rizika.
[<JsonFSharpConverter(JsonUnionEncoding.UnwrapFieldlessTags)>]
type Severity =
    | [<JsonName "high">] High
    | [<JsonName "med">] Med
    | [<JsonName "low">] Low

/// Riziko projektu.
type Risk =
    {
        Id: string
        Sev: Severity
        Who: string
        Title: string
        Detail: string
    }

/// Příležitost projektu.
type Opportunity =
    {
        Id: string
        Title: string
        Detail: string
    }

// ── Soubory ─────────────────────────────────────────────────────────────────

/// Metadata přílohy. Obsah souboru žije v tabulce `files`, ne ve stavu
/// projektu — viz ADR-010; proto tu (na rozdíl od single-user verze)
/// není pole `data`.
type FileRef =
    {
        Id: string
        Name: string
        MimeType: string
        Size: int64
        AddedAt: string
        AddedBy: string
        Note: string
    }

// ── TODO a připomínky ───────────────────────────────────────────────────────

/// Perioda opakování připomínky.
[<JsonFSharpConverter(JsonUnionEncoding.UnwrapFieldlessTags)>]
type RecurrenceType =
    | [<JsonName "weekly">] Weekly
    | [<JsonName "biweekly">] Biweekly
    | [<JsonName "monthly">] Monthly

/// Opakující se připomínka.
type RecurringReminder =
    {
        Id: string
        Title: string
        Description: string
        StartDate: string
        Recurrence: RecurrenceType
        LastCompleted: string option
        Enabled: bool
    }

/// Položka TODO seznamu.
type TodoItem =
    {
        Id: string
        Title: string
        Completed: bool
        CreatedAt: string
    }

// ── Knowledge base ──────────────────────────────────────────────────────────

/// Stránka znalostní báze (obsah je markdown).
type KbPage =
    {
        Id: string
        Title: string
        Content: string
        CreatedAt: string
        UpdatedAt: string
        /// Volné štítky pro filtrování. Plochý seznam stránek se nad pár
        /// desítkami neudrží a strom je pro znalostní bázi zbytečně tuhý.
        Tags: string list option
    }
