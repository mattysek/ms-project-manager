/// Reducer doménového slice „metadata projektu, milníky, kategorie, role".
module MSProjectManager.Domain.Reducers.ProjectMeta

open MSProjectManager.Domain.Types
open MSProjectManager.Domain.State
open MSProjectManager.Domain.Patches
open MSProjectManager.Domain.Commands
open MSProjectManager.Domain.Diffs
open MSProjectManager.Common.Collections

module Weeks = MSProjectManager.Domain.Weeks

let private milestoneId (milestone: Milestone) = milestone.Id

/// Ořízne úkol do nového počtu týdnů. Vrací i diff, pokud se něco změnilo —
/// klient nemá jak přepočet uhodnout.
///
/// `S`/`E` jsou 1-based (ADR-014); `maxWeek = 0` znamená projekt bez platných
/// datumů, kde se ořezávat nedá — úkoly by spadly na týden 0.
let private clampTask (maxWeek: int) (task: Task) =
    let start = if maxWeek = 0 then task.S else min task.S maxWeek
    let finish = if maxWeek = 0 then task.E else min task.E maxWeek

    if start = task.S && finish = task.E then
        task, None
    else
        let fields =
            { emptyTaskFields with
                S = Some start
                E = Some finish
            }

        { task with S = start; E = finish }, Some(TaskUpdated(task.Id, fields))

/// Natáhne nebo zkrátí alokaci na nový počet týdnů; chybějící týdny jsou
/// 100 %, stejně jako v `changeDates` na klientovi. Vlastní dorovnání je ve
/// `Weeks.fitAlloc`, protože stejné pravidlo potřebuje i import (`Session`).
let private resizeAlloc (weekCount: int) (person: Person) =
    let alloc = Weeks.fitAlloc weekCount person.WeekAlloc

    if alloc = person.WeekAlloc then
        person, None
    else
        let fields =
            { emptyPersonFields with
                WeekAlloc = Some alloc
            }

        { person with WeekAlloc = alloc }, Some(PersonUpdated(person.Id, fields))

/// Změna datumů projektu mění počet týdnů, takže musí přepočítat úkoly
/// i alokace (ADR-004, „Změna datumů projektu přepočítává stav na serveru").
let private recalculate (state: AppState) =
    let weekCount = Weeks.count state.Project.StartDate state.Project.EndDate
    let maxWeek = Weeks.maxWeek weekCount
    let tasks = state.Tasks |> List.map (clampTask maxWeek)
    let people = state.People |> List.map (resizeAlloc weekCount)

    let diffs = (tasks |> List.choose snd) @ (people |> List.choose snd)

    { state with
        Tasks = tasks |> List.map fst
        People = people |> List.map fst
    },
    diffs

let private datesChanged (fields: ProjectFields) =
    fields.StartDate.IsSome || fields.EndDate.IsSome

let private updateProject (state: AppState) (fields: ProjectFields) =
    let withMeta =
        { state with
            Project = mergeProject fields state.Project
        }

    if datesChanged fields then
        let next, extra = recalculate withMeta
        Ok(next, ProjectUpdated fields :: extra)
    else
        Ok(withMeta, [ ProjectUpdated fields ])

let private setMilestones (state: AppState) (milestones: Milestone list) =
    let project =
        { state.Project with
            Milestones = milestones
        }

    Ok({ state with Project = project }, [ MilestonesSet milestones ])

/// Odškrtávání položek checklistu je jediná část milníků, na kterou má podle
/// FR-ROLE-01 právo i Dev — proto samostatný command, ne `set_milestones`.
let private updateChecklist (state: AppState) (id: string) (checkItems: MilestoneCheckItem list) =
    if containsId milestoneId id state.Project.Milestones then
        let milestones =
            updateById
                milestoneId
                id
                (fun milestone ->
                    { milestone with
                        CheckItems = checkItems
                    }
                )
                state.Project.Milestones

        let project =
            { state.Project with
                Milestones = milestones
            }

        Ok({ state with Project = project }, [ MilestoneChecklistUpdated(id, checkItems) ])
    else
        Error $"Milník {id} v projektu neexistuje"

let private setCats (state: AppState) (cats: Categories) =
    if Map.isEmpty cats then
        Error "Projekt musí mít alespoň jednu kategorii"
    else
        Ok({ state with Cats = cats }, [ CatsSet cats ])

let private setRoles (state: AppState) (roles: Roles) =
    Ok({ state with Roles = roles }, [ RolesSet roles ])

/// Aplikuje command nad metadaty projektu.
let apply (state: AppState) (command: ProjectMetaCommand) : Result<AppState * ProjectDiff list, string> =
    match command with
    | UpdateProject fields -> updateProject state fields
    | SetMilestones milestones -> setMilestones state milestones
    | UpdateMilestoneChecklist(id, checkItems) -> updateChecklist state id checkItems
    | SetCats cats -> setCats state cats
    | SetRoles roles -> setRoles state roles
