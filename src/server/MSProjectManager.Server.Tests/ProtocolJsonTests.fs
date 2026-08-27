/// Kontrakt s frontendem: tvar commandů a diffů na wire (ADR-004,
/// `src/types/protocol.ts`). Tyhle testy hlídají doslovnost — přejmenování
/// case v F# nesmí tiše změnit `type`/`op` nebo název pole.
module MSProjectManager.Tests.ProtocolJsonTests

open System.Text.Json
open Xunit
open MSProjectManager.Domain.Types
open MSProjectManager.Domain.Ado
open MSProjectManager.Domain.State
open MSProjectManager.Domain.Patches
open MSProjectManager.Domain.Commands
open MSProjectManager.Domain.Diffs
open MSProjectManager.Protocol.Json
open MSProjectManager.Tests.Fixtures

let private parse (json: string) = JsonDocument.Parse(json).RootElement

let private prop (name: string) (json: string) =
    match (parse json).TryGetProperty name with
    | true, value -> Some(value.ToString())
    | false, _ -> None

let private serializeCommand (command: ProjectCommand) =
    JsonSerializer.Serialize(command, commandOptions)

let private readCommand (json: string) : ProjectCommand = deserialize<ProjectCommand> json

// ── Commandy: wire tag ──────────────────────────────────────────────────────

[<Theory>]
[<InlineData("add_task")>]
[<InlineData("update_task")>]
[<InlineData("move_task")>]
[<InlineData("update_progress")>]
[<InlineData("delete_task")>]
[<InlineData("add_person")>]
[<InlineData("update_person")>]
[<InlineData("delete_person")>]
[<InlineData("update_alloc")>]
[<InlineData("update_project")>]
[<InlineData("set_milestones")>]
[<InlineData("update_milestone_checklist")>]
[<InlineData("set_cats")>]
[<InlineData("set_roles")>]
[<InlineData("add_risk")>]
[<InlineData("update_risk")>]
[<InlineData("delete_risk")>]
[<InlineData("add_opportunity")>]
[<InlineData("update_opportunity")>]
[<InlineData("delete_opportunity")>]
[<InlineData("add_kb_page")>]
[<InlineData("update_kb_page")>]
[<InlineData("delete_kb_page")>]
[<InlineData("add_todo")>]
[<InlineData("update_todo")>]
[<InlineData("delete_todo")>]
[<InlineData("add_reminder")>]
[<InlineData("update_reminder")>]
[<InlineData("delete_reminder")>]
[<InlineData("add_file")>]
[<InlineData("update_file_note")>]
[<InlineData("delete_file")>]
[<InlineData("ado_save_config")>]
[<InlineData("ado_save_pat")>]
[<InlineData("ado_run_sync")>]
[<InlineData("full_state_import")>]
[<InlineData("update_presence")>]
[<InlineData("undo")>]
[<InlineData("redo")>]
let ``protokol zná všechny typy commandů`` (wireType: string) =
    let json = $"""{{"type":"{wireType}"}}"""
    // Payload chybí, takže deserializace může selhat na chybějícím poli —
    // podstatné je, že to není selhání na neznámém typu.
    let failure =
        try
            JsonSerializer.Deserialize<ProjectCommand>(json, commandOptions) |> ignore
            ""
        with :? JsonException as ex ->
            ex.Message

    Assert.DoesNotContain("Neznámý typ commandu", failure)

[<Fact>]
let ``neznámý typ commandu je odmítnut`` () =
    let act () =
        JsonSerializer.Deserialize<ProjectCommand>("""{"type":"drop_database"}""", commandOptions)
        |> ignore

    let ex = Assert.Throws<JsonException>(act)
    Assert.Contains("Neznámý typ commandu", ex.Message)

[<Fact>]
let ``commandType vrací wire tag`` () =
    Assert.Equal("update_progress", commandType (TaskCmd(UpdateProgress("t-api", 30))))
    Assert.Equal("ado_run_sync", commandType (AdoCmd AdoRunSync))
    Assert.Equal("full_state_import", commandType (SessionCmd(FullStateImport(forUser janId state))))

// ── Commandy: tvar payloadu ─────────────────────────────────────────────────

[<Fact>]
let ``add_task nese úkol s krátkými poli`` () =
    let json = serializeCommand (TaskCmd(AddTask(task "t1" petraPersonId)))
    Assert.Equal(Some "add_task", prop "type" json)
    let taskJson = (parse json).GetProperty("task").ToString()
    Assert.Equal(Some petraPersonId, prop "p" taskJson)
    Assert.Equal(Some "1", prop "s" taskJson)
    Assert.Equal(Some "2", prop "e" taskJson)
    Assert.Equal(Some "5", prop "md" taskJson)
    Assert.Equal(Some "obecne", prop "cat" taskJson)

[<Fact>]
let ``update_task posílá jen změněná pole`` () =
    let fields =
        { emptyTaskFields with
            Progress = Some 30
        }

    let json = serializeCommand (TaskCmd(UpdateTask("t-api", fields)))
    Assert.Equal(Some "update_task", prop "type" json)
    Assert.Equal(Some "t-api", prop "taskId" json)
    let fieldsJson = (parse json).GetProperty("fields").ToString()
    Assert.Equal(Some "30", prop "progress" fieldsJson)
    Assert.Equal(None, prop "name" fieldsJson)

[<Fact>]
let ``move_task má pole s a e`` () =
    let json = serializeCommand (TaskCmd(MoveTask("t-api", 2, 5)))
    Assert.Equal(Some "move_task", prop "type" json)
    Assert.Equal(Some "2", prop "s" json)
    Assert.Equal(Some "5", prop "e" json)

[<Fact>]
let ``update_alloc má personId weekIdx a pct`` () =
    let json = serializeCommand (PeopleCmd(UpdateAlloc(petraPersonId, 2, 80.0)))
    Assert.Equal(Some "update_alloc", prop "type" json)
    Assert.Equal(Some petraPersonId, prop "personId" json)
    Assert.Equal(Some "2", prop "weekIdx" json)
    Assert.Equal(Some "80", prop "pct" json)

[<Fact>]
let ``add_kb_page nese pole page`` () =
    let json = serializeCommand (KnowledgeCmd(AddKbPage(kbPage "k1")))
    Assert.Equal(Some "add_kb_page", prop "type" json)
    Assert.True((parse json).TryGetProperty("page") |> fst)

[<Fact>]
let ``add_opportunity nese pole opp`` () =
    let opp: Opportunity =
        {
            Id = "o1"
            Title = "Sdílení komponent"
            Detail = ""
        }

    let json = serializeCommand (RiskCmd(AddOpportunity opp))
    Assert.Equal(Some "add_opportunity", prop "type" json)
    Assert.True((parse json).TryGetProperty("opp") |> fst)

[<Fact>]
let ``undo je command bez payloadu`` () =
    Assert.Equal("""{"type":"undo"}""", serializeCommand (SessionCmd Undo))

// ── Commandy: deserializace tak, jak je posílá klient ───────────────────────

[<Fact>]
let ``klientský update_progress se načte`` () =
    let json = """{"type":"update_progress","taskId":"t-api","progress":50}"""
    Assert.Equal(TaskCmd(UpdateProgress("t-api", 50)), readCommand json)

[<Fact>]
let ``klientský update_task s částečnými poli se načte`` () =
    let json =
        """{"type":"update_task","taskId":"t-api","fields":{"name":"API refaktoring — fáze 1"}}"""

    match readCommand json with
    | TaskCmd(UpdateTask(taskId, fields)) ->
        Assert.Equal("t-api", taskId)
        Assert.Equal(Some "API refaktoring — fáze 1", fields.Name)
        Assert.Equal(None, fields.Progress)
    | other -> failwith $"neočekávaný command: {other}"

[<Fact>]
let ``klientský add_task se načte i bez volitelných adoNotes`` () =
    let json =
        """{"type":"add_task","task":{"id":"t9","p":"","name":"Nový","cat":"obecne","s":0,"e":0,
             "md":1,"progress":0,"desc":"","links":[]}}"""

    match readCommand json with
    | TaskCmd(AddTask added) ->
        Assert.Equal("t9", added.Id)
        Assert.Equal(None, added.AdoNotes)
    | other -> failwith $"neočekávaný command: {other}"

[<Fact>]
let ``keyed record kategorií se načte jako mapa`` () =
    let json =
        """{"type":"set_cats","cats":{"be":{"bg":"#111827","bd":"#4b5563","tx":"#94a3b8","label":"Backend"}}}"""

    match readCommand json with
    | ProjectMetaCmd(SetCats cats) -> Assert.Equal("Backend", cats.["be"].Label)
    | other -> failwith $"neočekávaný command: {other}"

[<Fact>]
let ``riziko používá textové hodnoty závažnosti`` () =
    let json =
        """{"type":"add_risk","risk":{"id":"r1","sev":"med","who":"PM","title":"T","detail":""}}"""

    match readCommand json with
    | RiskCmd(AddRisk added) -> Assert.Equal(Med, added.Sev)
    | other -> failwith $"neočekávaný command: {other}"

// ── Diffy ───────────────────────────────────────────────────────────────────

let private serializeDiffJson (diff: ProjectDiff) =
    JsonSerializer.Serialize(diff, diffOptions)

[<Theory>]
[<InlineData("task_added")>]
[<InlineData("task_updated")>]
[<InlineData("task_deleted")>]
[<InlineData("person_added")>]
[<InlineData("person_updated")>]
[<InlineData("person_deleted")>]
[<InlineData("project_updated")>]
[<InlineData("milestones_set")>]
[<InlineData("cats_set")>]
[<InlineData("roles_set")>]
[<InlineData("kb_page_added")>]
[<InlineData("full_state")>]
[<InlineData("presence")>]
[<InlineData("error")>]
let ``diffy z ADR-004 mají očekávaný op`` (op: string) =
    let ops =
        [
            TaskAdded(task "t1" petraPersonId)
            TaskUpdated("t1", emptyTaskFields)
            TaskDeleted "t1"
            PersonAdded(person "p1" janId "Jan" "AR")
            PersonUpdated("p1", emptyPersonFields)
            PersonDeleted "p1"
            ProjectUpdated
                {
                    Name = Some "X"
                    StartDate = None
                    EndDate = None
                    Budget = None
                    Milestones = None
                    Notes = None
                    Changelog = None
                }
            MilestonesSet [ milestone "m1" ]
            CatsSet initialCats
            RolesSet initialRoles
            KbPageAdded(kbPage "k1")
            FullState(forUser janId state)
            Presence []
            ErrorOccurred("Nedostatečná oprávnění", "update_project")
        ]
        |> List.map (fun diff -> prop "op" (serializeDiffJson diff))

    Assert.Contains(Some op, ops)

[<Fact>]
let ``error diff nese message a commandType`` () =
    let json =
        serializeDiffJson (ErrorOccurred("Nedostatečná oprávnění: pouze PM může mazat úkoly", "delete_task"))

    Assert.Equal(Some "error", prop "op" json)
    Assert.Equal(Some "delete_task", prop "commandType" json)
    Assert.Equal(Some "Nedostatečná oprávnění: pouze PM může mazat úkoly", prop "message" json)

[<Fact>]
let ``full_state nese celý stav včetně příloh`` () =
    let json = serializeDiffJson (FullState(forUser janId state))
    let stateJson = (parse json).GetProperty("state").ToString()
    Assert.Equal(Some "full_state", prop "op" json)
    Assert.True((parse stateJson).TryGetProperty("kbPages") |> fst)
    Assert.True((parse stateJson).TryGetProperty("adoSyncLog") |> fst)
    Assert.Equal(2, (parse stateJson).GetProperty("files").GetArrayLength())

[<Fact>]
let ``presence diff nese seznam uživatelů`` () =
    let entry =
        {
            UserId = petraId
            DisplayName = "Petra Kolářová"
            View = "gantt"
            Color = "#34d399"
        }

    let json = serializeDiffJson (Presence [ entry ])
    Assert.Equal(Some "presence", prop "op" json)
    let users = (parse json).GetProperty("users")
    Assert.Equal("gantt", users.[0].GetProperty("view").GetString())

[<Fact>]
let ``ado sync log používá velká písmena v akci`` () =
    let entry =
        {
            Id = "l1"
            Timestamp = "2026-02-01T10:00:00Z"
            Action = AddedToPlan
            TaskId = Some "t-api"
            TaskName = None
            WiId = Some 4231
            WiTitle = None
            Details = ""
        }

    let json = serializeDiffJson (AdoSyncLogAppended entry)
    let entryJson = (parse json).GetProperty("entry").ToString()
    Assert.Equal(Some "ADDED_TO_PLAN", prop "action" entryJson)
    Assert.Equal(Some "4231", prop "wiId" entryJson)
    Assert.Equal(None, prop "taskName" entryJson)

[<Fact>]
let ``stav projektu se serializuje a načte zpět beze ztráty`` () =
    let json = serialize state
    let roundTripped = deserialize<AppState> json
    Assert.Equal(state, roundTripped)

[<Fact>]
let ``projekce pro uživatele nese jen jeho TODO a připomínky`` () =
    let withTodos =
        { state with
            TodosByUser = Map.ofList [ petraId, [ todo "d1" ]; janId, [ todo "d2" ] ]
        }

    let json = serializeDiffJson (FullState(forUser petraId withTodos))
    let stateJson = (parse json).GetProperty("state").ToString()
    let todos = (parse stateJson).GetProperty("todos")
    Assert.Equal(1, todos.GetArrayLength())
    Assert.Equal("d1", todos.[0].GetProperty("id").GetString())

[<Fact>]
let ``osoba bez účtu má userId null, ne chybějící klíč`` () =
    let json =
        serializeCommand (PeopleCmd(AddPerson(person "os-x" null "Externista" "FE")))

    let personJson = (parse json).GetProperty("person")
    Assert.Equal(JsonValueKind.Null, personJson.GetProperty("userId").ValueKind)

[<Fact>]
let ``mapování ADO identity serializuje null, ne vynechaný klíč`` () =
    let mapping: AdoMemberMapping =
        {
            PlannerId = "os-petra"
            AdoIdentity = null
            AdoDisplayName = null
        }

    let config =
        {
            OrgUrl = "https://dev.azure.com/org"
            Project = "NPEZ"
            AreaPath = "NPEZ"
            TrackedWiTypes = []
            DefaultPushWiType = "Task"
            DefaultIteration = "NPEZ"
            MdToHoursCoefficient = 8.0
            IncludePATInExport = false
            MemberMapping = [ mapping ]
        }

    let json = serializeCommand (AdoCmd(AdoSaveConfig config))
    let first = (parse json).GetProperty("config").GetProperty("memberMapping").[0]
    Assert.Equal(JsonValueKind.Null, first.GetProperty("adoIdentity").ValueKind)

// ── Import projektu: přesný tvar, který posílá klient ───────────────────────

/// `full_state_import` je jediný command nesoucí CELÝ stav, takže se na něm
/// potká úplně celý doménový model najednou — a stačí jedno pole navíc nebo
/// chybějící, aby SignalR odmítl vazbu argumentů a import tiše selhal.
///
/// Payload níž je doslovný otisk toho, co pošle prohlížeč po naimportování
/// vlastního exportu aplikace (`utils/importExport.ts` → `parseImportFile`).
///
/// Všimni si CHYBĚJÍCÍHO `adoConfig`: je to `option` a `SkippableOptionFields`
/// znamená, že „žádná hodnota" se píše nepřítomností pole. Klient dřív posílal
/// `"adoConfig": null` a celý import na tom padal.
[<Fact>]
let ``full_state_import z klientského exportu se deserializuje`` () =
    let json =
        """{"type":"full_state_import","state":{
             "project":{"name":"Zdroj","startDate":"2026-01-05","endDate":"2026-07-03",
                        "budget":100,"milestones":[],"notes":"","changelog":[]},
             "people":[{"id":"p1","userId":null,"name":"Petra Kolářová","role":"AR",
                        "color":"#4f9cf9","weekAlloc":[100,100]}],
             "tasks":[],
             "cats":{"obecne":{"bg":"#111827","bd":"#4b5563","tx":"#94a3b8","label":"Obecné"}},
             "roles":{"AR":{"label":"Solution Architect"}},
             "risks":[],"opps":[],"reminders":[],"todos":[],"kbPages":[],
             "adoSyncLog":[],"files":[]}}"""

    match readCommand json with
    | SessionCmd(FullStateImport state) ->
        Assert.Equal("Zdroj", state.Project.Name)
        Assert.Equal(1, List.length state.People)
        Assert.Equal("Petra Kolářová", state.People.Head.Name)
    | other -> failwithf "Očekáván full_state_import, přišlo %A" other
