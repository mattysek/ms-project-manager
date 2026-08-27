/// Autorizace commandů podle role v projektu (ADR-006, FR-ROLE-01).
///
/// Toto je bezpečnostní vrstva; UI `PermissionGate` je jen UX. PM smí vše,
/// omezení se tedy formulují výhradně pro roli Dev. Vlastnictví entity se
/// určuje shodou `userId` s id osoby (`Person.Id`, `Task.P`) — tak to
/// předpokládá i příklad v ADR-006.
module MSProjectManager.Domain.Authorization

open MSProjectManager.Domain.Types
open MSProjectManager.Domain.State
open MSProjectManager.Domain.Patches
open MSProjectManager.Domain.Commands
open MSProjectManager.Domain.Ownership

let private denied (what: string) = Error $"Nedostatečná oprávnění: {what}"

let private pmOnly (what: string) = denied $"pouze PM může {what}"

let private allowed = Ok()

/// Nepřiřazený úkol (backlog) smí Dev přidat, přiřadit ho smí jen na osobu,
/// která je namapovaná na jeho účet.
let private canAddTask (state: AppState) (userId: string) (task: Task) =
    System.String.IsNullOrEmpty task.P || ownsAssignment state userId task.P

/// Patch úkolu nesmí Devovi přeřadit úkol na někoho jiného.
let private keepsOwnership (state: AppState) (userId: string) (fields: TaskFields) =
    match fields.P with
    | Some person -> ownsAssignment state userId person
    | None -> true

let private authorizeTask (state: AppState) (user: UserContext) (command: TaskCommand) =
    match command with
    | AddTask task when not (canAddTask state user.UserId task) ->
        denied "Dev může přidat úkol jen do backlogu nebo sobě"
    | UpdateTask(taskId, _) when not (ownsTask state user.UserId taskId) -> denied "Dev může editovat jen vlastní úkoly"
    | UpdateTask(_, fields) when not (keepsOwnership state user.UserId fields) -> pmOnly "přeřadit úkol na jinou osobu"
    | MoveTask(taskId, _, _) when not (ownsTask state user.UserId taskId) ->
        denied "Dev může přesouvat jen vlastní úkoly"
    | UpdateProgress(taskId, _) when not (ownsTask state user.UserId taskId) ->
        denied "Dev může měnit progress jen u vlastních úkolů"
    | DeleteTask _ -> pmOnly "mazat úkoly"
    | AddTask _
    | UpdateTask _
    | MoveTask _
    | UpdateProgress _ -> allowed

let private authorizePeople (state: AppState) (user: UserContext) (command: PeopleCommand) =
    match command with
    | AddPerson _
    | UpdatePerson _
    | DeletePerson _ -> pmOnly "spravovat osoby v projektu"
    | UpdateAlloc(personId, _, _) when not (ownsPerson state user.UserId personId) ->
        denied "Dev může editovat pouze vlastní alokaci"
    | UpdateAlloc _ -> allowed

let private authorizeProjectMeta (command: ProjectMetaCommand) =
    match command with
    | UpdateProject _ -> pmOnly "editovat metadata projektu"
    | SetMilestones _ -> pmOnly "spravovat milníky"
    | SetCats _ -> pmOnly "spravovat kategorie"
    | SetRoles _ -> pmOnly "spravovat role"
    // Odškrtávání položek checklistu milníku má Dev podle FR-ROLE-01 R/W.
    | UpdateMilestoneChecklist _ -> allowed

let private authorizeRisk (command: RiskCommand) =
    match command with
    | AddRisk _
    | UpdateRisk _
    | DeleteRisk _ -> pmOnly "spravovat rizika"
    | AddOpportunity _
    | UpdateOpportunity _
    | DeleteOpportunity _ -> pmOnly "spravovat příležitosti"

/// Smazat přílohu smí jen PM; poznámku k příloze smí Dev editovat jen u té,
/// kterou sám nahrál.
let private authorizeFile (state: AppState) (user: UserContext) (command: FileCommand) =
    let uploadedBySelf fileId =
        match state.Files |> List.tryFind (fun file -> file.Id = fileId) with
        | Some file -> file.AddedBy = user.UserId
        | None -> true

    match command with
    | DeleteFile _ -> pmOnly "mazat přílohy"
    | UpdateFileNote(fileId, _) when not (uploadedBySelf fileId) ->
        denied "Dev může editovat poznámku jen u vlastních příloh"
    | AddFile _
    | UpdateFileNote _ -> allowed

/// ADO Sync je podle PRD-03 a PRD-06 celý PM-only; Dev smí jen číst sync log,
/// což není command. UI konfiguraci Devovi navíc neukazuje (FR-ROLE-04), ale
/// autoritativní je tahle kontrola.
let private authorizeAdo (command: AdoCommand) =
    match command with
    | AdoSaveConfig _
    | AdoSavePat _
    | AdoDeletePat -> denied "ADO konfigurace je pouze pro PM"
    | AdoTestConnection -> pmOnly "ověřovat připojení k ADO"
    | AdoRunSync -> pmOnly "spustit ADO synchronizaci"
    | AdoAcknowledgeChange _
    | AdoIgnoreGap _
    | AdoIgnoreUnlinkedTask _
    | AdoAcceptFromAdo _
    | AdoPushAssignee _
    | AdoPushState _
    | AdoPushDescription _
    | AdoCreateWorkItem _
    | AdoAddGapToPlan _
    | AdoLinkGapToTask _ -> pmOnly "pracovat s výsledky ADO synchronizace"

let private authorizeSession (command: SessionCommand) =
    match command with
    | FullStateImport _ -> pmOnly "importovat projekt"
    | UpdatePresence _
    | Undo
    | Redo -> allowed

/// Ověří, že uživatel smí command provést. PM má plný přístup, u Dev platí
/// matice z FR-ROLE-01.
let authorizeCommand (state: AppState) (user: UserContext) (command: ProjectCommand) : Result<unit, string> =
    match user.Role, command with
    | Pm, _ -> allowed
    | Dev, TaskCmd taskCommand -> authorizeTask state user taskCommand
    | Dev, PeopleCmd peopleCommand -> authorizePeople state user peopleCommand
    | Dev, ProjectMetaCmd metaCommand -> authorizeProjectMeta metaCommand
    | Dev, RiskCmd riskCommand -> authorizeRisk riskCommand
    | Dev, FileCmd fileCommand -> authorizeFile state user fileCommand
    | Dev, AdoCmd adoCommand -> authorizeAdo adoCommand
    | Dev, SessionCmd sessionCommand -> authorizeSession sessionCommand
    // KB stránky i osobní TODO a připomínky má Dev podle FR-ROLE-01 R/W.
    | Dev, KnowledgeCmd _
    | Dev, PersonalCmd _ -> allowed
