/// Konfigurace serveru z `appsettings.json`.
module MSProjectManager.Hosting.Options

open System
open System.IO
open Microsoft.Extensions.Configuration
open Microsoft.Extensions.Hosting

/// Nastavení autentizace (PRD-01, NFR).
type AuthOptions =
    {
        /// Sliding expiry cookie; výchozí 8 hodin.
        SessionHours: float
        /// Kolik neúspěšných pokusů vede k zamčení účtu.
        MaxFailedAttempts: int
        /// Jak dlouho účet zůstane zamčený.
        LockoutMinutes: float
        /// Vyžadovat HTTPS pro auth cookie. V testech a na holém HTTP se vypíná.
        RequireHttps: bool
    }

    // Pozn.: `Auth:AllowSelfRegistration` tu schválně NENÍ. Má jediného
    // konzumenta (`Api/Auth.fs`) a `Api` se překládá před `Hosting`, takže by
    // na tenhle typ stejně nedosáhlo — a závislost Api → kompoziční kořen by
    // byla obrácená proti vrstvení.

/// Nastavení actorů (ADR-002).
type ActorSettings =
    {
        PersistIntervalSeconds: float
        IdleTimeoutMinutes: float
        MaxQueueLength: int
    }

let private value (configuration: IConfiguration) (key: string) (fallback: 'T) =
    match configuration.GetSection(key).Value with
    | null -> fallback
    | text -> Convert.ChangeType(text, typeof<'T>, Globalization.CultureInfo.InvariantCulture) :?> 'T

/// Relativní cesty se rozhodují proti složce, ze které služba běží
/// (`ContentRootPath`), **ne** proti aktuálnímu adresáři procesu: Windows
/// Service startuje s `CurrentDirectory` v `C:\Windows\System32`, takže by
/// tam SQLite založila databázi.
let private resolveWritablePath (environment: IHostEnvironment) (configured: string) =
    let full =
        if Path.IsPathRooted configured then
            configured
        else
            Path.Combine(environment.ContentRootPath, configured)

    // WAL vedle souboru zakládá `-wal` a `-shm`, zapisovatelná proto musí být
    // celá složka. Data Protection do své složky zapisuje taky.
    Directory.CreateDirectory(Path.GetDirectoryName full |> Option.ofObj |> Option.defaultValue full)
    |> ignore

    full

/// Cesta k SQLite souboru; výchozí `data/msprojectmanager.db` vedle služby.
let databasePath (environment: IHostEnvironment) (configuration: IConfiguration) =
    value configuration "Database:Path" (Path.Combine("data", "msprojectmanager.db"))
    |> resolveWritablePath environment

/// Složka s key ringem Data Protection (ADR-008). Musí přežít restart i změnu
/// účtu služby — jinak jsou uložené PATy nedešifrovatelné.
let dataProtectionKeysPath (environment: IHostEnvironment) (configuration: IConfiguration) =
    let configured = value configuration "DataProtection:KeysPath" "keys"

    let full =
        if Path.IsPathRooted configured then
            configured
        else
            Path.Combine(environment.ContentRootPath, configured)

    Directory.CreateDirectory full |> ignore
    full

let auth (configuration: IConfiguration) =
    {
        SessionHours = value configuration "Auth:SessionHours" 8.0
        MaxFailedAttempts = value configuration "Auth:MaxFailedAttempts" 5
        LockoutMinutes = value configuration "Auth:LockoutMinutes" 15.0
        RequireHttps = value configuration "Auth:RequireHttps" true
    }

let actors (configuration: IConfiguration) =
    {
        PersistIntervalSeconds = value configuration "Actors:PersistIntervalSeconds" 5.0
        IdleTimeoutMinutes = value configuration "Actors:IdleTimeoutMinutes" 15.0
        MaxQueueLength = value configuration "Actors:MaxQueueLength" 1000
    }
