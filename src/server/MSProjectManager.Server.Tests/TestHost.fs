/// Infrastruktura integračních testů: běžící server nad dočasnou SQLite
/// databází, HTTP klient s cookie a SignalR spojení proti reálnému hubu.
module MSProjectManager.Tests.TestHost

open System
open System.IO
open System.Net
open System.Net.Http
open System.Net.Http.Json
open System.Collections.Concurrent
open System.Threading
open System.Threading.Tasks
open Microsoft.AspNetCore.Hosting
open Microsoft.AspNetCore.Http.Connections
open Microsoft.AspNetCore.Http.Connections.Client
open Microsoft.AspNetCore.Mvc.Testing
open Microsoft.AspNetCore.SignalR.Client
open Microsoft.Extensions.DependencyInjection
open Microsoft.Extensions.Logging
open MSProjectManager.Domain.State
open MSProjectManager.Domain.Commands
open MSProjectManager.Domain.Diffs
open MSProjectManager.Protocol.Json
open MSProjectManager.Persistence.Entities
open MSProjectManager.Hosting.Options
open MSProjectManager.Api.Contracts

/// Server se stejným Program.fs jako v produkci, jen s dočasnou databází
/// a bez požadavku na HTTPS (testy jezdí po http://localhost).
/// `settings` přepíše konfiguraci hostitele — pro scénáře, které testují
/// samo nastavení (např. vypnutou registraci, FR-AUTH-08). Bez argumentu se
/// server chová jako v produkci s výchozími hodnotami.
type TestApp(?settings: (string * string) list) =
    let extraSettings = defaultArg settings []

    let databasePath =
        Path.Combine(Path.GetTempPath(), $"msprojectmanager-it-{Guid.NewGuid():N}.db")

    // Typový parametr slouží jen k nalezení assembly se vstupním bodem, takže
    // to musí být typ z `MSProjectManager.Server` — ne z `.Persistence`, kde
    // žádný `main` není a hostitel by se tiše poskládal bez našeho `Program`.
    let factory =
        (new WebApplicationFactory<AuthOptions>())
            .WithWebHostBuilder(fun builder ->
                builder.UseSetting("Database:Path", databasePath) |> ignore
                builder.UseSetting("Auth:RequireHttps", "false") |> ignore
                builder.UseSetting("Actors:PersistIntervalSeconds", "0.3") |> ignore
                builder.UseSetting("Hub:DetailedErrors", "true") |> ignore

                for key, value in extraSettings do
                    builder.UseSetting(key, value) |> ignore

                builder.ConfigureLogging(fun logging ->
                    logging.ClearProviders().AddConsole().SetMinimumLevel LogLevel.Warning |> ignore
                )
                |> ignore

                builder.UseEnvironment "Testing" |> ignore
            )

    member _.Factory = factory
    member _.BaseAddress = factory.Server.BaseAddress
    member _.CreateClient() = factory.CreateClient()
    member _.Services = factory.Services

    /// Vynutí uložení stavů všech actorů.
    ///
    /// Actor persistuje po ticku (`PersistInterval`), takže projekce čtoucí
    /// `state_json` mimo actory (přehledy, kontrola osiřelé práce) by v testu
    /// viděla prázdný projekt. V provozu je to zpoždění přijatelné, v testu
    /// nedeterministické.
    member _.FlushProjects() =
        let registry =
            factory.Services.GetRequiredService<MSProjectManager.Actors.ProjectActorRegistry.ProjectActorRegistry>()

        registry.FlushAll() |> Async.StartAsTask :> Task

    interface IDisposable with
        member _.Dispose() =
            factory.Dispose()
            Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools()

            for suffix in [ ""; "-wal"; "-shm" ] do
                if File.Exists(databasePath + suffix) then
                    try
                        File.Delete(databasePath + suffix)
                    with _ ->
                        ()

/// Odpověď `/auth/setup-required` — první spuštění i příznak registrace
/// (FR-AUTH-08); klient obojí potřebuje ve stejnou chvíli.
type SetupState =
    {
        Required: bool
        RegistrationAllowed: bool
    }

/// Tělo odpovědi; `null` je v testu vždycky chyba, ne validní stav.
let readJson<'T when 'T: not struct and 'T: not null> (response: HttpResponseMessage) =
    task {
        let! value = response.Content.ReadFromJsonAsync<'T>()
        return nonNull value
    }

/// GET + deserializace v jednom.
let getJson<'T when 'T: not struct and 'T: not null> (client: HttpClient) (url: string) =
    task {
        let! response = client.GetAsync url
        return! readJson<'T> response
    }

/// Přihlášený klient — HTTP klient i cookie pro SignalR.
[<NoEquality; NoComparison>]
type Session =
    {
        Client: HttpClient
        Cookie: string
        User: CurrentUser
    }

let private authCookie (response: HttpResponseMessage) =
    match response.Headers.TryGetValues "Set-Cookie" with
    | true, values ->
        values
        |> Option.ofObj
        |> Option.defaultValue Seq.empty
        |> Seq.tryHead
        |> Option.map (fun header -> header.Split(';').[0])
        |> Option.defaultValue ""
    | _ -> ""

/// Vytvoří prvního admina přes `/auth/setup` (FR-AUTH-07).
let setupAdmin (app: TestApp) (userName: string) (password: string) =
    task {
        let client = app.CreateClient()

        let! response =
            client.PostAsJsonAsync(
                "/auth/setup",
                {
                    UserName = userName
                    DisplayName = "Administrátor"
                    Password = password
                }
            )

        let! user = readJson<CurrentUser> response

        return
            {
                Client = client
                Cookie = authCookie response
                User = user
            }
    }

/// Přihlásí existující účet.
let login (app: TestApp) (userName: string) (password: string) =
    task {
        let client = app.CreateClient()

        let! response =
            client.PostAsJsonAsync(
                "/auth/login",
                {
                    UserName = userName
                    Password = password
                }
            )

        if response.StatusCode <> HttpStatusCode.OK then
            let! body = response.Content.ReadAsStringAsync()
            failwith $"přihlášení {userName} selhalo: {int response.StatusCode} {body}"

        let! user = readJson<CurrentUser> response

        return
            {
                Client = client
                Cookie = authCookie response
                User = user
            }
    }

/// Založí uživatele adminem a rovnou ho přihlásí.
let createUser (app: TestApp) (admin: Session) (userName: string, displayName: string, password: string) =
    task {
        let! response =
            admin.Client.PostAsJsonAsync(
                "/admin/users",
                {
                    UserName = userName
                    DisplayName = displayName
                    Password = password
                }
            )

        if response.StatusCode <> HttpStatusCode.OK then
            let! body = response.Content.ReadAsStringAsync()
            failwith $"vytvoření {userName} selhalo: {int response.StatusCode} {body}"

        return! login app userName password
    }

// ── SignalR ─────────────────────────────────────────────────────────────────

/// Odposlouchávané spojení na hub: drží fronty přijatých zpráv.
type HubClient(connection: HubConnection) =
    let diffs = ConcurrentQueue<ProjectDiff>()
    let states = ConcurrentQueue<ClientAppState>()
    let presence = ConcurrentQueue<PresenceEntry list>()

    do
        connection.On<ProjectDiff>("ReceiveDiff", diffs.Enqueue) |> ignore
        connection.On<ClientAppState>("ReceiveFullState", states.Enqueue) |> ignore
        connection.On<PresenceEntry list>("PresenceUpdate", presence.Enqueue) |> ignore

    member _.Connection = connection
    member _.Diffs = diffs |> Seq.toList
    member _.States = states |> Seq.toList
    member _.Presence = presence |> Seq.toList
    member _.ClearDiffs() = diffs.Clear()
    member _.ClearPresence() = presence.Clear()

    member _.Join(projectId: string) =
        connection.InvokeAsync<ClientAppState>("JoinProject", projectId)

    member _.Leave(projectId: string) =
        connection.InvokeAsync("LeaveProject", projectId)

    member _.Send(projectId: string, command: ProjectCommand) =
        connection.InvokeAsync("SendCommand", projectId, command)

    member _.FullState(projectId: string) =
        connection.InvokeAsync<ClientAppState>("GetFullState", projectId)

    member _.StopAsync() = connection.StopAsync()

    interface IAsyncDisposable with
        member _.DisposeAsync() = connection.DisposeAsync()

/// Otevře SignalR spojení s cookie přihlášeného uživatele.
///
/// Cookie se přidává jako hlavička, ne přes `options.Cookies`: vlastní
/// `HttpMessageHandlerFactory` (handler `TestServeru`) zahodí handler, na
/// kterém SignalR cookie container drží.
let connectHub (app: TestApp) (session: Session) =
    task {
        let connection =
            HubConnectionBuilder()
                .WithUrl(
                    Uri(app.BaseAddress, "hubs/project"),
                    fun (options: HttpConnectionOptions) ->
                        options.HttpMessageHandlerFactory <- fun _ -> app.Factory.Server.CreateHandler()
                        options.Transports <- HttpTransportType.LongPolling
                        options.Headers.Add("Cookie", session.Cookie)
                )
                .AddJsonProtocol(fun options -> options.PayloadSerializerOptions <- hubOptions)
                .Build()

        do! connection.StartAsync()
        return HubClient connection
    }

/// Počká na splnění podmínky (výchozí 2 s podle NFR z PRD-02).
let waitUntil (condition: unit -> bool) =
    task {
        let deadline = DateTime.UtcNow.AddSeconds 2.0

        while not (condition ()) && DateTime.UtcNow < deadline do
            do! Task.Delay 20

        return condition ()
    }

/// Počká na diff splňující podmínku a vrátí ho.
let waitForDiff (client: HubClient) (predicate: ProjectDiff -> bool) =
    task {
        let! found = waitUntil (fun () -> client.Diffs |> List.exists predicate)

        if not found then
            failwith "očekávaný diff nedorazil do 2 sekund"

        return client.Diffs |> List.find predicate
    }
