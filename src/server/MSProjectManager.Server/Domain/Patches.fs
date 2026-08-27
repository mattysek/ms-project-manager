/// Částečné aktualizace entit — F# protějšek `Partial(T)` z TypeScriptu.
///
/// Pole typu `option` jsou na wire volitelná (chybějící klíč je `None`,
/// viz `WithSkippableOptionFields` v modulu Json). `None` tedy znamená
/// „neměň", nikoli „nastav na null" — hodnotu proto nejde commandem vymazat,
/// jen přepsat jinou hodnotou.
module MSProjectManager.Domain.Patches

open MSProjectManager.Domain.Types

/// Částečná změna metadat projektu.
type ProjectFields =
    {
        Name: string option
        StartDate: string option
        EndDate: string option
        Budget: float option
        Milestones: Milestone list option
        Notes: string option
        Changelog: ChangelogEntry list option
    }

/// Částečná změna úkolu.
type TaskFields =
    {
        P: string option
        Name: string option
        Cat: string option
        S: int option
        E: int option
        Md: float option
        Progress: int option
        Desc: string option
        Links: TaskLink list option
        AdoNotes: AdoNote list option
        /// Razítko autorství — plní ho reducer, ne klient (viz `Task`).
        UpdatedBy: string option
        UpdatedAt: string option
    }

/// Částečná změna osoby. `UserId` je vnořeně volitelný: chybějící klíč
/// znamená „neměň vazbu na účet", `null` znamená „zruš ji".
type PersonFields =
    {
        UserId: (string | null) option
        Name: string option
        Role: string option
        Color: string option
        WeekAlloc: float list option
    }

/// Částečná změna rizika.
type RiskFields =
    {
        Sev: Severity option
        Who: string option
        Title: string option
        Detail: string option
    }

/// Částečná změna příležitosti.
type OpportunityFields =
    {
        Title: string option
        Detail: string option
    }

/// Částečná změna KB stránky.
type KbPageFields =
    {
        Title: string option
        Content: string option
        UpdatedAt: string option
        Tags: string list option
    }

/// Částečná změna TODO položky.
type TodoFields =
    {
        Title: string option
        Completed: bool option
    }

/// Částečná změna připomínky.
type ReminderFields =
    {
        Title: string option
        Description: string option
        StartDate: string option
        Recurrence: RecurrenceType option
        LastCompleted: string option
        Enabled: bool option
    }

/// Prázdný patch úkolu — základ pro diffy odvozené ze specializovaných commandů.
let emptyTaskFields: TaskFields =
    {
        P = None
        Name = None
        Cat = None
        S = None
        E = None
        Md = None
        Progress = None
        Desc = None
        Links = None
        AdoNotes = None
        UpdatedBy = None
        UpdatedAt = None
    }

/// Prázdný patch metadat projektu.
let emptyProjectFields: ProjectFields =
    {
        Name = None
        StartDate = None
        EndDate = None
        Budget = None
        Milestones = None
        Notes = None
        Changelog = None
    }

/// Prázdný patch osoby.
let emptyPersonFields: PersonFields =
    {
        UserId = None
        Name = None
        Role = None
        Color = None
        WeekAlloc = None
    }

/// Aplikuje patch na metadata projektu.
let mergeProject (fields: ProjectFields) (project: Project) : Project =
    { project with
        Name = defaultArg fields.Name project.Name
        StartDate = defaultArg fields.StartDate project.StartDate
        EndDate = defaultArg fields.EndDate project.EndDate
        Budget = defaultArg fields.Budget project.Budget
        Milestones = defaultArg fields.Milestones project.Milestones
        Notes = defaultArg fields.Notes project.Notes
        Changelog = defaultArg fields.Changelog project.Changelog
    }

/// Aplikuje patch na úkol.
let mergeTask (fields: TaskFields) (task: Task) : Task =
    { task with
        P = defaultArg fields.P task.P
        Name = defaultArg fields.Name task.Name
        Cat = defaultArg fields.Cat task.Cat
        S = defaultArg fields.S task.S
        E = defaultArg fields.E task.E
        Md = defaultArg fields.Md task.Md
        Progress = defaultArg fields.Progress task.Progress
        Desc = defaultArg fields.Desc task.Desc
        Links = defaultArg fields.Links task.Links
        AdoNotes =
            if fields.AdoNotes.IsSome then
                fields.AdoNotes
            else
                task.AdoNotes
        UpdatedBy =
            if fields.UpdatedBy.IsSome then
                fields.UpdatedBy
            else
                task.UpdatedBy
        UpdatedAt =
            if fields.UpdatedAt.IsSome then
                fields.UpdatedAt
            else
                task.UpdatedAt
    }

/// Aplikuje patch na osobu.
let mergePerson (fields: PersonFields) (person: Person) : Person =
    { person with
        UserId = defaultArg fields.UserId person.UserId
        Name = defaultArg fields.Name person.Name
        Role = defaultArg fields.Role person.Role
        Color = defaultArg fields.Color person.Color
        WeekAlloc = defaultArg fields.WeekAlloc person.WeekAlloc
    }

/// Aplikuje patch na riziko.
let mergeRisk (fields: RiskFields) (risk: Risk) : Risk =
    { risk with
        Sev = defaultArg fields.Sev risk.Sev
        Who = defaultArg fields.Who risk.Who
        Title = defaultArg fields.Title risk.Title
        Detail = defaultArg fields.Detail risk.Detail
    }

/// Aplikuje patch na příležitost.
let mergeOpportunity (fields: OpportunityFields) (opp: Opportunity) : Opportunity =
    { opp with
        Title = defaultArg fields.Title opp.Title
        Detail = defaultArg fields.Detail opp.Detail
    }

/// Aplikuje patch na KB stránku.
let mergeKbPage (fields: KbPageFields) (page: KbPage) : KbPage =
    { page with
        Title = defaultArg fields.Title page.Title
        Content = defaultArg fields.Content page.Content
        UpdatedAt = defaultArg fields.UpdatedAt page.UpdatedAt
        Tags = if fields.Tags.IsSome then fields.Tags else page.Tags
    }

/// Aplikuje patch na TODO položku.
let mergeTodo (fields: TodoFields) (todo: TodoItem) : TodoItem =
    { todo with
        Title = defaultArg fields.Title todo.Title
        Completed = defaultArg fields.Completed todo.Completed
    }

/// Aplikuje patch na připomínku.
let mergeReminder (fields: ReminderFields) (reminder: RecurringReminder) : RecurringReminder =
    { reminder with
        Title = defaultArg fields.Title reminder.Title
        Description = defaultArg fields.Description reminder.Description
        StartDate = defaultArg fields.StartDate reminder.StartDate
        Recurrence = defaultArg fields.Recurrence reminder.Recurrence
        LastCompleted =
            if fields.LastCompleted.IsSome then
                fields.LastCompleted
            else
                reminder.LastCompleted
        Enabled = defaultArg fields.Enabled reminder.Enabled
    }
