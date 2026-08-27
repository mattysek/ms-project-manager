/// ProjectActor (ADR-002) — sekvenční zpracování, debounced persist,
/// idle timeout. Store je in-memory, takže testy běží v milisekundách.
module MSProjectManager.Tests.ActorTests

open System
open System.Threading
open Xunit
open MSProjectManager.Domain.State
open MSProjectManager.Domain.Commands
open MSProjectManager.Domain.Diffs
open MSProjectManager.Actors.ProjectStore
open MSProjectManager.Actors.ProjectActor
open MSProjectManager.Tests.Fixtures

let private projectId = "p1"

/// In-memory store, který si počítá zápisy.
type private FakeStore(initial: AppState option) =
    let mutable current = initial
    let mutable saves = 0
    member _.Saves = saves
    member _.Current = current

    member _.Store =
        {
            Load = fun _ -> async { return current }
            ArchiveKbPage = fun _ _ -> async { return () }
            Save =
                fun _ state ->
                    async {
                        Interlocked.Increment(&saves) |> ignore
                        current <- Some state
                        return true
                    }
        }

let private options =
    {
        PersistInterval = TimeSpan.FromMilliseconds 50.0
        IdleTimeout = TimeSpan.FromMinutes 15.0
        MaxQueueLength = 1000
    }

let private dependencies (store: FakeStore) (stopped: string -> unit) =
    { ActorDependencies.Basic(store.Store, options) with
        OnStopped = stopped
    }

let private createActor (store: FakeStore) =
    new ProjectActor(projectId, dependencies store ignore)

let private expectDiffs (result: Result<ProjectDiff list, string>) =
    match result with
    | Ok diffs -> diffs
    | Error message -> failwith $"command měl projít, ale skončil chybou: {message}"

/// Počká, dokud podmínka neplatí, nejvýš daný počet milisekund.
let private waitFor (timeoutMs: int) (condition: unit -> bool) =
    let deadline = DateTime.UtcNow.AddMilliseconds(float timeoutMs)

    while not (condition ()) && DateTime.UtcNow < deadline do
        Thread.Sleep 10

    condition ()

[<Fact>]
let ``actor aplikuje command a vrátí diffy`` () =
    let store = FakeStore(Some state)
    use actor = createActor store
    let added = task "t-new" petraPersonId

    let diffs =
        actor.Execute(pm, TaskCmd(AddTask added))
        |> Async.RunSynchronously
        |> expectDiffs

    // Actor razítkuje skutečným časem, takže se porovnává obsah, ne celý záznam.
    match diffs with
    | [ TaskAdded stamped ] ->
        Assert.Equal(added.Id, stamped.Id)
        Assert.Equal(Some pm.DisplayName, stamped.UpdatedBy)
        Assert.True stamped.UpdatedAt.IsSome
    | other -> failwith $"Čekal jsem jeden task_added, přišlo {other}"

[<Fact>]
let ``stav přetrvává mezi commandy`` () =
    let store = FakeStore(Some state)
    use actor = createActor store

    actor.Execute(pm, TaskCmd(AddTask(task "t-new" petraPersonId)))
    |> Async.RunSynchronously
    |> expectDiffs
    |> ignore

    actor.Execute(pm, TaskCmd(UpdateProgress("t-new", 40)))
    |> Async.RunSynchronously
    |> expectDiffs
    |> ignore

    match actor.FullState pm.UserId |> Async.RunSynchronously with
    | Ok snapshot ->
        let updated = snapshot.Tasks |> List.find (fun item -> item.Id = "t-new")
        Assert.Equal(40, updated.Progress)
    | Error message -> failwith message

[<Fact>]
let ``actor odmítne command bez oprávnění a stav nechá být`` () =
    let store = FakeStore(Some state)
    use actor = createActor store

    let result =
        actor.Execute(dev, TaskCmd(DeleteTask "t-api")) |> Async.RunSynchronously

    Assert.Equal(Error "Nedostatečná oprávnění: pouze PM může mazat úkoly", result)

    match actor.FullState dev.UserId |> Async.RunSynchronously with
    | Ok snapshot -> Assert.Equal(2, List.length snapshot.Tasks)
    | Error message -> failwith message

[<Fact>]
let ``full_state je projekce pro konkrétního uživatele`` () =
    let store = FakeStore(Some state)
    use actor = createActor store

    actor.Execute(dev, PersonalCmd(AddTodo(todo "d1")))
    |> Async.RunSynchronously
    |> expectDiffs
    |> ignore

    let forPetra = actor.FullState dev.UserId |> Async.RunSynchronously
    let forJan = actor.FullState pm.UserId |> Async.RunSynchronously

    match forPetra, forJan with
    | Ok petra, Ok jan ->
        Assert.Equal(1, List.length petra.Todos)
        Assert.Empty jan.Todos
    | _ -> failwith "snapshot se nepodařilo načíst"

[<Fact>]
let ``změny se ukládají debounced, ne po každém commandu`` () =
    let store = FakeStore(Some state)
    use actor = createActor store

    for index in 1..5 do
        actor.Execute(pm, TaskCmd(AddTask(task $"t-{index}" "")))
        |> Async.RunSynchronously
        |> expectDiffs
        |> ignore

    Assert.True(waitFor 2000 (fun () -> store.Saves >= 1), "stav se neuložil")
    Assert.True(store.Saves < 5, $"čekal jsem debounce, ale zápisů bylo {store.Saves}")
    // Doříznutí: tick mohl uložit dřív, než doběhly všechny commandy.
    actor.Flush() |> Async.RunSynchronously

    match store.Current with
    | Some saved -> Assert.Equal(7, List.length saved.Tasks)
    | None -> failwith "store nic neuložil"

[<Fact>]
let ``bez změn actor nic neukládá`` () =
    let store = FakeStore(Some state)
    use actor = createActor store
    actor.FullState pm.UserId |> Async.RunSynchronously |> ignore
    Thread.Sleep 200
    Assert.Equal(0, store.Saves)

[<Fact>]
let ``odmítnutý command nezpůsobí zápis`` () =
    let store = FakeStore(Some state)
    use actor = createActor store

    actor.Execute(dev, TaskCmd(DeleteTask "t-api"))
    |> Async.RunSynchronously
    |> ignore

    Thread.Sleep 200
    Assert.Equal(0, store.Saves)

[<Fact>]
let ``Flush uloží okamžitě`` () =
    let store = FakeStore(Some state)
    use actor = createActor store

    actor.Execute(pm, TaskCmd(AddTask(task "t-new" "")))
    |> Async.RunSynchronously
    |> expectDiffs
    |> ignore

    actor.Flush() |> Async.RunSynchronously
    Assert.Equal(1, store.Saves)

[<Fact>]
let ``po idle timeoutu actor uloží stav a skončí`` () =
    let store = FakeStore(Some state)
    let stopped = ref ""

    let deps =
        { dependencies store (fun id -> stopped.Value <- id) with
            Options =
                { options with
                    IdleTimeout = TimeSpan.FromMilliseconds 50.0
                }
        }

    use actor = new ProjectActor(projectId, deps)

    actor.Execute(pm, TaskCmd(AddTask(task "t-new" "")))
    |> Async.RunSynchronously
    |> expectDiffs
    |> ignore

    Assert.True(waitFor 3000 (fun () -> stopped.Value = projectId), "actor se nezastavil")
    Assert.True(store.Saves >= 1)

[<Fact>]
let ``neexistující projekt actor odmítne`` () =
    let store = FakeStore None
    use actor = createActor store

    let result =
        actor.Execute(pm, TaskCmd(AddTask(task "t-new" ""))) |> Async.RunSynchronously

    Assert.Equal(Error $"Projekt {projectId} neexistuje", result)

[<Fact>]
let ``souběžné commandy se zpracují sekvenčně a žádný se neztratí`` () =
    let store = FakeStore(Some state)
    use actor = createActor store

    [ 1..50 ]
    |> List.map (fun index -> actor.Execute(pm, TaskCmd(AddTask(task $"t-{index}" ""))))
    |> Async.Parallel
    |> Async.RunSynchronously
    |> Array.iter (expectDiffs >> ignore)

    match actor.FullState pm.UserId |> Async.RunSynchronously with
    | Ok snapshot -> Assert.Equal(52, List.length snapshot.Tasks)
    | Error message -> failwith message

[<Fact>]
let ``selhání zápisu nezahodí stav v paměti`` () =
    let failing =
        {
            Load = fun _ -> async { return Some state }
            ArchiveKbPage = fun _ _ -> async { return () }
            Save = fun _ _ -> async { return raise (InvalidOperationException "databáze je pryč") }
        }

    let deps = ActorDependencies.Basic(failing, options)

    use actor = new ProjectActor(projectId, deps)

    actor.Execute(pm, TaskCmd(AddTask(task "t-new" "")))
    |> Async.RunSynchronously
    |> expectDiffs
    |> ignore

    Thread.Sleep 200

    match actor.FullState pm.UserId |> Async.RunSynchronously with
    | Ok snapshot -> Assert.Contains(snapshot.Tasks, (fun item -> item.Id = "t-new"))
    | Error message -> failwith message
