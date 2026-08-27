/// Reducer — čistá funkce, tedy nejlevnější a nejcennější místo pro testy.
module MSProjectManager.Tests.ReducerTests

open Xunit
open MSProjectManager.Domain.Types
open MSProjectManager.Domain.Ado
open MSProjectManager.Domain.State
open MSProjectManager.Domain.Patches
open MSProjectManager.Domain.Commands
open MSProjectManager.Domain.Diffs
open MSProjectManager.Domain.Reducer
open MSProjectManager.Tests.Fixtures

module Weeks = MSProjectManager.Domain.Weeks

/// Pevné razítko: reducer bere čas jako parametr právě proto, aby šlo
/// v testech porovnávat celý stav na rovnost.
let private testNow = "2026-08-17T09:00:00.0000000+00:00"

let private applyAs (user: UserContext) (command: ProjectCommand) = applyCommand state user testNow command

let private applyPm (command: ProjectCommand) = applyAs pm command

let private expectOk (result: Result<AppState * ProjectDiff list, string>) =
    match result with
    | Ok(next, diffs) -> next, diffs
    | Error message -> failwith $"command měl projít, ale skončil chybou: {message}"

let private expectError (result: Result<AppState * ProjectDiff list, string>) =
    match result with
    | Ok _ -> failwith "command měl skončit chybou"
    | Error message -> message

// ── Úkoly ───────────────────────────────────────────────────────────────────

[<Fact>]
let ``add_task přidá úkol a vrátí diff task_added`` () =
    let added = task "t-new" petraPersonId
    let next, diffs = applyPm (TaskCmd(AddTask added)) |> expectOk
    Assert.Equal(3, List.length next.Tasks)

    // Autora a čas doplňuje reducer, ne klient — v diffu už musí být.
    let stamped =
        { added with
            UpdatedBy = Some pm.DisplayName
            UpdatedAt = Some testNow
        }

    Assert.Equal<ProjectDiff list>([ TaskAdded stamped ], diffs)

[<Fact>]
let ``add_task odmítne duplicitní id`` () =
    let message = applyPm (TaskCmd(AddTask(task "t-api" petraPersonId))) |> expectError
    Assert.Contains("už existuje", message)

[<Fact>]
let ``update_task změní jen poslaná pole`` () =
    let fields =
        { emptyTaskFields with
            Name = Some "API refaktoring — fáze 1"
        }

    let next, diffs = applyPm (TaskCmd(UpdateTask("t-api", fields))) |> expectOk
    let updated = next.Tasks |> List.find (fun item -> item.Id = "t-api")
    Assert.Equal("API refaktoring — fáze 1", updated.Name)
    Assert.Equal(5.0, updated.Md)

    let stamped =
        { fields with
            UpdatedBy = Some pm.DisplayName
            UpdatedAt = Some testNow
        }

    Assert.Equal<ProjectDiff list>([ TaskUpdated("t-api", stamped) ], diffs)
    Assert.Equal(Some pm.DisplayName, updated.UpdatedBy)

[<Fact>]
let ``update_task neexistujícího úkolu je chyba`` () =
    let message = applyPm (TaskCmd(UpdateTask("t-nic", emptyTaskFields))) |> expectError
    Assert.Contains("neexistuje", message)

[<Fact>]
let ``move_task posune úkol a diff nese jen s a e`` () =
    let next, diffs = applyPm (TaskCmd(MoveTask("t-api", 2, 5))) |> expectOk
    let moved = next.Tasks |> List.find (fun item -> item.Id = "t-api")
    Assert.Equal(2, moved.S)
    Assert.Equal(5, moved.E)

    match diffs with
    | [ TaskUpdated(_, fields) ] ->
        Assert.Equal(Some 2, fields.S)
        Assert.Equal(None, fields.Name)
    | other -> failwith $"neočekávané diffy: {other}"

[<Fact>]
let ``move_task odmítne obrácený rozsah`` () =
    let message = applyPm (TaskCmd(MoveTask("t-api", 5, 2))) |> expectError
    Assert.Contains("Neplatný rozsah", message)

[<Fact>]
let ``update_progress hlídá rozsah 0 až 100`` () =
    let next, _ = applyPm (TaskCmd(UpdateProgress("t-api", 100))) |> expectOk
    Assert.Equal(100, (next.Tasks |> List.find (fun item -> item.Id = "t-api")).Progress)
    Assert.Contains("0–100", applyPm (TaskCmd(UpdateProgress("t-api", 101))) |> expectError)
    Assert.Contains("0–100", applyPm (TaskCmd(UpdateProgress("t-api", -1))) |> expectError)

[<Fact>]
let ``delete_task odebere úkol`` () =
    let next, diffs = applyPm (TaskCmd(DeleteTask "t-api")) |> expectOk
    Assert.DoesNotContain(next.Tasks, (fun item -> item.Id = "t-api"))
    Assert.Equal<ProjectDiff list>([ TaskDeleted "t-api" ], diffs)

// ── Osoby a kapacita ────────────────────────────────────────────────────────

[<Fact>]
let ``update_alloc přepíše alokaci v daném týdnu`` () =
    let next, diffs =
        applyPm (PeopleCmd(UpdateAlloc(petraPersonId, 2, 80.0))) |> expectOk

    let updated = next.People |> List.find (fun item -> item.Id = petraPersonId)
    Assert.Equal<float list>([ 100.0; 100.0; 80.0; 100.0 ], updated.WeekAlloc)
    Assert.Equal<ProjectDiff list>([ AllocUpdated(petraPersonId, 2, 80.0) ], diffs)

[<Fact>]
let ``update_alloc doplní kratší alokaci stovkami`` () =
    let next, _ = applyPm (PeopleCmd(UpdateAlloc(petraPersonId, 5, 50.0))) |> expectOk
    let updated = next.People |> List.find (fun item -> item.Id = petraPersonId)
    Assert.Equal<float list>([ 100.0; 100.0; 100.0; 100.0; 100.0; 50.0 ], updated.WeekAlloc)

[<Fact>]
let ``update_alloc odmítne neznámou osobu i neplatné procento`` () =
    Assert.Contains("neexistuje", applyPm (PeopleCmd(UpdateAlloc("nikdo", 0, 50.0))) |> expectError)
    Assert.Contains("0–100", applyPm (PeopleCmd(UpdateAlloc(petraPersonId, 0, 150.0))) |> expectError)

// @scenario: kapacita.feature > Smazání osoby (PM)
[<Fact>]
let ``delete_person přesune úkoly smazané osoby do backlogu`` () =
    let next, diffs = applyPm (PeopleCmd(DeletePerson petraPersonId)) |> expectOk

    Assert.Equal(2, List.length next.People)
    // Úkoly se nemažou, jen ztrácejí přiřazení — práce zůstává v plánu.
    Assert.Equal(2, List.length next.Tasks)
    Assert.All(next.Tasks, fun task -> Assert.NotEqual<string>(petraPersonId, task.P))

    Assert.Empty(next.Tasks |> List.filter (fun task -> task.P = petraPersonId))

    // Ostatní klienti se o přeřazení musí dozvědět, ne si ho domýšlet.
    let updates =
        diffs
        |> List.choose (fun diff ->
            match diff with
            | TaskUpdated(taskId, fields) -> Some(taskId, fields.P)
            | _ -> None
        )

    Assert.NotEmpty updates
    Assert.All(updates, fun (_, assigned) -> Assert.Equal(Some "", assigned))

// ── Metadata projektu ───────────────────────────────────────────────────────

[<Fact>]
let ``update_project sloučí částečná pole`` () =
    let fields =
        { emptyProjectFields with
            Name = Some "Backend refaktoring v2"
            EndDate = Some "2026-09-30"
        }

    let next, _ = applyPm (ProjectMetaCmd(UpdateProject fields)) |> expectOk
    Assert.Equal("Backend refaktoring v2", next.Project.Name)
    Assert.Equal("2026-09-30", next.Project.EndDate)
    Assert.Equal("2026-01-05", next.Project.StartDate)

[<Fact>]
let ``update_milestone_checklist odškrtne položku`` () =
    let items =
        [
            {
                Id = "c1"
                Text = "Smoke test"
                Completed = true
            }
        ]

    let next, diffs =
        applyPm (ProjectMetaCmd(UpdateMilestoneChecklist("m1", items))) |> expectOk

    let updated = next.Project.Milestones |> List.head
    Assert.True((List.head updated.CheckItems).Completed)
    Assert.Equal<ProjectDiff list>([ MilestoneChecklistUpdated("m1", items) ], diffs)

[<Fact>]
let ``update_milestone_checklist neznámého milníku je chyba`` () =
    let message =
        applyPm (ProjectMetaCmd(UpdateMilestoneChecklist("m9", []))) |> expectError

    Assert.Contains("neexistuje", message)

[<Fact>]
let ``set_cats odmítne prázdnou mapu kategorií`` () =
    let message = applyPm (ProjectMetaCmd(SetCats Map.empty)) |> expectError
    Assert.Contains("alespoň jednu kategorii", message)

// ── Přílohy, ADO a session ──────────────────────────────────────────────────

[<Fact>]
let ``update_file_note změní poznámku k příloze`` () =
    let next, diffs =
        applyPm (FileCmd(UpdateFileNote("f1", "Zápis z analýzy"))) |> expectOk

    let updated = next.Files |> List.find (fun item -> item.Id = "f1")
    Assert.Equal("Zápis z analýzy", updated.Note)
    Assert.Equal<ProjectDiff list>([ FileNoteUpdated("f1", "Zápis z analýzy") ], diffs)

[<Fact>]
let ``ado_save_config uloží konfiguraci do stavu`` () =
    let config =
        {
            OrgUrl = "https://dev.azure.com/org"
            Project = "NPEZ"
            AreaPath = "NPEZ\\RP04"
            TrackedWiTypes = [ "Bug"; "Task" ]
            DefaultPushWiType = "Product Backlog Item"
            DefaultIteration = "NPEZ\\Sprint 42"
            MdToHoursCoefficient = 8.0
            IncludePATInExport = false
            MemberMapping = []
        }

    let next, diffs = applyPm (AdoCmd(AdoSaveConfig config)) |> expectOk
    Assert.Equal(Some config, next.AdoConfig)
    // Diff skládá actor — potřebuje k němu per-user stav PATu (ADR-004).
    Assert.Empty diffs

[<Fact>]
let ``ado_save_pat se stavu projektu nedotkne`` () =
    let next, diffs = applyPm (AdoCmd(AdoSavePat "tajny-token")) |> expectOk
    Assert.Equal(state, next)
    Assert.Empty(diffs)
    Assert.Contains("prázdný", applyPm (AdoCmd(AdoSavePat "  ")) |> expectError)

[<Fact>]
let ``update_presence nemění stav ani negeneruje diff`` () =
    let next, diffs = applyPm (SessionCmd(UpdatePresence "gantt")) |> expectOk
    Assert.Equal(state, next)
    Assert.Empty(diffs)

[<Fact>]
let ``full_state_import nahradí stav, ale ponechá přílohy`` () =
    let imported =
        { forUser pm.UserId (initial "Importovaný projekt") with
            Tasks = [ task "t-imported" "" ]
        }

    let next, diffs = applyPm (SessionCmd(FullStateImport imported)) |> expectOk
    Assert.Equal("Importovaný projekt", next.Project.Name)
    Assert.Equal<FileRef list>(state.Files, next.Files)
    Assert.Equal<ProjectDiff list>([ FullState(forUser pm.UserId next) ], diffs)

[<Fact>]
let ``undo a redo server odmítne, řeší je klient`` () =
    Assert.Contains("ADR-007", applyPm (SessionCmd Undo) |> expectError)
    Assert.Contains("ADR-007", applyPm (SessionCmd Redo) |> expectError)

// ── Soukromí TODO a připomínek ──────────────────────────────────────────────

// @scenario: todo-reminders.feature > TODO jsou soukromé per-user
[<Fact>]
let ``TODO jednoho uživatele nevidí druhý`` () =
    let afterPetra, _ = applyAs dev (PersonalCmd(AddTodo(todo "d1"))) |> expectOk

    let afterJan, _ =
        applyCommand afterPetra pm testNow (PersonalCmd(AddTodo(todo "d2"))) |> expectOk

    Assert.Equal<TodoItem list>([ todo "d1" ], todosOf petraId afterJan)
    Assert.Equal<TodoItem list>([ todo "d2" ], todosOf janId afterJan)
    Assert.Equal<TodoItem list>([ todo "d1" ], (forUser petraId afterJan).Todos)
    Assert.Equal<TodoItem list>([ todo "d2" ], (forUser janId afterJan).Todos)

[<Fact>]
let ``cizí TODO nelze upravit ani smazat`` () =
    let afterPetra, _ = applyAs dev (PersonalCmd(AddTodo(todo "d1"))) |> expectOk

    let message =
        applyCommand afterPetra pm testNow (PersonalCmd(DeleteTodo "d1")) |> expectError

    Assert.Contains("neexistuje", message)

[<Fact>]
let ``připomínky jsou také per uživatele`` () =
    let next, diffs = applyAs dev (PersonalCmd(AddReminder(reminder "r1"))) |> expectOk
    Assert.Equal<ProjectDiff list>([ ReminderAdded(reminder "r1") ], diffs)
    Assert.Empty(remindersOf janId next)

// ── Vlastnictví přes Person.UserId ──────────────────────────────────────────

[<Fact>]
let ``osoba bez účtu nepatří nikomu`` () =
    let message =
        applyAs dev (PeopleCmd(UpdateAlloc(externistaPersonId, 0, 50.0))) |> expectError

    Assert.Contains("vlastní alokaci", message)

[<Fact>]
let ``vlastnictví se neodvozuje z id osoby`` () =
    // Účet "petra.kolarova" vlastní osobu "os-petra"; kdyby se vlastnictví
    // určovalo shodou id, tenhle command by prošel jako „vlastní".
    let byPersonId = applyAs dev (PeopleCmd(UpdateAlloc(petraId, 0, 50.0)))
    Assert.True(Result.isError byPersonId)

// ── Přepočet při změně datumů ───────────────────────────────────────────────

[<Fact>]
// @scenario: project-management.feature > Zkrácení projektu ořízne úkoly za novým koncem
let ``zkrácení projektu ořízne úkoly a alokace`` () =
    let longer =
        { state with
            Tasks =
                [
                    { task "t-api" petraPersonId with
                        S = 10
                        E = 20
                    }
                ]
        }

    let fields =
        { emptyProjectFields with
            EndDate = Some "2026-01-30"
        }

    let next, diffs =
        applyCommand longer pm testNow (ProjectMetaCmd(UpdateProject fields))
        |> expectOk
    // 5.1.2026 (pondělí) až 30.1.2026 = 4 týdny, tedy W1..W4 (1-based, ADR-014)
    let clamped = List.exactlyOne next.Tasks
    Assert.Equal(4, clamped.S)
    Assert.Equal(4, clamped.E)
    Assert.All(next.People, fun person -> Assert.Equal(4, List.length person.WeekAlloc))
    Assert.Contains(diffs, (fun diff -> diff = ProjectUpdated fields))
    Assert.True(List.length diffs > 1)

[<Fact>]
// @scenario: project-management.feature > Úkol v posledním týdnu přežije uložení datumů projektu
let ``úkol v posledním týdnu se při uložení datumů neposune`` () =
    // Ořez na `weekCount - 1` posouval poslední týden o jeden dopředu při
    // KAŽDÉ změně datumů — stačilo znovu uložit stejnou hodnotu (ADR-014).
    let weekCount = Weeks.count state.Project.StartDate state.Project.EndDate

    let atEnd =
        { state with
            Tasks =
                [
                    { task "t-api" petraPersonId with
                        S = weekCount
                        E = weekCount
                    }
                ]
        }

    let fields =
        { emptyProjectFields with
            EndDate = Some state.Project.EndDate
        }

    let next, diffs =
        applyCommand atEnd pm testNow (ProjectMetaCmd(UpdateProject fields)) |> expectOk

    let unchanged = List.exactlyOne next.Tasks
    Assert.Equal(weekCount, unchanged.S)
    Assert.Equal(weekCount, unchanged.E)

    // Žádný `task_updated` — úkol se nepohnul, takže se nemá co rozesílat.
    // (`person_updated` tu být může: fixture osob má kratší `WeekAlloc`,
    // než kolik má projekt týdnů, a `resizeAlloc` ji dorovnává.)
    Assert.DoesNotContain(
        diffs,
        fun diff ->
            match diff with
            | TaskUpdated _ -> true
            | _ -> false
    )

[<Fact>]
let ``projekt bez platných datumů úkoly neořízne`` () =
    // `weekCount = 0` neznamená „projekt má nula týdnů", ale „datumy nejdou
    // přečíst". Ořez na nulu by úkoly poslal na neplatný týden 0.
    let withTask =
        { state with
            Tasks =
                [
                    { task "t-api" petraPersonId with
                        S = 3
                        E = 5
                    }
                ]
        }

    let fields =
        { emptyProjectFields with
            StartDate = Some ""
        }

    let next, _ =
        applyCommand withTask pm testNow (ProjectMetaCmd(UpdateProject fields))
        |> expectOk

    let untouched = List.exactlyOne next.Tasks
    Assert.Equal(3, untouched.S)
    Assert.Equal(5, untouched.E)

[<Fact>]
let ``změna jiného pole než datumů nepřepočítává`` () =
    let fields =
        { emptyProjectFields with
            Notes = Some "Poznámka"
        }

    let _, diffs = applyPm (ProjectMetaCmd(UpdateProject fields)) |> expectOk
    Assert.Equal<ProjectDiff list>([ ProjectUpdated fields ], diffs)

// ── Autorizace uvnitř reduceru ──────────────────────────────────────────────

[<Fact>]
let ``neautorizovaný command se stavu vůbec nedotkne`` () =
    let message = applyAs dev (TaskCmd(DeleteTask "t-api")) |> expectError
    Assert.Equal("Nedostatečná oprávnění: pouze PM může mazat úkoly", message)
    Assert.Equal(2, List.length state.Tasks)

[<Fact>]
let ``Dev projde vlastním úkolem až k mutaci`` () =
    let next, _ = applyAs dev (TaskCmd(UpdateProgress("t-api", 30))) |> expectOk
    Assert.Equal(30, (next.Tasks |> List.find (fun item -> item.Id = "t-api")).Progress)

// ── ADO: detekce změn (ado-sync.feature) ────────────────────────────────────

module AdoDetection =
    open MSProjectManager.Domain.Ado
    open MSProjectManager.Domain.AdoSync
    open MSProjectManager.Domain.AdoChanges

    let private wi (id: int) (state: string) (remaining: float option) : AdoWorkItem =
        {
            Id = id
            Relations = None
            Fields =
                {
                    Title = $"WI {id}"
                    State = state
                    WorkItemType = "Product Backlog Item"
                    AssignedTo = None
                    Description = None
                    AreaPath = None
                    IterationPath = None
                    RemainingWork = remaining
                    ChangedDate = None
                }
        }

    let private snapshotItem (state: string) (remaining: float option) : AdoSnapshotItem =
        {
            State = state
            RemainingWork = remaining
            AssignedTo = null
            DescriptionHash = ""
            WorkItemType = "Product Backlog Item"
            Title = "WI"
        }

    let private inputFor (snapshot: AdoSnapshot option) (items: AdoWorkItem list) (mappings: TaskWiMapping list) =
        {
            Snapshot = snapshot
            WorkItems = items
            Mappings = mappings
            Tasks = []
            MemberMapping = []
            People = []
        }

    let private snapshotWith (items: (string * AdoSnapshotItem) list) =
        Some
            { AdoSnapshot.Empty with
                Items = Map.ofList items
            }

    // @scenario: ado-sync.feature > Remaining Work z nuly se nehlásí jako nekonečno
    [<Fact>]
    let ``remaining work z nuly nehlásí Infinity`` () =
        let snapshot = snapshotWith [ "1234", snapshotItem "Active" (Some 0.0) ]

        let changes =
            inputFor
                snapshot
                [ wi 1234 "Active" (Some 5.0) ]
                [
                    {
                        TaskId = "t1"
                        TaskName = "Úkol"
                        WiIds = [ 1234 ]
                    }
                ]
            |> detectChanges

        let change = changes |> List.find (fun item -> item.Type = RemainingIncrease)
        Assert.Contains("nově odhadnuto", change.Details)
        Assert.DoesNotContain("Infinity", change.Details)

    // @scenario: ado-sync.feature > Dva úkoly odkazující na stejný WI
    [<Fact>]
    let ``změna se ohlásí oběma úkolům na stejném work itemu`` () =
        let snapshot = snapshotWith [ "1234", snapshotItem "Done" None ]

        let mappings =
            [
                {
                    TaskId = "t1"
                    TaskName = "API refaktoring"
                    WiIds = [ 1234 ]
                }
                {
                    TaskId = "t2"
                    TaskName = "API testy"
                    WiIds = [ 1234 ]
                }
            ]

        let changes =
            inputFor snapshot [ wi 1234 "Active" None ] mappings
            |> detectChanges
            |> List.filter (fun change -> change.Type = StateRegression)

        Assert.Equal<string list>([ "t1"; "t2" ], changes |> List.map (fun c -> c.TaskId) |> List.sort)

    // @scenario: ado-sync.feature > Work item mimo stažený vzorek si podrží historii
    [<Fact>]
    let ``snapshot si podrží položky, na které se sync neptal`` () =
        let previous = snapshotWith [ "1400", snapshotItem "Done" None ]

        // Ptali jsme se jen na 1234; 1400 tentokrát navázaný nebyl.
        let next =
            buildSnapshot previous "2026-08-17T10:00:00Z" [ 1234 ] [ wi 1234 "Active" None ]

        Assert.True(next.Items.ContainsKey "1400")
        Assert.Equal("Done", next.Items.["1400"].State)

    [<Fact>]
    let ``snapshot zahodí položku, na kterou se ptal a ADO ji nevrátilo`` () =
        let previous = snapshotWith [ "1234", snapshotItem "Done" None ]
        let next = buildSnapshot previous "2026-08-17T10:00:00Z" [ 1234 ] []
        Assert.False(next.Items.ContainsKey "1234")

    // @scenario: ado-sync.feature > Potvrzení platí jen pro viděnou hodnotu
    [<Fact>]
    let ``potvrzení se váže na hodnotu, ne jen na typ změny`` () =
        let first = changeKey 1234 StateRegression "In Progress"
        let second = changeKey 1234 StateRegression "New"
        Assert.NotEqual<string>(first, second)

        // Hodnota odvozená ze snapshotu musí trefit klíč z detekce.
        let item = snapshotItem "In Progress" None
        Assert.Equal<string>(first, changeKey 1234 StateRegression (acknowledgedValue (Some item) StateRegression))

// ── Mapování osoby na účet (FR-ROLE-07, ADR-006 doplněk) ────────────────────

let private linkAccount (personId: string) (userId: string | null) =
    PeopleCmd(
        UpdatePerson(
            personId,
            { emptyPersonFields with
                UserId = Some userId
            }
        )
    )

[<Fact>]
// @scenario: kapacita.feature > PM přiřadí osobě uživatelský účet
let ``PM přiřadí osobě účet`` () =
    // Volný účet — `janId` i `petraId` už v fixtures někomu patří.
    let novyClen = "novy.clen"
    let next, diffs = applyPm (linkAccount externistaPersonId novyClen) |> expectOk

    let updated = next.People |> List.find (fun person -> person.Id = externistaPersonId)
    Assert.Equal(novyClen, updated.UserId)

    let expected =
        PersonUpdated(
            externistaPersonId,
            { emptyPersonFields with
                UserId = Some novyClen
            }
        )

    Assert.Contains(diffs, (fun diff -> diff = expected))

[<Fact>]
// @scenario: kapacita.feature > PM zruší přiřazení účtu
let ``PM zruší vazbu osoby na účet`` () =
    let next, _ = applyPm (linkAccount petraPersonId null) |> expectOk

    let updated = next.People |> List.find (fun person -> person.Id = petraPersonId)
    Assert.Null updated.UserId

[<Fact>]
// @scenario: kapacita.feature > Jeden účet nesmí patřit dvěma osobám
let ``účet nelze přiřadit dvěma osobám v jednom projektu`` () =
    // `petraId` už vlastní `os-petra`. Kdyby ho dostal i externista,
    // `ownsTask` by platilo pro obě osoby a autorizace by ztratila smysl.
    let message = applyPm (linkAccount externistaPersonId petraId) |> expectError
    Assert.Contains("Petra Kolářová", message)

[<Fact>]
let ``add_person s obsazeným účtem je odmítnut`` () =
    let duplicate = person "os-novy" petraId "Nový člen" "FE"
    let message = applyPm (PeopleCmd(AddPerson duplicate)) |> expectError
    Assert.Contains("už je v tomto projektu přiřazen", message)

[<Fact>]
let ``přiřazení téhož účtu téže osobě projde`` () =
    // Idempotence: patch, který nic nemění, nesmí spadnout na vlastní vazbě.
    let next, _ = applyPm (linkAccount petraPersonId petraId) |> expectOk
    let updated = next.People |> List.find (fun person -> person.Id = petraPersonId)
    Assert.Equal(petraId, updated.UserId)

[<Fact>]
// @scenario: role-permissions.feature > Dev smí editovat úkol osoby, se kterou je spárovaný
let ``Dev po spárování smí editovat úkol své osoby`` () =
    // Tenhle test chyběl a jeho absence stála celou roli Dev: všechny ostatní
    // ověřovaly, že ZÁKAZ platí, a ten platil. Že je povolení vůbec
    // dosažitelné, neověřoval nikdo — a nebylo, protože UI neumělo osobu
    // k účtu přiřadit (ADR-006, doplněk o mapování).
    let externista =
        {
            UserId = "novy.clen"
            DisplayName = "Nový člen"
            Role = Dev
        }

    let ownTask = task "t-fe" externistaPersonId
    let before = { state with Tasks = ownTask :: state.Tasks }

    // Bez vazby Dev na svůj úkol nesmí.
    let denied =
        applyCommand before externista testNow (TaskCmd(UpdateProgress("t-fe", 40)))

    Assert.True(Result.isError denied)

    // PM osobu spáruje s účtem…
    let linked, _ =
        applyCommand before pm testNow (linkAccount externistaPersonId "novy.clen") |> expectOk

    // …a od té chvíle Dev projde.
    let after, _ =
        applyCommand linked externista testNow (TaskCmd(UpdateProgress("t-fe", 40))) |> expectOk

    let updated = after.Tasks |> List.find (fun t -> t.Id = "t-fe")
    Assert.Equal(40, updated.Progress)
