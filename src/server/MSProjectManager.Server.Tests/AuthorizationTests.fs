/// Matice oprávnění z FR-ROLE-01 / ADR-006.
module MSProjectManager.Tests.AuthorizationTests

open Xunit
open MSProjectManager.Domain.Types
open MSProjectManager.Domain.Ado
open MSProjectManager.Domain.State
open MSProjectManager.Domain.Patches
open MSProjectManager.Domain.Commands
open MSProjectManager.Domain.Authorization
open MSProjectManager.Tests.Fixtures

let private authorize (user: UserContext) (command: ProjectCommand) = authorizeCommand state user command

let private assertAllowed (user: UserContext) (command: ProjectCommand) =
    match authorize user command with
    | Ok() -> ()
    | Error message -> failwith $"command měl projít, ale skončil chybou: {message}"

let private assertDenied (user: UserContext) (command: ProjectCommand) =
    match authorize user command with
    | Ok() -> failwith "command měl být odmítnut"
    | Error message ->
        Assert.StartsWith("Nedostatečná oprávnění", message)
        message

let private adoConfig =
    {
        OrgUrl = "https://dev.azure.com/org"
        Project = "NPEZ"
        AreaPath = "NPEZ\\RP04"
        TrackedWiTypes = [ "Bug" ]
        DefaultPushWiType = "Product Backlog Item"
        DefaultIteration = "NPEZ\\Sprint 42"
        MdToHoursCoefficient = 8.0
        IncludePATInExport = false
        MemberMapping = []
    }

// ── PM ──────────────────────────────────────────────────────────────────────

// @scenario: role-permissions.feature > PM může editovat metadata projektu
[<Fact>]
let ``PM smí editovat metadata projektu`` () =
    assertAllowed
        pm
        (ProjectMetaCmd(
            UpdateProject
                { emptyProjectFields with
                    Name = Some "Backend refaktoring v2"
                }
        ))

[<Fact>]
let ``PM smí mazat úkoly, osoby, rizika i přílohy`` () =
    assertAllowed pm (TaskCmd(DeleteTask "t-api"))
    assertAllowed pm (PeopleCmd(DeletePerson petraPersonId))
    assertAllowed pm (RiskCmd(DeleteRisk "r1"))
    assertAllowed pm (FileCmd(DeleteFile "f2"))

[<Fact>]
let ``PM smí konfigurovat i spustit ADO sync`` () =
    assertAllowed pm (AdoCmd(AdoSaveConfig adoConfig))
    assertAllowed pm (AdoCmd(AdoSavePat "tajny-token"))
    assertAllowed pm (AdoCmd AdoRunSync)

[<Fact>]
let ``PM smí editovat cizí alokaci i cizí úkol`` () =
    assertAllowed pm (PeopleCmd(UpdateAlloc(petraPersonId, 2, 80.0)))
    assertAllowed pm (TaskCmd(UpdateTask("t-api", emptyTaskFields)))

// ── Dev: projekt, milníky, kategorie, role ──────────────────────────────────

// @scenario: role-permissions.feature > Dev nemůže editovat metadata projektu
[<Fact>]
let ``Dev nesmí editovat metadata projektu`` () =
    let message =
        assertDenied
            dev
            (ProjectMetaCmd(
                UpdateProject
                    { emptyProjectFields with
                        Name = Some "Hack"
                    }
            ))

    Assert.Equal("Nedostatečná oprávnění: pouze PM může editovat metadata projektu", message)

// @scenario: role-permissions.feature > Dev vidí milníky ale nemůže je přesouvat
[<Fact>]
let ``Dev nesmí přesouvat milníky, ale smí odškrtávat checklist`` () =
    assertDenied dev (ProjectMetaCmd(SetMilestones [ milestone "m1" ])) |> ignore

    assertAllowed
        dev
        (ProjectMetaCmd(
            UpdateMilestoneChecklist(
                "m1",
                [
                    {
                        Id = "c1"
                        Text = "Smoke test"
                        Completed = true
                    }
                ]
            )
        ))

[<Fact>]
let ``Dev nesmí spravovat kategorie ani role`` () =
    assertDenied dev (ProjectMetaCmd(SetCats initialCats)) |> ignore
    assertDenied dev (ProjectMetaCmd(SetRoles initialRoles)) |> ignore

// ── Dev: úkoly ──────────────────────────────────────────────────────────────

[<Fact>]
let ``Dev smí přidat úkol do backlogu i sobě`` () =
    assertAllowed dev (TaskCmd(AddTask(task "t-new" "")))
    assertAllowed dev (TaskCmd(AddTask(task "t-new" petraPersonId)))

[<Fact>]
let ``Dev nesmí přidat úkol přiřazený někomu jinému`` () =
    assertDenied dev (TaskCmd(AddTask(task "t-new" janPersonId))) |> ignore

// @scenario: role-permissions.feature > Dev nemůže editovat cizí úkol
[<Fact>]
let ``Dev smí editovat vlastní úkol a nesmí cizí`` () =
    assertAllowed
        dev
        (TaskCmd(
            UpdateTask(
                "t-api",
                { emptyTaskFields with
                    Name = Some "API refaktoring — fáze 1"
                }
            )
        ))

    assertDenied dev (TaskCmd(UpdateTask("t-infra", emptyTaskFields))) |> ignore

[<Fact>]
let ``Dev nesmí přeřadit vlastní úkol na jinou osobu`` () =
    assertDenied
        dev
        (TaskCmd(
            UpdateTask(
                "t-api",
                { emptyTaskFields with
                    P = Some janPersonId
                }
            )
        ))
    |> ignore

// @scenario: role-permissions.feature > Dev může nastavit progress vlastního úkolu přes Gantt
[<Fact>]
let ``Dev smí měnit progress vlastního úkolu a nesmí cizího`` () =
    assertAllowed dev (TaskCmd(UpdateProgress("t-api", 50)))
    assertDenied dev (TaskCmd(UpdateProgress("t-infra", 50))) |> ignore

// @scenario: role-permissions.feature > Dev nemůže smazat úkol
[<Fact>]
let ``Dev nesmí mazat úkoly`` () =
    let message = assertDenied dev (TaskCmd(DeleteTask "t-api"))
    Assert.Equal("Nedostatečná oprávnění: pouze PM může mazat úkoly", message)

[<Fact>]
let ``Dev smí přesouvat jen vlastní úkol`` () =
    assertAllowed dev (TaskCmd(MoveTask("t-api", 1, 3)))
    assertDenied dev (TaskCmd(MoveTask("t-infra", 1, 3))) |> ignore

// ── Dev: osoby a kapacita ───────────────────────────────────────────────────

[<Fact>]
let ``Dev nesmí spravovat osoby`` () =
    assertDenied dev (PeopleCmd(AddPerson(person "os-novy" null "Nový" "FE")))
    |> ignore

    assertDenied dev (PeopleCmd(UpdatePerson(petraPersonId, emptyPersonFields)))
    |> ignore

    assertDenied dev (PeopleCmd(DeletePerson janPersonId)) |> ignore

[<Fact>]
let ``Dev smí editovat vlastní alokaci a nesmí cizí`` () =
    assertAllowed dev (PeopleCmd(UpdateAlloc(petraPersonId, 2, 80.0)))
    let message = assertDenied dev (PeopleCmd(UpdateAlloc(janPersonId, 2, 80.0)))
    Assert.Contains("vlastní alokaci", message)

// ── Dev: rizika, ADO, import ────────────────────────────────────────────────

// @scenario: role-permissions.feature > PM může přidat riziko, Dev pouze číst
[<Fact>]
let ``Dev nesmí spravovat rizika ani příležitosti`` () =
    assertDenied dev (RiskCmd(AddRisk(risk "r1"))) |> ignore
    assertDenied dev (RiskCmd(DeleteRisk "r1")) |> ignore

    assertDenied dev (RiskCmd(AddOpportunity { Id = "o1"; Title = "T"; Detail = "" }))
    |> ignore

[<Fact>]
let ``Dev nesmí konfigurovat ani spouštět ADO sync`` () =
    let message = assertDenied dev (AdoCmd(AdoSaveConfig adoConfig))
    Assert.Equal("Nedostatečná oprávnění: ADO konfigurace je pouze pro PM", message)
    assertDenied dev (AdoCmd(AdoSavePat "tajny-token")) |> ignore
    assertDenied dev (AdoCmd AdoRunSync) |> ignore

[<Fact>]
let ``Dev nesmí importovat projekt`` () =
    assertDenied dev (SessionCmd(FullStateImport(forUser petraId state))) |> ignore

// ── Dev: přílohy, KB, osobní nástroje ───────────────────────────────────────

[<Fact>]
let ``Dev smí nahrát přílohu, ale ne ji smazat`` () =
    assertAllowed dev (FileCmd(AddFile(file "f3" petraId)))
    assertDenied dev (FileCmd(DeleteFile "f1")) |> ignore

[<Fact>]
let ``Dev smí editovat poznámku jen u vlastní přílohy`` () =
    assertAllowed dev (FileCmd(UpdateFileNote("f2", "Podklad k API")))
    assertDenied dev (FileCmd(UpdateFileNote("f1", "Podklad k API"))) |> ignore

[<Fact>]
let ``Dev smí spravovat KB stránky, TODO i připomínky`` () =
    assertAllowed dev (KnowledgeCmd(AddKbPage(kbPage "k1")))
    assertAllowed dev (KnowledgeCmd(DeleteKbPage "k1"))
    assertAllowed dev (PersonalCmd(AddTodo(todo "d1")))
    assertAllowed dev (PersonalCmd(DeleteReminder "r1"))

[<Fact>]
let ``Dev smí hlásit presence`` () =
    assertAllowed dev (SessionCmd(UpdatePresence "gantt"))
