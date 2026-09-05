/// Real-time kolaborace přes `ProjectHub` (PRD-02, ADR-004).
module MSProjectManager.Tests.HubTests

open System
open System.Threading.Tasks
open Xunit
open MSProjectManager.Domain.Types
open MSProjectManager.Domain.State
open MSProjectManager.Domain.Patches
open MSProjectManager.Domain.Commands
open MSProjectManager.Domain.Diffs
open MSProjectManager.Api.Contracts
open MSProjectManager.Tests.TestHost
open MSProjectManager.Tests.ProjectsApiTests

/// Osoby v projektu s vazbou na účty (ADR-006) a jeden úkol Petry.
let private seed (team: Team) (jan: HubClient) =
    task {
        let janPerson =
            {
                Id = "os-jan"
                UserId = team.Jan.User.UserId
                Name = "Jan Novák"
                Role = "AR"
                Color = "#4f9cf9"
                WeekAlloc = [ 100.0; 100.0; 100.0; 100.0 ]
            }

        let petraPerson =
            { janPerson with
                Id = "os-petra"
                UserId = team.Petra.User.UserId
                Name = "Petra Kolářová"
                Role = "BE"
            }

        let apiTask =
            {
                Id = "t-api"
                P = "os-petra"
                Name = "Refaktoring API vrstvy"
                Cat = "obecne"
                S = 1
                E = 4
                Md = 15.0
                Progress = 0
                Desc = ""
                Links = []
                AdoNotes = None
                UpdatedBy = None
                UpdatedAt = None
            }

        do! jan.Send(team.ProjectId, PeopleCmd(AddPerson janPerson))
        do! jan.Send(team.ProjectId, PeopleCmd(AddPerson petraPerson))
        do! jan.Send(team.ProjectId, TaskCmd(AddTask apiTask))
        jan.ClearDiffs()
    }

/// Připojí oba uživatele do projektu a nechá je připravené k testu.
let private withHubs (run: Team * HubClient * HubClient -> Task<unit>) =
    withTeam (fun team ->
        task {
            use! jan = connectHub team.App team.Jan
            use! petra = connectHub team.App team.Petra
            let! _ = jan.Join team.ProjectId
            let! _ = petra.Join team.ProjectId
            do! seed team jan
            petra.ClearDiffs()
            jan.ClearPresence()
            petra.ClearPresence()
            do! run (team, jan, petra)
        }
    )

// @scenario: real-time-collaboration.feature > Změna jednoho uživatele je viditelná druhému v reálném čase
[<Fact>]
let ``přesun úkolu dorazí druhému uživateli`` () =
    withHubs (fun (team, jan, petra) ->
        task {
            do! jan.Send(team.ProjectId, TaskCmd(MoveTask("t-api", 2, 5)))

            let! diff =
                waitForDiff
                    petra
                    (fun diff ->
                        match diff with
                        | TaskUpdated("t-api", fields) -> fields.S = Some 2 && fields.E = Some 5
                        | _ -> false
                    )

            Assert.NotNull(box diff)
            let! state = petra.FullState team.ProjectId
            let moved = state.Tasks |> List.find (fun item -> item.Id = "t-api")
            Assert.Equal(2, moved.S)
        }
    )

// @scenario: real-time-collaboration.feature > Změna progress je okamžitě viditelná
[<Fact>]
let ``progress od Dev uživatele vidí PM`` () =
    withHubs (fun (team, jan, petra) ->
        task {
            do! petra.Send(team.ProjectId, TaskCmd(UpdateProgress("t-api", 50)))

            let! _ =
                waitForDiff
                    jan
                    (fun diff ->
                        match diff with
                        | TaskUpdated("t-api", fields) -> fields.Progress = Some 50
                        | _ -> false
                    )

            ()
        }
    )

// @scenario: real-time-collaboration.feature > Přidání nového úkolu je viditelné všem
[<Fact>]
let ``nový úkol se objeví oběma`` () =
    withHubs (fun (team, jan, petra) ->
        task {
            let review =
                {
                    Id = "t-review"
                    P = "os-jan"
                    Name = "Code review setup"
                    Cat = "obecne"
                    S = 1
                    E = 1
                    Md = 2.0
                    Progress = 0
                    Desc = ""
                    Links = []
                    AdoNotes = None
                    UpdatedBy = None
                    UpdatedAt = None
                }

            do! jan.Send(team.ProjectId, TaskCmd(AddTask review))

            let! _ =
                waitForDiff
                    petra
                    (fun diff ->
                        match diff with
                        | TaskAdded added -> added.Name = "Code review setup"
                        | _ -> false
                    )

            ()
        }
    )

// @scenario: real-time-collaboration.feature > Presence — zobrazení kdo je v projektu
[<Fact>]
let ``presence obsahuje oba připojené uživatele`` () =
    withHubs (fun (team, jan, _) ->
        task {
            do! jan.Send(team.ProjectId, SessionCmd(UpdatePresence "gantt"))

            let! ok = waitUntil (fun () -> jan.Presence |> List.exists (fun entries -> entries |> List.length = 2))

            Assert.True(ok, "presence neobsahovala oba uživatele")
            let latest = jan.Presence |> List.last
            Assert.Contains(latest, (fun entry -> entry.DisplayName = "Petra Kolářová"))
            Assert.Contains(latest, (fun entry -> entry.DisplayName = "Jan Novák"))
        }
    )

// @scenario: real-time-collaboration.feature > Presence se aktualizuje při změně záložky
[<Fact>]
let ``změna záložky se propíše do presence`` () =
    withHubs (fun (team, jan, petra) ->
        task {
            do! jan.Send(team.ProjectId, SessionCmd(UpdatePresence "kapacita"))

            let! ok =
                waitUntil (fun () ->
                    petra.Presence
                    |> List.exists (fun entries ->
                        entries
                        |> List.exists (fun entry -> entry.DisplayName = "Jan Novák" && entry.View = "kapacita")
                    )
                )

            Assert.True(ok, "změna view nedorazila")
        }
    )

// @scenario: real-time-collaboration.feature > Presence se aktualizuje při odpojení
[<Fact>]
let ``odpojený uživatel z presence zmizí`` () =
    withHubs (fun (team, jan, petra) ->
        task {
            do! jan.StopAsync()

            let! ok =
                waitUntil (fun () ->
                    petra.Presence
                    |> List.exists (fun entries ->
                        entries |> List.forall (fun entry -> entry.DisplayName <> "Jan Novák")
                    )
                )

            Assert.True(ok, "presence po odpojení nezmizela")
        }
    )

// @scenario: real-time-collaboration.feature > Conflict při simultánní editaci stejného pole — last-write-wins
[<Fact>]
let ``souběžná změna stejného pole končí konzistentně`` () =
    withHubs (fun (team, jan, petra) ->
        task {
            let md value =
                TaskCmd(UpdateTask("t-api", { emptyTaskFields with Md = Some value }))

            let first = jan.Send(team.ProjectId, md 20.0)
            let second = petra.Send(team.ProjectId, md 18.0)
            do! Task.WhenAll [| first; second |]

            let! janState = jan.FullState team.ProjectId
            let! petraState = petra.FullState team.ProjectId
            let janMd = (janState.Tasks |> List.find (fun item -> item.Id = "t-api")).Md
            let petraMd = (petraState.Tasks |> List.find (fun item -> item.Id = "t-api")).Md
            // Actor je sekvenční: vyhraje jeden z commandů a oba vidí totéž.
            Assert.Equal(janMd, petraMd)
            Assert.Contains(janMd, [ 18.0; 20.0 ])
        }
    )

// @scenario: real-time-collaboration.feature > Dva uživatelé editují různá pole stejného úkolu — bez konfliktu
[<Fact>]
let ``různá pole stejného úkolu se nepřepíší`` () =
    withHubs (fun (team, jan, petra) ->
        task {
            do!
                jan.Send(
                    team.ProjectId,
                    TaskCmd(
                        UpdateTask(
                            "t-api",
                            { emptyTaskFields with
                                Name = Some "API Refactoring"
                            }
                        )
                    )
                )

            do! petra.Send(team.ProjectId, TaskCmd(UpdateProgress("t-api", 75)))

            let! state = petra.FullState team.ProjectId
            let updated = state.Tasks |> List.find (fun item -> item.Id = "t-api")
            Assert.Equal("API Refactoring", updated.Name)
            Assert.Equal(75, updated.Progress)
        }
    )

// @scenario: real-time-collaboration.feature > Reconnect po výpadku sítě
[<Fact>]
let ``po vyžádání full_state má klient aktuální stav`` () =
    withHubs (fun (team, jan, petra) ->
        task {
            let migration =
                {
                    Id = "t-db"
                    P = ""
                    Name = "Database migration"
                    Cat = "obecne"
                    S = 1
                    E = 2
                    Md = 3.0
                    Progress = 0
                    Desc = ""
                    Links = []
                    AdoNotes = None
                    UpdatedBy = None
                    UpdatedAt = None
                }

            do! petra.Send(team.ProjectId, TaskCmd(AddTask migration))
            let! state = jan.FullState team.ProjectId
            Assert.Contains(state.Tasks, (fun item -> item.Name = "Database migration"))
        }
    )

// @scenario: role-permissions.feature > Server odmítne neautorizovaný command od Dev uživatele
[<Fact>]
let ``neautorizovaný command dostane error diff a nic nezmění`` () =
    withHubs (fun (team, jan, petra) ->
        task {
            do!
                petra.Send(
                    team.ProjectId,
                    ProjectMetaCmd(
                        UpdateProject
                            { emptyProjectFields with
                                Name = Some "Hack"
                            }
                    )
                )

            let! diff =
                waitForDiff
                    petra
                    (fun diff ->
                        match diff with
                        | ErrorOccurred _ -> true
                        | _ -> false
                    )

            match diff with
            | ErrorOccurred(message, commandType) ->
                Assert.Equal("Nedostatečná oprávnění: pouze PM může editovat metadata projektu", message)
                Assert.Equal("update_project", commandType)
            | other -> failwith $"neočekávaný diff: {other}"

            let! state = jan.FullState team.ProjectId
            Assert.Equal("Backend refaktoring", state.Project.Name)
            // PM žádný diff o pokusu nedostal.
            Assert.DoesNotContain(
                jan.Diffs,
                (fun diff ->
                    match diff with
                    | ProjectUpdated _ -> true
                    | _ -> false
                )
            )
        }
    )

// @scenario: role-permissions.feature > Dev může editovat vlastní alokaci v Kapacitě
[<Fact>]
let ``Dev změní vlastní alokaci a PM to vidí`` () =
    withHubs (fun (team, jan, petra) ->
        task {
            do! petra.Send(team.ProjectId, PeopleCmd(UpdateAlloc("os-petra", 2, 80.0)))

            let! _ =
                waitForDiff
                    jan
                    (fun diff ->
                        match diff with
                        | AllocUpdated("os-petra", 2, 80.0) -> true
                        | _ -> false
                    )

            ()
        }
    )

// @scenario: role-permissions.feature > Dev nemůže editovat cizí alokaci
[<Fact>]
let ``Dev nesmí sáhnout na cizí alokaci`` () =
    withHubs (fun (team, _, petra) ->
        task {
            do! petra.Send(team.ProjectId, PeopleCmd(UpdateAlloc("os-jan", 2, 10.0)))

            let! diff =
                waitForDiff
                    petra
                    (fun diff ->
                        match diff with
                        | ErrorOccurred _ -> true
                        | _ -> false
                    )

            match diff with
            | ErrorOccurred(message, _) -> Assert.Contains("Nedostatečná oprávnění", message)
            | other -> failwith $"neočekávaný diff: {other}"
        }
    )

// @scenario: role-permissions.feature > Dev může editovat vlastní úkol
[<Fact>]
let ``Dev upraví vlastní úkol a změna je vidět PM`` () =
    withHubs (fun (team, jan, petra) ->
        task {
            do!
                petra.Send(
                    team.ProjectId,
                    TaskCmd(
                        UpdateTask(
                            "t-api",
                            { emptyTaskFields with
                                Name = Some "API refaktoring — fáze 1"
                            }
                        )
                    )
                )

            let! _ =
                waitForDiff
                    jan
                    (fun diff ->
                        match diff with
                        | TaskUpdated("t-api", fields) -> fields.Name = Some "API refaktoring — fáze 1"
                        | _ -> false
                    )

            ()
        }
    )

[<Fact>]
let ``TODO se nebroadcastuje ostatním členům`` () =
    withHubs (fun (team, jan, petra) ->
        task {
            let todo =
                {
                    Id = "d1"
                    Title = "Soukromá poznámka"
                    Completed = false
                    CreatedAt = "2026-01-05T08:00:00Z"
                }

            do! petra.Send(team.ProjectId, PersonalCmd(AddTodo todo))

            let! _ =
                waitForDiff
                    petra
                    (fun diff ->
                        match diff with
                        | TodoAdded _ -> true
                        | _ -> false
                    )

            let! janState = jan.FullState team.ProjectId
            Assert.Empty janState.Todos

            Assert.DoesNotContain(
                jan.Diffs,
                (fun diff ->
                    match diff with
                    | TodoAdded _ -> true
                    | _ -> false
                )
            )
        }
    )

[<Fact>]
let ``nečlen projektu se do skupiny nedostane`` () =
    withHubs (fun (team, _, _) ->
        task {
            let! outsider = createUser team.App team.Admin ("kdosi", "Kdosi Cizí", "Heslo1234")
            use! hub = connectHub team.App outsider
            let! failure = Assert.ThrowsAnyAsync<exn>(fun () -> hub.Join team.ProjectId :> System.Threading.Tasks.Task)
            Assert.Contains("Nejste členem", failure.Message)
        }
    )

// @scenario: role-permissions.feature > Odebrání člena z projektu zruší jeho vazbu na osobu
[<Fact>]
let ``odebrání člena zruší vazbu jeho osoby na účet`` () =
    withHubs (fun (team, jan, _) ->
        task {
            // Členství není v `AppState`, takže vazbu nemůže zrušit reducer —
            // dělá to REST vrstva přes actor, aby změna dorazila jako diff.
            let! response =
                team.Jan.Client.DeleteAsync $"/api/projects/{team.ProjectId}/members/{team.Petra.User.UserId}"

            Assert.Equal(System.Net.HttpStatusCode.NoContent, response.StatusCode)

            let! _ =
                waitForDiff
                    jan
                    (fun diff ->
                        match diff with
                        | PersonUpdated("os-petra", fields) -> fields.UserId = Some null
                        | _ -> false
                    )

            let! state = jan.FullState team.ProjectId
            let petraPerson = state.People |> List.find (fun person -> person.Id = "os-petra")
            Assert.Null petraPerson.UserId

            // Osoba v projektu zůstává — odchod z týmu není smazání kapacity.
            Assert.Equal("Petra Kolářová", petraPerson.Name)
        }
    )

// ── Archivovaný projekt je jen ke čtení ─────────────────────────────────────

let private archive (team: Team) =
    team.Jan.Client.PostAsync($"/api/projects/{team.ProjectId}/archive", null)

// @scenario: project-management.feature > Archivovaný projekt je jen ke čtení
[<Fact>]
let ``archivovaný projekt odmítne mutující command`` () =
    withHubs (fun (team, jan, _) ->
        task {
            let! archived = archive team
            Assert.Equal(System.Net.HttpStatusCode.NoContent, archived.StatusCode)

            do! jan.Send(team.ProjectId, TaskCmd(UpdateProgress("t-api", 80)))

            let! error =
                waitForDiff
                    jan
                    (fun diff ->
                        match diff with
                        | ErrorOccurred(message, "update_progress") -> message.Contains "archivovaný"
                        | _ -> false
                    )

            Assert.NotNull(box error)

            // Čtení zůstává — kvůli tomu se archivuje místo mazání.
            let! state = jan.FullState team.ProjectId
            let unchanged = state.Tasks |> List.find (fun item -> item.Id = "t-api")
            Assert.Equal(0, unchanged.Progress)
        }
    )

// @scenario: project-management.feature > Sledování ostatních v archivovaném projektu funguje dál
[<Fact>]
let ``presence v archivovaném projektu funguje dál`` () =
    withHubs (fun (team, jan, petra) ->
        task {
            let! _ = archive team

            // Presence není obsah projektu — kdyby ji zámek archivu chytil,
            // zmizely by v archivu avatary ostatních čtenářů.
            do! petra.Send(team.ProjectId, SessionCmd(UpdatePresence "gantt"))

            let! ok =
                waitUntil (fun () ->
                    jan.Presence
                    |> List.exists (fun entries ->
                        entries
                        |> List.exists (fun entry -> entry.DisplayName = "Petra Kolářová" && entry.View = "gantt")
                    )
                )

            Assert.True(ok, "presence se v archivovaném projektu neaktualizovala")
        }
    )

// @scenario: project-management.feature > Vrácení z archivu zápis zase povolí
[<Fact>]
let ``vrácení z archivu zápis zase povolí`` () =
    withHubs (fun (team, jan, _) ->
        task {
            let! _ = archive team
            let! restored = team.Jan.Client.PostAsync($"/api/projects/{team.ProjectId}/unarchive", null)
            Assert.Equal(System.Net.HttpStatusCode.NoContent, restored.StatusCode)

            // Bez invalidace cache v `setArchived` by tenhle command spadl na
            // zapamatované „archivovaný", i když projekt už v archivu není.
            do! jan.Send(team.ProjectId, TaskCmd(UpdateProgress("t-api", 80)))

            let! _ =
                waitForDiff
                    jan
                    (fun diff ->
                        match diff with
                        | TaskUpdated("t-api", fields) -> fields.Progress = Some 80
                        | _ -> false
                    )

            let! state = jan.FullState team.ProjectId
            let updated = state.Tasks |> List.find (fun item -> item.Id = "t-api")
            Assert.Equal(80, updated.Progress)
        }
    )

// ── Deaktivace a osiřelá práce (auth.feature) ───────────────────────────────
//
// Sedí tady, ne v `AuthApiTests`: kontrola potřebuje projekt s osobou
// navázanou na účet a s úkolem, což vyrobí `withHubs` přes reducer. `AuthApiTests`
// se navíc kompiluje dřív než `ProjectsApiTests`, odkud `withTeam` pochází.

// @scenario: auth.feature > Deaktivace upozorní na osiřelé úkoly
[<Fact>]
let ``deaktivace upozorní na osiřelé úkoly`` () =
    withHubs (fun (team, _, _) ->
        task {
            // Actor persistuje po ticku; kontrola čte `state_json` mimo actory
            // (ADR-002), takže bez flushe by viděla prázdný projekt.
            do! team.App.FlushProjects()

            let! response = team.Admin.Client.PostAsync($"/admin/users/{team.Petra.User.UserId}/deactivate", null)

            Assert.Equal(System.Net.HttpStatusCode.OK, response.StatusCode)
            let! summary = readJson<UserSummary> response

            Assert.False summary.IsActive
            Assert.Contains("Backend refaktoring", summary.OrphanedIn)
        }
    )

// @scenario: auth.feature > Deaktivace účtu bez přiřazené práce nic nehlásí
[<Fact>]
let ``deaktivace účtu bez přiřazené práce nic nehlásí`` () =
    withHubs (fun (team, _, _) ->
        task {
            do! team.App.FlushProjects()
            let! outsider = createUser team.App team.Admin ("kdosi", "Kdosi Cizí", "Heslo1234")

            let! response = team.Admin.Client.PostAsync($"/admin/users/{outsider.User.UserId}/deactivate", null)

            Assert.Equal(System.Net.HttpStatusCode.OK, response.StatusCode)
            let! summary = readJson<UserSummary> response

            Assert.False summary.IsActive
            Assert.Empty summary.OrphanedIn
        }
    )

// ── Přehled napříč projekty (PRD-08, ADR-015) ───────────────────────────────

let private workload (session: Session) =
    task {
        let! response = session.Client.GetAsync "/api/me/workload"
        return! readJson<WorkloadResponse> response
    }

// @scenario: my-work.feature > Úkoly ze všech projektů na jedné obrazovce
// @scenario: my-work.feature > Cizí úkoly se do přehledu nedostanou
[<Fact>]
let ``přehled vrací jen vlastní úkoly přihlášeného`` () =
    withHubs (fun (team, jan, _) ->
        task {
            // `seed` dal `t-api` Petře a `withHubs` osoby spároval s účty.
            let jansTask =
                {
                    Id = "t-jan"
                    P = "os-jan"
                    Name = "Návrh architektury"
                    Cat = "obecne"
                    S = 1
                    E = 2
                    Md = 4.0
                    Progress = 0
                    Desc = ""
                    Links = []
                    AdoNotes = None
                    UpdatedBy = None
                    UpdatedAt = None
                }

            do! jan.Send(team.ProjectId, TaskCmd(AddTask jansTask))
            do! team.App.FlushProjects()

            let! petrasWork = workload team.Petra
            let! jansWork = workload team.Jan

            Assert.Equal("t-api", (List.exactlyOne petrasWork.Tasks).TaskId)
            Assert.Equal("Backend refaktoring", (List.exactlyOne petrasWork.Tasks).ProjectName)
            Assert.Equal("t-jan", (List.exactlyOne jansWork.Tasks).TaskId)
        }
    )

// @scenario: my-work.feature > Úkoly jsou seskupené podle kalendářních týdnů
[<Fact>]
let ``přehled převádí čísla týdnů na kalendářní data`` () =
    withHubs (fun (team, jan, _) ->
        task {
            // Projekt začíná ve čtvrtek; W1 je pondělí toho týdne (ADR-014).
            let dates =
                { emptyProjectFields with
                    StartDate = Some "2026-01-08"
                    EndDate = Some "2026-06-26"
                }

            do! jan.Send(team.ProjectId, ProjectMetaCmd(UpdateProject dates))
            do! team.App.FlushProjects()

            let! result = workload team.Petra
            let apiTask = List.exactlyOne result.Tasks

            // `t-api` má S=1, E=4 → pondělí 5. 1. až pátek čtvrtého týdne.
            Assert.Equal(Some "2026-01-05", apiTask.FromIso)
            Assert.Equal(Some "2026-01-30", apiTask.ToIso)
        }
    )

// @scenario: my-work.feature > Archivované projekty se do přehledu nepočítají
[<Fact>]
let ``archivovaný projekt v přehledu není`` () =
    withHubs (fun (team, _, _) ->
        task {
            do! team.App.FlushProjects()
            let! before = workload team.Petra
            Assert.NotEmpty before.Tasks

            let! _ = archive team
            let! after = workload team.Petra

            Assert.Empty after.Tasks
        }
    )

// @scenario: my-work.feature > Bez spárované osoby přehled vysvětlí, co chybí
[<Fact>]
let ``bez spárované osoby je přehled prázdný`` () =
    withHubs (fun (team, jan, _) ->
        task {
            // Zrušení vazby — od té chvíle uživatel nemá „vlastní" nic (ADR-006).
            let unlink =
                { emptyPersonFields with
                    UserId = Some null
                }

            do! jan.Send(team.ProjectId, PeopleCmd(UpdatePerson("os-petra", unlink)))
            do! team.App.FlushProjects()

            let! result = workload team.Petra
            Assert.Empty result.Tasks
        }
    )

// @scenario: my-work.feature > Přehled přiznává, že může být pozadu
[<Fact>]
let ``přehled hlásí, o kolik může být pozadu`` () =
    withHubs (fun (team, _, _) ->
        task {
            let! result = workload team.Petra
            // Actor persistuje po ticku (ADR-015) — hodnota musí dorazit
            // klientovi, aby ji obrazovka mohla říct nahlas.
            Assert.Equal(5, result.StaleAfterSeconds)
        }
    )

// ── Velikost zprávy (import reálného projektu) ──────────────────────────────

// @scenario: project-management.feature > Import velkého ZIPu s přílohami
[<Fact>]
let ``full_state_import projde i s payloadem přes výchozí limit SignalR`` () =
    withHubs (fun (team, jan, _) ->
        task {
            // Výchozí `MaximumReceiveMessageSize` je 32 kB a stav se posílá jako
            // JEDEN příkaz (ADR-005), takže reálný projekt ho přesáhne — u vzorku
            // z provozu ~150 kB. Nad limitem SignalR spojení ukončí, což se
            // navenek neprojeví jako odmítnutý příkaz, ale jako spadlé spojení.
            let! before = jan.FullState team.ProjectId

            let bulky =
                { before with
                    KbPages =
                        [
                            for index in 1..40 ->
                                {
                                    Id = $"kb-{index}"
                                    Title = $"Stránka {index}"
                                    Content = String.replicate 200 "Dlouhý text dokumentace. "
                                    CreatedAt = "2026-01-05T08:00:00Z"
                                    UpdatedAt = "2026-01-05T08:00:00Z"
                                    Tags = None
                                }
                        ]
                }

            do! jan.Send(team.ProjectId, SessionCmd(FullStateImport bulky))

            // `FullState` se doručuje per-connection (`ReceiveFullState`), ne
            // jako diff — čeká se proto na projevený stav.
            let! applied =
                waitUntil (fun () ->
                    let snapshot =
                        jan.FullState team.ProjectId |> Async.AwaitTask |> Async.RunSynchronously

                    List.length snapshot.KbPages = 40
                )

            Assert.True(applied, "import velkého stavu se neprojevil")
        }
    )
