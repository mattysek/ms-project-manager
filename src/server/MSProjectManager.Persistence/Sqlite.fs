/// Nastavení SQLite podle PRD-00 a ADR-010.
///
/// `page_size` musí být nastavená dřív, než databáze vznikne — na už
/// existujícím souboru se projeví až po `VACUUM`. Proto se pragmy pouštějí
/// při startu, před migrací.
module MSProjectManager.Persistence.Sqlite

open Microsoft.Data.Sqlite

/// 64 KB stránky jsou optimum pro BLOBy příloh (ADR-010).
[<Literal>]
let PageSize = 65536

/// Čekání na uvolnění zámku, než SQLite vrátí `SQLITE_BUSY`.
[<Literal>]
let BusyTimeoutMs = 5000

/// Connection string s pooling a zapnutými cizími klíči.
let connectionString (databasePath: string) =
    SqliteConnectionStringBuilder(
        DataSource = databasePath,
        Mode = SqliteOpenMode.ReadWriteCreate,
        Cache = SqliteCacheMode.Default,
        ForeignKeys = true,
        Pooling = true
    )
        .ToString()

let private execute (connection: SqliteConnection) (sql: string) =
    use command = connection.CreateCommand()
    command.CommandText <- sql
    command.ExecuteNonQuery() |> ignore

/// WAL, `synchronous = NORMAL`, cizí klíče a busy timeout. Pouštět na
/// otevřeném spojení před prvním zápisem.
let applyPragmas (connection: SqliteConnection) =
    execute connection $"PRAGMA page_size = {PageSize};"
    execute connection "PRAGMA journal_mode = WAL;"
    execute connection "PRAGMA synchronous = NORMAL;"
    execute connection "PRAGMA foreign_keys = ON;"
    execute connection $"PRAGMA busy_timeout = {BusyTimeoutMs};"

/// Otevře spojení, nastaví pragmy a zase zavře — volat při startu aplikace,
/// ještě než se pustí EF migrace.
let initialize (databasePath: string) =
    use connection = new SqliteConnection(connectionString databasePath)
    connection.Open()
    applyPragmas connection
