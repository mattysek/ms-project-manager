/// Commandy klient → server (ADR-004, `src/types/protocol.ts`).
///
/// Na wire je command **plochý** objekt s diskriminátorem v poli `type`:
/// `{ "type": "add_task", "task": { ... } }`. Vnitřně je ale rozdělený do
/// skupinových DU podle doménových slices — jinak by `applyCommand` i
/// `authorizeCommand` byly jeden `match` přes čtyřicet větví a rozbily by
/// limit cyklomatické složitosti z ADR-012. Ploché JSON zpět na vnořené DU
/// překládá `ProjectCommandConverter` v modulu Json; názvy na wire vznikají
/// snake_case politikou z názvů case (`AddTask` → `add_task`).
module MSProjectManager.Domain.Commands

open MSProjectManager.Domain.Types
open MSProjectManager.Domain.Ado
open MSProjectManager.Domain.State
open MSProjectManager.Domain.Patches

/// Úkoly.
type TaskCommand =
    | AddTask of task: Task
    | UpdateTask of taskId: string * fields: TaskFields
    | MoveTask of taskId: string * s: int * e: int
    | UpdateProgress of taskId: string * progress: int
    | DeleteTask of taskId: string

/// Osoby a jejich kapacita.
type PeopleCommand =
    | AddPerson of person: Person
    | UpdatePerson of personId: string * fields: PersonFields
    | DeletePerson of personId: string
    | UpdateAlloc of personId: string * weekIdx: int * pct: float

/// Metadata projektu, milníky, kategorie a role.
type ProjectMetaCommand =
    | UpdateProject of fields: ProjectFields
    | SetMilestones of milestones: Milestone list
    | UpdateMilestoneChecklist of milestoneId: string * checkItems: MilestoneCheckItem list
    | SetCats of cats: Categories
    | SetRoles of roles: Roles

/// Rizika a příležitosti.
type RiskCommand =
    | AddRisk of risk: Risk
    | UpdateRisk of riskId: string * fields: RiskFields
    | DeleteRisk of riskId: string
    | AddOpportunity of opp: Opportunity
    | UpdateOpportunity of oppId: string * fields: OpportunityFields
    | DeleteOpportunity of oppId: string

/// Znalostní báze.
type KnowledgeCommand =
    | AddKbPage of page: KbPage
    | UpdateKbPage of pageId: string * fields: KbPageFields
    | DeleteKbPage of pageId: string

/// Osobní nástroje — TODO a připomínky.
type PersonalCommand =
    | AddTodo of todo: TodoItem
    | UpdateTodo of todoId: string * fields: TodoFields
    | DeleteTodo of todoId: string
    | AddReminder of reminder: RecurringReminder
    | UpdateReminder of reminderId: string * fields: ReminderFields
    | DeleteReminder of reminderId: string

/// Přílohy. Obsah souboru chodí přes REST (ADR-010); tyhle commandy vytváří
/// server sám po uploadu, aby metadata prošla stejnou cestou jako každá jiná
/// změna stavu.
type FileCommand =
    | AddFile of file: FileRef
    | UpdateFileNote of fileId: string * note: string
    | DeleteFile of fileId: string

/// Azure DevOps (ADR-008, PRD-06). Kromě `AdoSaveConfig` nemění žádný z nich
/// stav projektu přímo — reducer je propustí a obsluhu (volání ADO API,
/// šifrovaný PAT, snapshot) provede `AdoBridge` mimo mailbox actoru, aby
/// pomalý command neblokoval frontu (ADR-002, „Negativní").
type AdoCommand =
    // Konfigurace a PAT (FR-ADO-01 až 03)
    | AdoSaveConfig of config: AdoConfig
    | AdoSavePat of pat: string
    | AdoDeletePat
    | AdoTestConnection
    /// Dotaz na per-user stav PATu (FR-ADO-02). PAT se ke klientovi nikdy
    /// nevrací, takže po reloadu nemá jak vědět, že nějaký uložený je —
    /// bez tohohle dotazu tvrdí „PAT není nastaven" a nepustí ani sync.
    | AdoRequestStatus
    // Synchronizace (FR-ADO-04)
    | AdoRunSync
    // Rozhodnutí uživatele nad výsledkem (FR-ADO-06, FR-ADO-09)
    | AdoAcknowledgeChange of wiId: int * changeType: WiChangeType * acknowledged: bool
    | AdoIgnoreGap of wiId: int * ignored: bool
    | AdoIgnoreUnlinkedTask of taskId: string * ignored: bool
    /// Převzetí hodnoty z ADO do plánovače. `text` nese sloučený popis při
    /// merge; `None` znamená „vezmi popis z ADO tak, jak je".
    | AdoAcceptFromAdo of wiId: int * taskId: string * field: AdoAcceptField * text: string option
    // Zápis do ADO (FR-ADO-07, FR-ADO-08)
    | AdoPushAssignee of wiId: int * taskId: string
    | AdoPushState of wiId: int * taskId: string * state: string
    /// `alsoPlanner` = merge obousměrně: popis se uloží i na úkol.
    | AdoPushDescription of wiId: int * taskId: string * text: string * alsoPlanner: bool
    | AdoCreateWorkItem of taskId: string * draft: AdoWorkItemDraft
    // Coverage gap → plán (FR-ADO-09)
    | AdoAddGapToPlan of wiId: int * task: Task
    | AdoLinkGapToTask of wiId: int * taskId: string

/// Session a import. `Undo`/`Redo` se podle ADR-007 řeší na klientovi
/// (posílá reverzní command), server je přijímá jen aby protokol odpovídal
/// ADR-004 — a odmítne je.
type SessionCommand =
    | FullStateImport of state: ClientAppState
    | UpdatePresence of view: string
    | Undo
    | Redo

/// Command tak, jak ho zpracovává actor. Obal je čistě interní, na wire se
/// neprojeví.
type ProjectCommand =
    | TaskCmd of TaskCommand
    | PeopleCmd of PeopleCommand
    | ProjectMetaCmd of ProjectMetaCommand
    | RiskCmd of RiskCommand
    | KnowledgeCmd of KnowledgeCommand
    | PersonalCmd of PersonalCommand
    | FileCmd of FileCommand
    | AdoCmd of AdoCommand
    | SessionCmd of SessionCommand
