/// Vykazování práce přes REST (PRD-10, ADR-017).
///
/// Těžiště je tam, kam klient nedohlédne: soukromí (výkaz je jen můj),
/// invarianta jedněch běžících stopek a validace časů. Klient jen vykreslí,
/// co dostane — pravidla drží server, a proto se ověřují tady.
module MSProjectManager.Tests.WorkLogApiTests

open System
open System.Net
open System.Net.Http.Json
open System.Threading.Tasks
open Xunit
open MSProjectManager.Api.Contracts
open MSProjectManager.Tests.TestHost
open MSProjectManager.Tests.ProjectsApiTests

// Odpovědi se čtou do vlastních záznamů s `| null` místo `option`: testovací
// `HttpClient` serializuje výchozími options, které F# `option` neumí — a
// `Some hodnota` by na nich spadla. Tvar je jinak stejný jako v `Contracts`.
[<CLIMutable>]
type WorkLogView =
    {
        Id: string
        Title: string
        Description: string
        ProjectId: string | null
        StartedAt: string
        EndedAt: string | null
        Tags: string[] | null
        CreatedAt: string
        UpdatedAt: string
    }

[<CLIMutable>]
type WriteView =
    {
        Entry: WorkLogView
        StoppedPrevious: WorkLogView | null
    }

[<CLIMutable>]
type RunningView = { Running: WorkLogView | null }

[<NoEquality; NoComparison>]
type Pair =
    {
        App: TestApp
        Jan: Session
        Petra: Session
        Admin: Session
    }

let private iso (moment: DateTimeOffset) =
    moment.ToUniversalTime().ToString("o", Globalization.CultureInfo.InvariantCulture)

/// Tvar, který posílá prohlížeč (`Date.toISOString()`) — tedy `Z` a tři
/// desetinná místa, ne kanonický `o` formát serveru.
let private browserIso (moment: DateTimeOffset) =
    moment.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ", Globalization.CultureInfo.InvariantCulture)

let private request (title: string) (startedAt: string) (endedAt: string | null) : WorkLogEntryRequest =
    {
        Id = null
        Title = title
        Description = null
        ProjectId = null
        StartedAt = startedAt
        EndedAt = endedAt
        Tags = null
    }

let private post (session: Session) (body: WorkLogEntryRequest) =
    session.Client.PostAsJsonAsync("/api/worklog", body)

/// Zapíše hotový záznam a vrátí ho; selhání je chyba testu, ne očekávaný stav.
let private addEntry (session: Session) (body: WorkLogEntryRequest) =
    task {
        let! response = post session body

        if response.StatusCode <> HttpStatusCode.OK then
            let! text = response.Content.ReadAsStringAsync()
            failwith $"zápis výkazu selhal: {int response.StatusCode} {text}"

        let! written = readJson<WriteView> response
        return written.Entry
    }

let private entriesOf (session: Session) =
    getJson<WorkLogView[]> session.Client "/api/worklog"

let private runningOf (session: Session) =
    getJson<RunningView> session.Client "/api/worklog/running"

let private withPair (run: Pair -> Task<unit>) =
    task {
        use app = new TestApp()
        let! admin = setupAdmin app "admin" "Admin5678"
        let! jan = createUser app admin ("jan.novak", "Jan Novák", "Heslo1234")
        let! petra = createUser app admin ("petra.kolarova", "Petra Kolářová", "Heslo1234")

        do!
            run
                {
                    App = app
                    Jan = jan
                    Petra = petra
                    Admin = admin
                }
    }

// ── Stopky ──────────────────────────────────────────────────────────────────

// @scenario: worklog.feature > Stopky doplní časy samy
[<Fact>]
let ``start založí běžící záznam a stop mu doplní konec`` () =
    withPair (fun pair ->
        task {
            let start = DateTimeOffset.UtcNow.AddMinutes -30.0
            let! started = addEntry pair.Petra (request "Ladění importu" (browserIso start) null)
            Assert.Null started.EndedAt

            let! before = runningOf pair.Petra
            Assert.Equal(started.Id, (nonNull before.Running).Id)

            let stopMoment = DateTimeOffset.UtcNow
            let! response = pair.Petra.Client.PostAsJsonAsync("/api/worklog/stop", { EndedAt = browserIso stopMoment })
            let! stopped = readJson<WorkLogView> response

            Assert.Equal(started.Id, stopped.Id)
            Assert.NotNull stopped.EndedAt

            let! after = runningOf pair.Petra
            Assert.Null after.Running
        }
    )

// @scenario: worklog.feature > Spuštění nové činnosti ukončí tu předchozí
[<Fact>]
let ``start nové činnosti uzavře předchozí přesně v okamžiku svého začátku`` () =
    withPair (fun pair ->
        task {
            let first = DateTimeOffset.UtcNow.AddHours -2.0
            let second = DateTimeOffset.UtcNow.AddHours -1.0

            let! _ = addEntry pair.Petra (request "Ladění importu" (browserIso first) null)
            let! _ = addEntry pair.Petra (request "Schůzka s klientem" (browserIso second) null)

            let! entries = entriesOf pair.Petra
            let previous = entries |> Array.find (fun entry -> entry.Title = "Ladění importu")

            // Konec předchozí činnosti musí sedět na začátek nové — ne „teď",
            // jinak by mezi záznamy vznikl překryv.
            Assert.Equal(
                DateTimeOffset.Parse(nonNull previous.EndedAt).UtcDateTime,
                DateTimeOffset
                    .Parse(entries |> Array.find (fun e -> e.Title = "Schůzka s klientem") |> _.StartedAt)
                    .UtcDateTime
            )

            let! running = runningOf pair.Petra
            Assert.Equal("Schůzka s klientem", (nonNull running.Running).Title)
        }
    )

// @scenario: worklog.feature > Uživatel se dozví, že mu předchozí činnost skončila
[<Fact>]
let ``odpověď na start nese činnost, kterou ukončil`` () =
    withPair (fun pair ->
        task {
            let! _ =
                addEntry pair.Petra (request "Ladění importu" (browserIso (DateTimeOffset.UtcNow.AddHours -2.0)) null)

            let! response =
                post pair.Petra (request "Schůzka s klientem" (browserIso (DateTimeOffset.UtcNow.AddHours -1.0)) null)

            let! written = readJson<WriteView> response

            Assert.Equal("Ladění importu", (nonNull written.StoppedPrevious).Title)
        }
    )

// @scenario: worklog.feature > Smazání běžícího záznamu zastaví stopky
[<Fact>]
let ``smazání běžícího záznamu zastaví stopky`` () =
    withPair (fun pair ->
        task {
            let! running =
                addEntry
                    pair.Petra
                    (request "Ladění importu" (browserIso (DateTimeOffset.UtcNow.AddMinutes -5.0)) null)

            let! deleted = pair.Petra.Client.DeleteAsync $"/api/worklog/{running.Id}"
            Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode)

            let! after = runningOf pair.Petra
            Assert.Null after.Running
        }
    )

// ── Validace časů ───────────────────────────────────────────────────────────

// @scenario: worklog.feature > Konec před začátkem se neuloží
[<Fact>]
let ``konec před začátkem se odmítne`` () =
    withPair (fun pair ->
        task {
            let start = DateTimeOffset.UtcNow.AddHours -1.0

            let! response = post pair.Petra (request "Pozpátku" (browserIso start) (browserIso (start.AddHours -1.0)))

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode)

            let! entries = entriesOf pair.Petra
            Assert.Empty entries
        }
    )

// @scenario: worklog.feature > Záznam delší než den se neuloží
[<Fact>]
let ``záznam přes třicet hodin se odmítne`` () =
    withPair (fun pair ->
        task {
            let now = DateTimeOffset.UtcNow

            let! response =
                post pair.Petra (request "Zapomenuté stopky" (browserIso (now.AddHours -30.0)) (browserIso now))

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode)
        }
    )

// @scenario: worklog.feature > Konec v budoucnosti se neuloží
[<Fact>]
let ``konec v budoucnosti se odmítne`` () =
    withPair (fun pair ->
        task {
            let now = DateTimeOffset.UtcNow

            let! response = post pair.Petra (request "Zítřejší práce" (browserIso now) (browserIso (now.AddHours 3.0)))

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode)
        }
    )

// @scenario: worklog.feature > Časy uloženého záznamu jde opravit
[<Fact>]
let ``začátek uloženého záznamu jde posunout`` () =
    withPair (fun pair ->
        task {
            let start = DateTimeOffset.UtcNow.AddHours -3.0
            let finish = start.AddHours 1.5

            let! entry = addEntry pair.Petra (request "Code review" (browserIso start) (browserIso finish))

            let posunuty = start.AddMinutes -30.0

            let! response =
                pair.Petra.Client.PutAsJsonAsync(
                    $"/api/worklog/{entry.Id}",
                    { request "Code review" (browserIso posunuty) (browserIso finish) with
                        Id = entry.Id
                    }
                )

            let! updated = readJson<WorkLogView> response

            Assert.Equal(
                2.0,
                (DateTimeOffset.Parse(nonNull updated.EndedAt)
                 - DateTimeOffset.Parse updated.StartedAt)
                    .TotalHours,
                3
            )
        }
    )

// ── Tagy ────────────────────────────────────────────────────────────────────

// @scenario: worklog.feature > Tagy se ukládají ořezané a bez prázdných
[<Fact>]
let ``tagy se ořežou a prázdné vypadnou`` () =
    withPair (fun pair ->
        task {
            let now = DateTimeOffset.UtcNow

            let! entry =
                addEntry
                    pair.Petra
                    { request "Noční zásah" (browserIso (now.AddHours -1.0)) (browserIso now) with
                        Tags = [| " pohotovost "; ""; "   "; "víkend" |]
                    }

            Assert.Equal<string[]>([| "pohotovost"; "víkend" |], nonNull entry.Tags)
        }
    )

// @scenario: worklog.feature > Stejný tag s jinou velikostí písmen je jeden tag
[<Fact>]
let ``tag lišící se jen velikostí písmen se nezdvojí`` () =
    withPair (fun pair ->
        task {
            let now = DateTimeOffset.UtcNow

            let! entry =
                addEntry
                    pair.Petra
                    { request "Noční zásah" (browserIso (now.AddHours -1.0)) (browserIso now) with
                        Tags = [| "Pohotovost"; "pohotovost"; "POHOTOVOST" |]
                    }

            // Zůstává první zadaná varianta — kdyby se tagy převáděly na malá
            // písmena, uživatel by v seznamu nenašel to, co napsal.
            Assert.Equal<string[]>([| "Pohotovost" |], nonNull entry.Tags)
        }
    )

// @scenario: worklog.feature > Víc než deset tagů se odmítne
[<Fact>]
let ``jedenáct tagů se odmítne`` () =
    withPair (fun pair ->
        task {
            let now = DateTimeOffset.UtcNow

            let! response =
                post
                    pair.Petra
                    { request "Přetagováno" (browserIso (now.AddHours -1.0)) (browserIso now) with
                        Tags = Array.init 11 (fun index -> $"tag{index}")
                    }

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode)
        }
    )

// ── Soukromí ────────────────────────────────────────────────────────────────

// @scenario: worklog.feature > Výkazy jiného uživatele nejsou viditelné
[<Fact>]
let ``uživatel vidí jen vlastní výkazy`` () =
    withPair (fun pair ->
        task {
            let now = DateTimeOffset.UtcNow
            let! _ = addEntry pair.Petra (request "Code review" (browserIso (now.AddHours -2.0)) (browserIso now))
            let! _ = addEntry pair.Jan (request "Nasazení" (browserIso (now.AddHours -3.0)) (browserIso now))

            let! petriny = entriesOf pair.Petra
            let! janovy = entriesOf pair.Jan

            Assert.Equal<string list>([ "Code review" ], petriny |> Array.map _.Title |> Array.toList)
            Assert.Equal<string list>([ "Nasazení" ], janovy |> Array.map _.Title |> Array.toList)
        }
    )

// @scenario: worklog.feature > Ani administrátor cizí výkazy nevidí
[<Fact>]
let ``administrátor nemá k cizím výkazům cestu`` () =
    withPair (fun pair ->
        task {
            let now = DateTimeOffset.UtcNow
            let! _ = addEntry pair.Jan (request "Nasazení" (browserIso (now.AddHours -1.0)) (browserIso now))

            // Endpoint bere vlastníka z přihlášení, takže admin vidí svoje —
            // tedy nic. Jiná cesta k datům neexistuje (FR-WL-12).
            let! adminovy = entriesOf pair.Admin
            Assert.Empty adminovy
        }
    )

// @scenario: worklog.feature > Cizí záznam nelze upravit
[<Fact>]
let ``cizí záznam nelze upravit`` () =
    withPair (fun pair ->
        task {
            let now = DateTimeOffset.UtcNow
            let! janův = addEntry pair.Jan (request "Nasazení" (browserIso (now.AddHours -1.0)) (browserIso now))

            let! response =
                pair.Petra.Client.PutAsJsonAsync(
                    $"/api/worklog/{janův.Id}",
                    { request "Přepsáno cizím uživatelem" (browserIso (now.AddHours -1.0)) (browserIso now) with
                        Id = janův.Id
                    }
                )

            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode)

            let! janovy = entriesOf pair.Jan
            Assert.Equal("Nasazení", (Array.head janovy).Title)
        }
    )

// @scenario: worklog.feature > Cizí záznam nelze smazat
[<Fact>]
let ``cizí záznam nelze smazat`` () =
    withPair (fun pair ->
        task {
            let now = DateTimeOffset.UtcNow
            let! janův = addEntry pair.Jan (request "Nasazení" (browserIso (now.AddHours -1.0)) (browserIso now))

            let! response = pair.Petra.Client.DeleteAsync $"/api/worklog/{janův.Id}"
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode)

            let! janovy = entriesOf pair.Jan
            Assert.Single janovy |> ignore
        }
    )

// ── Projekt ─────────────────────────────────────────────────────────────────

// @scenario: worklog.feature > Záznam nemusí patřit k žádnému projektu
[<Fact>]
let ``záznam bez projektu se uloží`` () =
    withPair (fun pair ->
        task {
            let now = DateTimeOffset.UtcNow
            let! entry = addEntry pair.Petra (request "Lékař" (browserIso (now.AddHours -1.0)) (browserIso now))

            Assert.Null entry.ProjectId
        }
    )

// @scenario: worklog.feature > Smazání projektu záznam nesmaže
[<Fact>]
let ``smazání projektu záznam zachová a jen z něj sundá štítek`` () =
    withPair (fun pair ->
        task {
            let! projectId = createProject pair.Petra "Backend refaktoring"
            let now = DateTimeOffset.UtcNow

            let! entry =
                addEntry
                    pair.Petra
                    { request "Code review" (browserIso (now.AddHours -1.0)) (browserIso now) with
                        ProjectId = projectId
                    }

            Assert.Equal(projectId, entry.ProjectId)

            // Mazání jde až nad archivem (FR-ROLE, ProjectsApi).
            let! _ = pair.Petra.Client.PostAsync($"/api/projects/{projectId}/archive", null)
            let! deleted = pair.Petra.Client.DeleteAsync $"/api/projects/{projectId}"
            Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode)

            let! entries = entriesOf pair.Petra
            let zbylý = Assert.Single entries
            Assert.Equal("Code review", zbylý.Title)
            Assert.Null zbylý.ProjectId
        }
    )

// ── Rozsah ──────────────────────────────────────────────────────────────────

// @scenario: worklog.feature > Filtr podle období
[<Fact>]
let ``rozsah od-do vybere jen záznamy toho období`` () =
    withPair (fun pair ->
        task {
            let leden = DateTimeOffset(2026, 1, 15, 9, 0, 0, TimeSpan.Zero)
            let únor = DateTimeOffset(2026, 2, 10, 9, 0, 0, TimeSpan.Zero)

            let! _ = addEntry pair.Petra (request "Lednová práce" (iso leden) (iso (leden.AddHours 2.0)))
            let! _ = addEntry pair.Petra (request "Únorová práce" (iso únor) (iso (únor.AddHours 2.0)))

            // Meze schválně v tvaru, jaký posílá prohlížeč (`...000Z`), ne
            // v kanonickém `o` formátu — na tom rozdílu hranice tiše ujížděla.
            let from = browserIso (DateTimeOffset(2026, 2, 1, 0, 0, 0, TimeSpan.Zero))
            let until = browserIso (DateTimeOffset(2026, 3, 1, 0, 0, 0, TimeSpan.Zero))

            let! entries =
                getJson<WorkLogView[]>
                    pair.Petra.Client
                    $"/api/worklog?from={Uri.EscapeDataString from}&to={Uri.EscapeDataString until}"

            let jediný = Assert.Single entries
            Assert.Equal("Únorová práce", jediný.Title)
        }
    )
