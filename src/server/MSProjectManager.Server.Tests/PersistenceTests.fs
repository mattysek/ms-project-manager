/// Persistence proti skutečné SQLite databázi: migrace musí projít a
/// repozitáře nad ní musí fungovat včetně cizích klíčů a CHECK constraintu.
module MSProjectManager.Tests.PersistenceTests

open System
open System.IO
open Microsoft.EntityFrameworkCore
open Xunit
open MSProjectManager.Domain.State
open MSProjectManager.Protocol.Json
open MSProjectManager.Persistence.Entities
open MSProjectManager.Persistence.AppDbContext
open MSProjectManager.Persistence.Repositories
open MSProjectManager.Tests.Fixtures

let private createDatabase () =
    let path =
        Path.Combine(Path.GetTempPath(), $"msprojectmanager-test-{Guid.NewGuid():N}.db")

    MSProjectManager.Persistence.Sqlite.initialize path
    let builder = DbContextOptionsBuilder<AppDbContext>()

    // Migrace žijí v samostatné C# assembly (ADR-013), jinak je `Migrate()`
    // nenajde a založí prázdnou databázi.
    builder.UseSqlite(
        MSProjectManager.Persistence.Sqlite.connectionString path,
        fun options ->
            options.MigrationsAssembly MSProjectManager.Persistence.DesignTime.MigrationsAssembly
            |> ignore
    )
    |> ignore

    let db = new AppDbContext(builder.Options)
    db.Database.Migrate()
    path, db

/// Spustí test nad čerstvou databází a po sobě uklidí.
let private withDatabase (run: AppDbContext -> Async<unit>) =
    let path, db = createDatabase ()

    try
        run db |> Async.RunSynchronously
    finally
        db.Dispose()
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools()

        for suffix in [ ""; "-wal"; "-shm" ] do
            if File.Exists(path + suffix) then
                File.Delete(path + suffix)

let private addUser (db: AppDbContext) (userId: string) (displayName: string) =
    async {
        let user = AppUser(Id = userId, UserName = userId, DisplayName = displayName)
        db.Users.Add user |> ignore
        do! db.SaveChangesAsync() |> Async.AwaitTask |> Async.Ignore
    }

let private newProject (owner: string) : Projects.NewProject =
    {
        Id = "p1"
        Name = "Backend refaktoring"
        StateJson = serialize state
        OwnerId = owner
    }

// ── Schéma ──────────────────────────────────────────────────────────────────

[<Fact>]
let ``migrace vytvoří schéma a zapne WAL`` () =
    withDatabase (fun db ->
        async {
            use command = db.Database.GetDbConnection().CreateCommand()
            db.Database.OpenConnection()
            command.CommandText <- "PRAGMA journal_mode;"
            let mode = command.ExecuteScalar() |> string
            Assert.Equal("wal", mode.ToLowerInvariant())

            command.CommandText <-
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN
                 ('projects', 'project_members', 'files', 'ado_credentials', 'quick_notes', 'AspNetUsers');"

            Assert.Equal(6L, command.ExecuteScalar() |> unbox<int64>)
        }
    )

/// Srovná zápis DDL, aby šla porovnat sémantika, ne formátování.
///
/// `ALTER TABLE … ADD COLUMN` uloží do `sqlite_master` text s jinými mezerami
/// kolem závorek než `CREATE TABLE` z modelu (`NULL )` vs `NULL)`), takže
/// samotné sražení bílých znaků nestačí — po každém přidání sloupce by test
/// spadl na rozdíl, který v databázi neexistuje.
let private normalizeDdl (sql: string) =
    let collapsed =
        System.Text.RegularExpressions.Regex.Replace(sql, @"\s+", " ").Trim()

    System.Text.RegularExpressions.Regex.Replace(collapsed, @"\s*([(),])\s*", "$1")

/// Čte `sqlite_master` a normalizuje zápis, aby šla dvě schémata porovnat.
let private schemaOf (db: AppDbContext) =
    db.Database.OpenConnection()
    use command = db.Database.GetDbConnection().CreateCommand()

    command.CommandText <-
        "SELECT type || ' ' || name || ' ' || COALESCE(sql, '') FROM sqlite_master
         WHERE name NOT LIKE 'sqlite_%' AND substr(name, 1, 4) <> '__EF' ORDER BY name;"

    use reader = command.ExecuteReader()

    [
        while reader.Read() do
            yield normalizeDdl (reader.GetString 0)
    ]

/// ADR-013: bez `ModelSnapshot` nehlídá rozpor mezi modelem a migrací žádný
/// nástroj — hlídá ho tenhle test. Schéma z migrace se musí shodovat se
/// schématem, které by EF vytvořil přímo z modelu.
[<Fact>]
let ``schéma z migrace odpovídá EF modelu`` () =
    let migratedPath, migrated = createDatabase ()

    let modelPath =
        Path.Combine(Path.GetTempPath(), $"msprojectmanager-model-{Guid.NewGuid():N}.db")

    let builder = DbContextOptionsBuilder<AppDbContext>()

    builder.UseSqlite(MSProjectManager.Persistence.Sqlite.connectionString modelPath)
    |> ignore

    use fromModel = new AppDbContext(builder.Options)
    fromModel.Database.EnsureCreated() |> ignore

    try
        Assert.Equal<string list>(schemaOf fromModel, schemaOf migrated)
    finally
        migrated.Dispose()
        fromModel.Dispose()
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools()

        for path in [ migratedPath; modelPath ] do
            for suffix in [ ""; "-wal"; "-shm" ] do
                if File.Exists(path + suffix) then
                    File.Delete(path + suffix)

[<Fact>]
let ``role mimo pm a dev neprojde CHECK constraintem`` () =
    withDatabase (fun db ->
        async {
            do! addUser db janId "Jan Novák"
            do! Projects.create db (newProject janId)

            db.ProjectMembers.Add
                {
                    ProjectId = "p1"
                    UserId = janId
                    Role = "admin"
                    JoinedAt = "2026-01-05T08:00:00Z"
                }
            |> ignore

            Assert.ThrowsAny<exn>(fun () -> db.SaveChanges() |> ignore) |> ignore
            db.ChangeTracker.Clear()
        }
    )

// ── Projekty ────────────────────────────────────────────────────────────────

[<Fact>]
let ``založený projekt má zakladatele jako PM a je v jeho seznamu`` () =
    withDatabase (fun db ->
        async {
            do! addUser db janId "Jan Novák"
            do! Projects.create db (newProject janId)
            let! projects = Projects.listForUser db janId
            let summary = List.exactlyOne projects
            Assert.Equal("Backend refaktoring", summary.Name)
            Assert.Equal(Pm, summary.Role)
        }
    )

[<Fact>]
let ``stav projektu se uloží a načte beze změny`` () =
    withDatabase (fun db ->
        async {
            do! addUser db janId "Jan Novák"
            do! Projects.create db (newProject janId)

            let changed =
                { state with
                    Project =
                        { state.Project with
                            Notes = "Poznámka z retro"
                        }
                }

            let! saved =
                Projects.saveState
                    db
                    "p1"
                    {
                        Name = changed.Project.Name
                        StateJson = serialize changed
                    }

            Assert.True saved
            let! loaded = Projects.tryLoadState db "p1"
            Assert.Equal(Some changed, loaded |> Option.map deserialize<AppState>)
        }
    )

[<Fact>]
let ``smazání projektu odstraní i členství a přílohy`` () =
    withDatabase (fun db ->
        async {
            do! addUser db janId "Jan Novák"
            do! Projects.create db (newProject janId)

            do!
                Files.add
                    db
                    {
                        ProjectId = "p1"
                        Ref = file "f1" janId
                        Data = [| 1uy; 2uy; 3uy |]
                    }

            let! deleted = Projects.delete db "p1"
            Assert.True deleted
            let! projects = Projects.listForUser db janId
            Assert.Empty projects
            let! files = Files.listForProject db "p1"
            Assert.Empty files
        }
    )

// ── Členové ─────────────────────────────────────────────────────────────────

[<Fact>]
let ``člena lze přidat, povýšit a odebrat`` () =
    withDatabase (fun db ->
        async {
            do! addUser db janId "Jan Novák"
            do! addUser db petraId "Petra Kolářová"
            do! Projects.create db (newProject janId)

            let! added =
                Members.add
                    db
                    {
                        ProjectId = "p1"
                        UserId = petraId
                        Role = Dev
                    }

            Assert.Equal(Ok(), added)

            let! members = Members.list db "p1"
            Assert.Equal(2, List.length members)
            Assert.Equal(Some Dev, Members.tryGetRole db "p1" petraId |> Async.RunSynchronously)

            let! promoted =
                Members.setRole
                    db
                    {
                        ProjectId = "p1"
                        UserId = petraId
                        Role = Pm
                    }

            Assert.Equal(Ok(), promoted)
            let! removed = Members.remove db "p1" janId
            Assert.Equal(Ok(), removed)
        }
    )

[<Fact>]
let ``posledního PM nelze degradovat ani odebrat`` () =
    withDatabase (fun db ->
        async {
            do! addUser db janId "Jan Novák"
            do! Projects.create db (newProject janId)

            let! degraded =
                Members.setRole
                    db
                    {
                        ProjectId = "p1"
                        UserId = janId
                        Role = Dev
                    }

            Assert.Equal(Error "Projekt musí mít alespoň jednoho Project Managera", degraded)
            let! removed = Members.remove db "p1" janId
            Assert.Equal(Error "Projekt musí mít alespoň jednoho Project Managera", removed)
        }
    )

// ── Přílohy ─────────────────────────────────────────────────────────────────

[<Fact>]
let ``příloha se uloží i s obsahem a metadata jdou číst bez BLOBu`` () =
    withDatabase (fun db ->
        async {
            do! addUser db janId "Jan Novák"
            do! Projects.create db (newProject janId)
            let content = Text.Encoding.UTF8.GetBytes "obsah přílohy"

            do!
                Files.add
                    db
                    {
                        ProjectId = "p1"
                        Ref = file "f1" janId
                        Data = content
                    }

            let! refs = Files.listForProject db "p1"
            Assert.Equal("analyza.pdf", (List.exactlyOne refs).Name)

            let! stored = Files.tryGet db "f1"
            Assert.Equal<byte[]>(content, (Option.get stored).Data)

            let! updated = Files.updateNote db "f1" "Podklad k API"
            Assert.True updated
            let! total = Files.totalSize db "p1"
            Assert.Equal(1024L, total)

            let! deleted = Files.delete db "f1"
            Assert.True deleted
        }
    )

// ── Quick notes ─────────────────────────────────────────────────────────────

[<Fact>]
let ``quick note se založí, upraví a smaže`` () =
    withDatabase (fun db ->
        async {
            do! addUser db petraId "Petra Kolářová"

            let! created =
                QuickNotes.create
                    db
                    {
                        Id = "n1"
                        UserId = petraId
                        Content = "Zavolat dodavateli"
                        LinkedProjectId = None
                    }

            Assert.True(Result.isOk created)

            let! updated =
                QuickNotes.update
                    db
                    {
                        Id = "n1"
                        UserId = petraId
                        Content = "Zavolat dodavateli ohledně termínu"
                        LinkedProjectId = None
                        ConvertedToTaskId = Some "t-api"
                    }

            match updated with
            | Ok note -> Assert.Equal(Some "t-api", note.ConvertedToTaskId)
            | Error message -> failwith message

            let! notes = QuickNotes.listForUser db petraId
            Assert.Equal(1, List.length notes)
            let! deleted = QuickNotes.delete db "n1" petraId
            Assert.True deleted
        }
    )

[<Fact>]
let ``cizí quick note není vidět ani smazat`` () =
    withDatabase (fun db ->
        async {
            do! addUser db petraId "Petra Kolářová"
            do! addUser db janId "Jan Novák"

            let! _ =
                QuickNotes.create
                    db
                    {
                        Id = "n1"
                        UserId = petraId
                        Content = "Soukromá poznámka"
                        LinkedProjectId = None
                    }

            let! foreign = QuickNotes.tryGet db "n1" janId
            Assert.Equal(None, foreign)
            let! deleted = QuickNotes.delete db "n1" janId
            Assert.False deleted
        }
    )

[<Fact>]
let ``prázdná a příliš dlouhá poznámka se neuloží`` () =
    withDatabase (fun db ->
        async {
            do! addUser db petraId "Petra Kolářová"

            let! empty =
                QuickNotes.create
                    db
                    {
                        Id = "n1"
                        UserId = petraId
                        Content = "   "
                        LinkedProjectId = None
                    }

            Assert.Equal(Error "Poznámka musí mít obsah", empty |> Result.map (fun note -> note.Id))

            let! tooLong =
                QuickNotes.create
                    db
                    {
                        Id = "n2"
                        UserId = petraId
                        Content = String('a', QuickNotes.MaxContentLength + 1)
                        LinkedProjectId = None
                    }

            Assert.True(Result.isError tooLong)
        }
    )

// ── ADO credentials ─────────────────────────────────────────────────────────

[<Fact>]
let ``PAT se uloží šifrovaně a klientovi se hlásí jen jeho existence`` () =
    withDatabase (fun db ->
        async {
            do! addUser db janId "Jan Novák"
            do! Projects.create db (newProject janId)

            let! _ =
                AdoCredentials.savePat
                    db
                    {
                        ProjectId = "p1"
                        UserId = janId
                        PatEncrypted = "sifrovany-token"
                    }

            let! status = AdoCredentials.patStatus db "p1" janId
            Assert.True status.PatSet
            Assert.True status.UpdatedAt.IsSome

            do! AdoCredentials.saveSnapshot db "p1" """{"lastSync":"2026-02-01T10:00:00Z"}"""
            let! snapshot = AdoCredentials.tryGetSnapshot db "p1"
            Assert.True snapshot.IsSome

            let! deleted = AdoCredentials.deletePat db "p1" janId
            Assert.True deleted
            let! afterDelete = AdoCredentials.patStatus db "p1" janId
            Assert.False afterDelete.PatSet
        }
    )

// ── Historie KB stránek ─────────────────────────────────────────────────────

let private revision (pageId: string) (content: string) (savedAt: string) : KbRevisions.KbRevision =
    {
        Id = ""
        PageId = pageId
        Title = "Technická architektura"
        Content = content
        SavedAt = savedAt
        SavedBy = "Jan Novák"
    }

// @scenario: knowledge-base.feature > Historie verzí stránky
[<Fact>]
let ``historie stránky vrací verze od nejnovější`` () =
    withDatabase (fun db ->
        async {
            do! addUser db "u-jan" "Jan Novák"

            do!
                Projects.create
                    db
                    {
                        Id = "p1"
                        Name = "Projekt"
                        StateJson = "{}"
                        OwnerId = "u-jan"
                    }

            do! KbRevisions.append db "p1" (revision "kb1" "první znění" "2026-08-10T08:00:00Z")
            do! KbRevisions.append db "p1" (revision "kb1" "druhé znění" "2026-08-12T08:00:00Z")

            let! history = KbRevisions.list db "p1" "kb1"

            Assert.Equal(2, List.length history)
            Assert.Equal("druhé znění", history.Head.Content)
            Assert.Equal("Jan Novák", history.Head.SavedBy)
        }
    )

// @scenario: knowledge-base.feature > Historie je omezená na 50 verzí
[<Fact>]
let ``historie se ořezává na padesát verzí`` () =
    withDatabase (fun db ->
        async {
            do! addUser db "u-jan" "Jan Novák"

            do!
                Projects.create
                    db
                    {
                        Id = "p1"
                        Name = "Projekt"
                        StateJson = "{}"
                        OwnerId = "u-jan"
                    }

            for i in 1 .. (KbRevisions.MaxRevisionsPerPage + 5) do
                do!
                    KbRevisions.append
                        db
                        "p1"
                        (revision "kb1" $"verze {i}" $"2026-08-{10 + i / 24:D2}T{i % 24:D2}:00:00Z")

            let! history = KbRevisions.list db "p1" "kb1"

            Assert.Equal(KbRevisions.MaxRevisionsPerPage, List.length history)
            // Ořezávají se ty nejstarší — první verze v historii zůstat nesmí.
            Assert.DoesNotContain("verze 1", history |> List.map (fun r -> r.Content))
        }
    )

// @scenario: knowledge-base.feature > Smazaná stránka zůstává v historii
[<Fact>]
let ``historie přežije smazání stránky`` () =
    withDatabase (fun db ->
        async {
            do! addUser db "u-jan" "Jan Novák"

            do!
                Projects.create
                    db
                    {
                        Id = "p1"
                        Name = "Projekt"
                        StateJson = "{}"
                        OwnerId = "u-jan"
                    }

            // Actor ukládá poslední znění i před smazáním — revize tedy
            // existuje i pro stránku, která už ve stavu projektu není.
            do! KbRevisions.append db "p1" (revision "kb-smazana" "poslední znění" "2026-08-12T08:00:00Z")

            let! history = KbRevisions.list db "p1" "kb-smazana"

            Assert.Single history |> ignore
            Assert.Equal("poslední znění", history.Head.Content)
        }
    )
