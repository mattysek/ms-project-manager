/// Reducer doménového slice „osoby a kapacita".
module MSProjectManager.Domain.Reducers.People

open MSProjectManager.Domain.Types
open MSProjectManager.Domain.State
open MSProjectManager.Domain.Patches
open MSProjectManager.Domain.Commands
open MSProjectManager.Domain.Diffs
open MSProjectManager.Common.Collections

let private personId (person: Person) = person.Id

let private withPerson (state: AppState) (id: string) (change: Person -> Result<AppState * ProjectDiff list, string>) =
    match tryFindById personId id state.People with
    | Some person -> change person
    | None -> Error $"Osoba {id} v projektu neexistuje"

/// Má už účet přiřazenou jinou osobu? (ADR-006, doplněk o mapování.)
///
/// Dva lidé „vlastnící" tytéž úkoly by z autorizace udělaly nesmysl: `ownsTask`
/// by platilo pro oba. Hlídá to reducer, ne UI — přes wire se dá poslat
/// cokoli. Prázdný/`null` účet je „osoba bez účtu" a smí ho mít kdokoli.
let private accountTakenBy (state: AppState) (exceptPersonId: string) (userId: string | null) =
    match userId with
    | null -> None
    | owner when System.String.IsNullOrEmpty owner -> None
    | owner ->
        state.People
        |> List.tryFind (fun person -> person.Id <> exceptPersonId && person.UserId = owner)

let private accountConflict (state: AppState) (exceptPersonId: string) (userId: string | null) =
    match accountTakenBy state exceptPersonId userId with
    | Some owner -> Error $"Účet už je v tomto projektu přiřazen osobě {owner.Name}"
    | None -> Ok()

let private add (state: AppState) (person: Person) =
    if containsId personId person.Id state.People then
        Error $"Osoba {person.Id} v projektu už existuje"
    else
        accountConflict state person.Id person.UserId
        |> Result.map (fun () ->
            { state with
                People = append person state.People
            },
            [ PersonAdded person ]
        )

let private update (state: AppState) (id: string) (fields: PersonFields) =
    withPerson
        state
        id
        (fun _ ->
            // `UserId` je vnořeně volitelný: chybějící klíč nechává vazbu být,
            // `null` ji ruší, hodnota ji nastavuje. Kontrolovat má smysl jen
            // ten třetí případ.
            let requested = defaultArg fields.UserId null

            accountConflict state id requested
            |> Result.map (fun () ->
                let people = updateById personId id (mergePerson fields) state.People
                { state with People = people }, [ PersonUpdated(id, fields) ]
            )
        )

/// Smazání osoby přesune její úkoly do backlogu (`kapacita.feature`, scénář
/// „Smazání osoby (PM)").
///
/// Dělá to server, ne klient: kdyby to byla dodatečná dávka commandů z
/// prohlížeče, stačilo by ji nedoručit — zavřený tab, výpadek sítě — a úkoly
/// by navždy ukazovaly na neexistující osobu. V actoru je to jedna atomická
/// změna.
let private toBacklog (ownerId: string) (task: Task) =
    if task.P = ownerId then { task with P = "" } else task

/// Diff za každý osiřelý úkol — ostatní klienti se o přeřazení musí dozvědět,
/// ne si ho domýšlet ze smazání osoby.
let private backlogDiffs (ownerId: string) (tasks: Task list) =
    tasks
    |> List.filter (fun task -> task.P = ownerId)
    |> List.map (fun task -> TaskUpdated(task.Id, { emptyTaskFields with P = Some "" }))

let private delete (state: AppState) (id: string) =
    withPerson
        state
        id
        (fun _ ->
            Ok(
                { state with
                    People = removeById personId id state.People
                    Tasks = state.Tasks |> List.map (toBacklog id)
                },
                PersonDeleted id :: backlogDiffs id state.Tasks
            )
        )

/// Alokace je procento kapacity v daném týdnu. Kratší `WeekAlloc` doplníme
/// stovkami — stejnou výchozí hodnotu používá i frontend.
let private setAlloc (weekIdx: int) (pct: float) (person: Person) =
    let length = max (List.length person.WeekAlloc) (weekIdx + 1)

    let alloc =
        List.init
            length
            (fun index ->
                if index = weekIdx then
                    pct
                else
                    match List.tryItem index person.WeekAlloc with
                    | Some value -> value
                    | None -> 100.0
            )

    { person with WeekAlloc = alloc }

let private updateAlloc (state: AppState) (id: string) (allocation: int * float) =
    let weekIdx, pct = allocation

    if weekIdx < 0 then
        Error $"Neplatný index týdne: {weekIdx}"
    elif pct < 0.0 || pct > 100.0 then
        Error $"Alokace musí být v rozsahu 0–100 procent, přišlo {pct}"
    else
        withPerson
            state
            id
            (fun _ ->
                let people = updateById personId id (setAlloc weekIdx pct) state.People
                Ok({ state with People = people }, [ AllocUpdated(id, weekIdx, pct) ])
            )

/// Aplikuje command nad osobami.
let apply (state: AppState) (command: PeopleCommand) : Result<AppState * ProjectDiff list, string> =
    match command with
    | AddPerson person -> add state person
    | UpdatePerson(id, fields) -> update state id fields
    | DeletePerson id -> delete state id
    | UpdateAlloc(id, weekIdx, pct) -> updateAlloc state id (weekIdx, pct)
