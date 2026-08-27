/// Projekty a správa členů přes REST (PRD-00, FR-ROLE-02).
module MSProjectManager.Tests.ProjectsApiTests

open System.Net
open System.Net.Http.Json
open System.Threading.Tasks
open Xunit
open MSProjectManager.Domain.State
open MSProjectManager.Api.Contracts
open MSProjectManager.Tests.TestHost

/// Projekt „Backend refaktoring" s PM jan.novak a Dev petra.kolarova —
/// background sdílený většinou feature souborů.
[<NoEquality; NoComparison>]
type Team =
    {
        App: TestApp
        Admin: Session
        Jan: Session
        Petra: Session
        ProjectId: string
    }

let createProject (session: Session) (name: string) =
    task {
        let! response = session.Client.PostAsJsonAsync("/api/projects", { Name = name })
        let! project = readJson<ProjectSummaryResponse> response
        return project.Id
    }

let addMember (owner: Session) (projectId: string) (userId: string, role: string) =
    owner.Client.PostAsJsonAsync($"/api/projects/{projectId}/members", { UserId = userId; Role = role })

/// Připraví tým a projekt a spustí nad ním test.
let withTeam (run: Team -> Task<unit>) =
    task {
        use app = new TestApp()
        let! admin = setupAdmin app "admin" "Admin5678"
        let! jan = createUser app admin ("jan.novak", "Jan Novák", "Heslo1234")
        let! petra = createUser app admin ("petra.kolarova", "Petra Kolářová", "Heslo1234")
        let! projectId = createProject jan "Backend refaktoring"
        let! _ = addMember jan projectId (petra.User.UserId, "dev")

        do!
            run
                {
                    App = app
                    Admin = admin
                    Jan = jan
                    Petra = petra
                    ProjectId = projectId
                }
    }

[<Fact>]
let ``zakladatel projektu je jeho PM a vidí ho v seznamu`` () =
    withTeam (fun team ->
        task {
            let! projects = getJson<ProjectSummaryResponse[]> team.Jan.Client "/api/projects"
            let project = Assert.Single projects
            Assert.Equal("Backend refaktoring", project.Name)
            Assert.Equal(Pm, project.Role)
        }
    )

[<Fact>]
let ``přidaný člen vidí projekt s rolí dev`` () =
    withTeam (fun team ->
        task {
            let! projects = getJson<ProjectSummaryResponse[]> team.Petra.Client "/api/projects"
            let project = Assert.Single projects
            Assert.Equal(Dev, project.Role)
        }
    )

[<Fact>]
let ``cizí uživatel projekt v seznamu nemá`` () =
    withTeam (fun team ->
        task {
            let! outsider = createUser team.App team.Admin ("kdosi", "Kdosi Cizí", "Heslo1234")
            let! projects = getJson<ProjectSummaryResponse[]> outsider.Client "/api/projects"
            Assert.Empty projects
        }
    )

[<Fact>]
let ``PM vidí členy projektu i s rolemi`` () =
    withTeam (fun team ->
        task {
            let! members = getJson<MemberResponse[]> team.Jan.Client $"/api/projects/{team.ProjectId}/members"
            Assert.Equal(2, members.Length)
            Assert.Contains(members, (fun entry -> entry.DisplayName = "Petra Kolářová" && entry.Role = Dev))
            Assert.Contains(members, (fun entry -> entry.DisplayName = "Jan Novák" && entry.Role = Pm))
        }
    )

[<Fact>]
let ``PM dostane nabídku uživatelů, kteří ještě nejsou členy`` () =
    task {
        use app = new TestApp()
        let! admin = setupAdmin app "admin" "Admin5678"
        let! jan = createUser app admin ("jan.novak", "Jan Novák", "Heslo1234")
        let! petra = createUser app admin ("petra.kolarova", "Petra Kolářová", "Heslo1234")
        let! _ = createUser app admin ("tomas.vondracek", "Tomáš Vondráček", "Heslo1234")
        let! projectId = createProject jan "Backend refaktoring"
        let! _ = addMember jan projectId (petra.User.UserId, "dev")

        let! candidates = getJson<MemberCandidate[]> jan.Client $"/api/projects/{projectId}/candidates"

        // Členové v nabídce být nesmí, zbytek aktivních účtů ano.
        let names = candidates |> Array.map (fun entry -> entry.DisplayName)
        Assert.Contains("Tomáš Vondráček", names)
        Assert.DoesNotContain("Petra Kolářová", names)
        Assert.DoesNotContain("Jan Novák", names)
    }

[<Fact>]
let ``Dev nabídku uživatelů nedostane`` () =
    withTeam (fun team ->
        task {
            let! response = team.Petra.Client.GetAsync $"/api/projects/{team.ProjectId}/candidates"
            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode)
        }
    )

// Klientský `ProjectSummary` roli na projektu nenese, takže LandingPage
// tlačítko schovat neumí — a podle ADR-006 je UI stejně jen UX vrstva.
// Podstatou scénáře je, že server smazání odmítne.
// @scenario: project-management.feature > Dev uživatel nemůže smazat projekt
[<Fact>]
let ``Dev nesmí přidat člena ani smazat projekt`` () =
    withTeam (fun team ->
        task {
            let! outsider = createUser team.App team.Admin ("kdosi", "Kdosi Cizí", "Heslo1234")
            let! added = addMember team.Petra team.ProjectId (outsider.User.UserId, "dev")
            Assert.Equal(HttpStatusCode.Forbidden, added.StatusCode)

            let! deleted = team.Petra.Client.DeleteAsync $"/api/projects/{team.ProjectId}"
            Assert.Equal(HttpStatusCode.Forbidden, deleted.StatusCode)
        }
    )

[<Fact>]
let ``PM nesmí odebrat sám sebe`` () =
    withTeam (fun team ->
        task {
            let! response =
                team.Jan.Client.DeleteAsync $"/api/projects/{team.ProjectId}/members/{team.Jan.User.UserId}"

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode)
            let! body = readJson<ApiError> response
            Assert.Contains("Sám sebe", body.Message)
        }
    )

[<Fact>]
let ``posledního PM nelze degradovat na dev`` () =
    withTeam (fun team ->
        task {
            let! response =
                team.Jan.Client.PutAsJsonAsync(
                    $"/api/projects/{team.ProjectId}/members/{team.Jan.User.UserId}",
                    { Role = "dev" }
                )

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode)
            let! body = readJson<ApiError> response
            Assert.Equal("Projekt musí mít alespoň jednoho Project Managera", body.Message)
        }
    )

[<Fact>]
let ``PM povýší člena a pak může odejít`` () =
    withTeam (fun team ->
        task {
            let! promoted =
                team.Jan.Client.PutAsJsonAsync(
                    $"/api/projects/{team.ProjectId}/members/{team.Petra.User.UserId}",
                    { Role = "pm" }
                )

            Assert.Equal(HttpStatusCode.NoContent, promoted.StatusCode)

            let! removed =
                team.Petra.Client.DeleteAsync $"/api/projects/{team.ProjectId}/members/{team.Jan.User.UserId}"

            Assert.Equal(HttpStatusCode.NoContent, removed.StatusCode)
        }
    )

[<Fact>]
let ``smazaný projekt zmizí i členům`` () =
    withTeam (fun team ->
        task {
            // Mazání je dvoukrokové: nejdřív archiv, teprve pak trvale pryč.
            let! archived = team.Jan.Client.PostAsync($"/api/projects/{team.ProjectId}/archive", null)
            Assert.Equal(HttpStatusCode.NoContent, archived.StatusCode)

            let! deleted = team.Jan.Client.DeleteAsync $"/api/projects/{team.ProjectId}"
            Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode)
            let! projects = getJson<ProjectSummaryResponse[]> team.Petra.Client "/api/projects"
            Assert.Empty projects
        }
    )
