/// Quick Notes přes REST (PRD-04, FR-QN-08).
///
/// Těžiště je soukromí: poznámky jsou per-user a scénář „Poznámky jiného
/// uživatele nejsou viditelné" se z frontendu otestovat nedá — klient jen
/// vykreslí, co dostane. Vlastnictví drží server a hlídá se tady.
module MSProjectManager.Tests.QuickNotesApiTests

open System.Net
open System.Net.Http.Json
open System.Threading.Tasks
open Xunit
open MSProjectManager.Api.Contracts
open MSProjectManager.Tests.TestHost

[<NoEquality; NoComparison>]
type Pair =
    {
        App: TestApp
        Jan: Session
        Petra: Session
    }

let private addNote (session: Session) (content: string) =
    task {
        let! response =
            session.Client.PostAsJsonAsync(
                "/api/quick-notes",
                {
                    // `Id = null` = ať si ho vygeneruje server. Klientem
                    // posílané id používá jen offline fronta (offline.feature).
                    Id = null
                    Content = content
                    LinkedProjectId = null
                }
            )

        return! readJson<NoteResponse> response
    }

let private notesOf (session: Session) =
    getJson<NoteResponse list> session.Client "/api/quick-notes"

let private withPair (run: Pair -> Task<unit>) =
    task {
        use app = new TestApp()
        let! admin = setupAdmin app "admin" "Admin5678"
        let! jan = createUser app admin ("jan.novak", "Jan Novák", "Heslo1234")
        let! petra = createUser app admin ("petra.kolarova", "Petra Kolářová", "Heslo1234")

        do! run { App = app; Jan = jan; Petra = petra }
    }

// @scenario: quick-notes.feature > Poznámky jiného uživatele nejsou viditelné
[<Fact>]
let ``uživatel vidí jen vlastní poznámky`` () =
    withPair (fun pair ->
        task {
            let! _ = addNote pair.Petra "Soukromý úkol"
            let! _ = addNote pair.Jan "Poznámka Jana"

            let! janovy = notesOf pair.Jan
            let! petriny = notesOf pair.Petra

            Assert.Equal<string list>([ "Poznámka Jana" ], janovy |> List.map (fun note -> note.Content))
            Assert.Equal<string list>([ "Soukromý úkol" ], petriny |> List.map (fun note -> note.Content))
        }
    )

[<Fact>]
let ``cizí poznámku nelze upravit`` () =
    withPair (fun pair ->
        task {
            let! petrina = addNote pair.Petra "Soukromý úkol"

            let! response =
                pair.Jan.Client.PatchAsJsonAsync(
                    $"/api/quick-notes/{petrina.Id}",
                    {
                        Content = "Přepsáno cizím uživatelem"
                        LinkedProjectId = null
                        ConvertedToTaskId = null
                    }
                )

            Assert.NotEqual(HttpStatusCode.OK, response.StatusCode)

            // Obsah musí zůstat nedotčený, ne jen odpověď nesouhlasná.
            let! petriny = notesOf pair.Petra
            Assert.Equal("Soukromý úkol", (List.head petriny).Content)
        }
    )

[<Fact>]
let ``cizí poznámku nelze smazat`` () =
    withPair (fun pair ->
        task {
            let! petrina = addNote pair.Petra "Soukromý úkol"

            let! response = pair.Jan.Client.DeleteAsync($"/api/quick-notes/{petrina.Id}")

            Assert.NotEqual(HttpStatusCode.NoContent, response.StatusCode)

            let! petriny = notesOf pair.Petra
            Assert.Single petriny |> ignore
        }
    )

[<Fact>]
let ``nepřihlášený uživatel poznámky nedostane`` () =
    task {
        use app = new TestApp()
        let! _ = setupAdmin app "admin" "Admin5678"
        use client = app.CreateClient()

        let! response = client.GetAsync "/api/quick-notes"

        Assert.NotEqual(HttpStatusCode.OK, response.StatusCode)
    }
