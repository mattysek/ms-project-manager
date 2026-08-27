/// Autoritativní stav projektu na serveru a kontext uživatele, který na něj sahá.
///
/// `AppState` odpovídá `AppState` v `src/App.tsx` (resp. `src/state/appState.ts`)
/// rozšířenému o `Files` — metadata příloh, jejichž obsah je v tabulce `files`
/// (ADR-010). Držitelem hodnoty je `ProjectActor`, mutuje se výhradně přes
/// reducer.
module MSProjectManager.Domain.State

open System.Text.Json.Serialization
open MSProjectManager.Domain.Types
open MSProjectManager.Domain.Ado

/// Role uživatele v projektu (ADR-006). Aplikační role Admin je mimo projekt
/// a řeší se v Identity, ne tady.
[<JsonFSharpConverter(JsonUnionEncoding.UnwrapFieldlessTags)>]
type ProjectRole =
    | [<JsonName "pm">] Pm
    | [<JsonName "dev">] Dev

/// Kdo command poslal. Actor si roli dohledá v `project_members`, klient ji
/// neposílá — nikdy nesmí být zdrojem pravdy o oprávněních.
type UserContext =
    {
        UserId: string
        DisplayName: string
        Role: ProjectRole
    }

/// Kdo je online a na jakém view (FR-COLLAB-04). Není součástí `AppState` —
/// presence je efemérní, drží ji actor, nepersistuje se.
type PresenceEntry =
    {
        UserId: string
        DisplayName: string
        View: string
        Color: string
    }

/// Kompletní stav projektu tak, jak se persistuje do `projects.state_json`.
type AppState =
    {
        Project: Project
        People: Person list
        Tasks: Task list
        Cats: Categories
        Roles: Roles
        Risks: Risk list
        Opps: Opportunity list
        Files: FileRef list
        /// Připomínky klíčované uživatelem — soukromé, nikdy se nebroadcastují.
        RemindersByUser: Map<string, RecurringReminder list>
        /// TODO klíčované uživatelem — viz scénář „TODO jsou soukromé per-user".
        TodosByUser: Map<string, TodoItem list>
        KbPages: KbPage list
        AdoConfig: AdoConfig option
        AdoSyncLog: AdoSyncLogEntry list
    }

/// Stav tak, jak ho vidí klient: `todos` a `reminders` jsou ploché seznamy
/// vlastních položek. Pole odpovídají tvaru `full_state` z ADR-004.
type ClientAppState =
    {
        Project: Project
        People: Person list
        Tasks: Task list
        Cats: Categories
        Roles: Roles
        Risks: Risk list
        Opps: Opportunity list
        Files: FileRef list
        Reminders: RecurringReminder list
        Todos: TodoItem list
        KbPages: KbPage list
        AdoConfig: AdoConfig option
        AdoSyncLog: AdoSyncLogEntry list
    }

/// Výchozí kategorie — zrcadlí `INIT_CATS` v `src/constants/index.ts`.
let initialCats: Categories =
    Map.ofList
        [
            "obecne",
            {
                Bg = "#111827"
                Bd = "#4b5563"
                Tx = "#94a3b8"
                Label = "Obecné"
            }
        ]

/// Výchozí role — zrcadlí `INIT_ROLES` v `src/constants/index.ts`.
let initialRoles: Roles =
    Map.ofList
        [
            "AR", { Label = "Solution Architect" }
            "BE", { Label = "Back-end Developer" }
            "FE", { Label = "Front-end Developer" }
            "TE", { Label = "Tester" }
        ]

/// Výchozí metadata projektu — zrcadlí `INIT_PROJECT`.
let initialProject (name: string) : Project =
    {
        Name = name
        StartDate = ""
        EndDate = ""
        Budget = 100.0
        Milestones = []
        Notes = ""
        Changelog = []
    }

/// Projekce stavu pro jednoho uživatele — **jediná** povolená cesta, kterou
/// stav odchází ke klientovi (ADR-004). Vybere z per-user map jen položky
/// volajícího; cizí TODO a připomínky se za tuhle hranici nedostanou.
let forUser (userId: string) (state: AppState) : ClientAppState =
    {
        Project = state.Project
        People = state.People
        Tasks = state.Tasks
        Cats = state.Cats
        Roles = state.Roles
        Risks = state.Risks
        Opps = state.Opps
        Files = state.Files
        Reminders = state.RemindersByUser |> Map.tryFind userId |> Option.defaultValue []
        Todos = state.TodosByUser |> Map.tryFind userId |> Option.defaultValue []
        KbPages = state.KbPages
        AdoConfig = state.AdoConfig
        AdoSyncLog = state.AdoSyncLog
    }

/// Vlastní TODO uživatele.
let todosOf (userId: string) (state: AppState) =
    state.TodosByUser |> Map.tryFind userId |> Option.defaultValue []

/// Vlastní připomínky uživatele.
let remindersOf (userId: string) (state: AppState) =
    state.RemindersByUser |> Map.tryFind userId |> Option.defaultValue []

/// Prázdný stav nově založeného projektu.
let initial (name: string) : AppState =
    {
        Project = initialProject name
        People = []
        Tasks = []
        Cats = initialCats
        Roles = initialRoles
        Risks = []
        Opps = []
        Files = []
        RemindersByUser = Map.empty
        TodosByUser = Map.empty
        KbPages = []
        AdoConfig = None
        AdoSyncLog = []
    }
