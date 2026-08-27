/// Registrace služeb do DI (ADR-001, ADR-003).
module MSProjectManager.Hosting.Services

open System
open System.Threading.Tasks
open Microsoft.AspNetCore.Authentication
open Microsoft.AspNetCore.Authentication.Cookies
open Microsoft.AspNetCore.Http
open Microsoft.AspNetCore.Identity
open Microsoft.EntityFrameworkCore
open Microsoft.Extensions.Configuration
open Microsoft.Extensions.DependencyInjection
open Microsoft.Extensions.Hosting
open Microsoft.Extensions.Logging
open System.Net.Http
open Microsoft.AspNetCore.DataProtection
open Microsoft.AspNetCore.SignalR
open MSProjectManager.Domain.Diffs
open MSProjectManager.Integration.AdoBridgeContext
open MSProjectManager.Integration
open MSProjectManager.Protocol.Json
open MSProjectManager.Persistence.Entities
open MSProjectManager.Persistence.AppDbContext
open MSProjectManager.Actors
open MSProjectManager.Actors.ProjectActor
open MSProjectManager.Actors.ProjectActorRegistry
open MSProjectManager.Realtime.Presence
open MSProjectManager.Realtime.Membership
open MSProjectManager.Realtime.ProjectHub
open MSProjectManager.Hosting.Options

/// Do cookie přidává claim `displayName`, aby hub i API znaly jméno
/// uživatele bez dotazu do databáze (Header, presence, seznam členů).
type AppClaimsPrincipalFactory
    (
        users: UserManager<AppUser>,
        roles: RoleManager<IdentityRole>,
        options: Microsoft.Extensions.Options.IOptions<IdentityOptions>
    ) =
    inherit UserClaimsPrincipalFactory<AppUser, IdentityRole>(users, roles, options)

    override this.GenerateClaimsAsync(user: AppUser) =
        // `base` nejde volat zevnitř výrazu task {}.
        let baseCall = base.GenerateClaimsAsync user

        task {
            let! identity = baseCall
            identity.AddClaim(Security.Claims.Claim("displayName", user.DisplayName))
            return identity
        }

/// API vrací JSON ve stejném tvaru jako zbytek protokolu — camelCase,
/// `option` jako chybějící klíč.
let private configureJson (services: IServiceCollection) =
    services.ConfigureHttpJsonOptions(fun options ->
        options.SerializerOptions.PropertyNamingPolicy <- System.Text.Json.JsonNamingPolicy.CamelCase

        for converter in commandOptions.Converters do
            options.SerializerOptions.Converters.Add converter
    )
    |> ignore

let private configureIdentity (services: IServiceCollection) (settings: AuthOptions) =
    services
        .AddIdentity<AppUser, IdentityRole>(fun options ->
            options.Password.RequiredLength <- 8
            options.Password.RequireNonAlphanumeric <- false
            options.Password.RequiredUniqueChars <- 1
            options.User.RequireUniqueEmail <- false
            options.SignIn.RequireConfirmedAccount <- false
            options.Lockout.MaxFailedAccessAttempts <- settings.MaxFailedAttempts
            options.Lockout.DefaultLockoutTimeSpan <- TimeSpan.FromMinutes settings.LockoutMinutes
        )
        .AddEntityFrameworkStores<AppDbContext>()
        .AddClaimsPrincipalFactory<AppClaimsPrincipalFactory>()
        .AddDefaultTokenProviders()
    |> ignore

/// SPA nechce redirect na login stránku, ale 401 — přesměrování si řeší
/// klient sám (FR-AUTH-03 `returnUrl`).
let private jsonStatusOnRedirect (context: RedirectContext<CookieAuthenticationOptions>) (status: int) =
    if
        context.Request.Path.StartsWithSegments(PathString "/api")
        || context.Request.Path.StartsWithSegments(PathString "/auth")
        || context.Request.Path.StartsWithSegments(PathString "/admin")
        || context.Request.Path.StartsWithSegments(PathString "/hubs")
    then
        context.Response.StatusCode <- status
        Task.CompletedTask
    else
        context.Response.Redirect context.RedirectUri
        Task.CompletedTask

let private configureCookie (services: IServiceCollection) (settings: AuthOptions) =
    services.ConfigureApplicationCookie(fun options ->
        options.Cookie.Name <- "MSProjectManager.Auth"
        options.Cookie.HttpOnly <- true
        options.Cookie.SameSite <- SameSiteMode.Strict

        options.Cookie.SecurePolicy <-
            if settings.RequireHttps then
                CookieSecurePolicy.Always
            else
                CookieSecurePolicy.SameAsRequest

        options.ExpireTimeSpan <- TimeSpan.FromHours settings.SessionHours
        options.SlidingExpiration <- true
        options.LoginPath <- PathString "/login"

        options.Events.OnRedirectToLogin <-
            fun context -> jsonStatusOnRedirect context StatusCodes.Status401Unauthorized

        options.Events.OnRedirectToAccessDenied <-
            fun context -> jsonStatusOnRedirect context StatusCodes.Status403Forbidden
    )
    |> ignore

/// Key ring Data Protection, kterým se šifruje ADO PAT (ADR-008).
///
/// Bez konfigurace by klíče skončily v profilu účtu služby a při běhu pod
/// účtem bez načteného profilu jen v paměti — každý restart by pak
/// znehodnotil všechny uložené PATy. Proto explicitně:
///
/// * `SetApplicationName` — discriminator nezávisí na instalační cestě,
///   takže přesun složky klíče neznehodnotí;
/// * `PersistKeysToFileSystem` — klíče přežijí restart i reinstalaci;
/// * `ProtectKeysWithDpapi(protectToLocalMachine = true)` — key ring je
///   svázaný se strojem, ne s účtem. Cena: obnova zálohy na jiném stroji
///   PATy nedešifruje a uživatelé je zadají znovu (vědomá volba, ADR-008).
///
/// DPAPI je jen na Windows; jinde (vývoj, testy, kontejnery) zůstává key ring
/// na disku nešifrovaný, což je pro neprodukční běh v pořádku.
let private configureDataProtection
    (services: IServiceCollection)
    (environment: IHostEnvironment)
    (configuration: IConfiguration)
    =
    let builder =
        services
            .AddDataProtection()
            .SetApplicationName("MSProjectManager")
            .PersistKeysToFileSystem(IO.DirectoryInfo(dataProtectionKeysPath environment configuration))

    if OperatingSystem.IsWindows() then
        builder.ProtectKeysWithDpapi(protectToLocalMachine = true) |> ignore

let private actorOptions (configuration: IConfiguration) =
    let settings = actors configuration

    {
        PersistInterval = TimeSpan.FromSeconds settings.PersistIntervalSeconds
        IdleTimeout = TimeSpan.FromMinutes settings.IdleTimeoutMinutes
        MaxQueueLength = settings.MaxQueueLength
    }

/// Zaregistruje vše, co server potřebuje.
let register (services: IServiceCollection) (environment: IHostEnvironment) (configuration: IConfiguration) =
    let connection =
        MSProjectManager.Persistence.Sqlite.connectionString (databasePath environment configuration)

    // Migrace žijí v C# projektu, protože EF pro F# scaffolding neumí —
    // kontext a entity přitom zůstávají v F# (ADR-013).
    services.AddDbContext<AppDbContext>(fun options ->
        options.UseSqlite(
            connection,
            fun sqlite ->
                sqlite.MigrationsAssembly MSProjectManager.Persistence.DesignTime.MigrationsAssembly
                |> ignore
        )
        |> ignore
    )
    |> ignore

    configureJson services
    configureIdentity services (auth configuration)
    configureCookie services (auth configuration)

    let detailedErrors = configuration.GetSection("Hub:DetailedErrors").Value = "true"

    // Výchozí strop SignalR na příchozí zprávu je **32 kB** a `full_state_import`
    // ho u reálného projektu překročí: stav se posílá jako jeden příkaz
    // (ADR-005), takže v něm jsou všechny úkoly, stránky dokumentace i ADO log
    // — u vzorku z provozu skoro 150 kB. Nad limitem SignalR spojení ukončí,
    // takže se to neprojeví jako odmítnutý příkaz, ale jako spadlé spojení.
    //
    // Rozdělit import na víc zpráv by znamenalo vzdát se jeho atomicity, proto
    // se zvedá limit. Není bez hranic schválně — je to vstup od klienta a
    // server běží pro tým do 15 lidí, ne pro veřejný internet.
    let maxMessageSize =
        match Int32.TryParse(configuration.GetSection("Hub:MaxMessageSizeBytes").Value) with
        | true, parsed when parsed > 0 -> parsed
        | _ -> 4 * 1024 * 1024

    // Rozeslání diffů mimo odpověď na command — tudy chodí výsledky dlouhých
    // ADO operací, které actor spouští asynchronně (ADR-008). Na rozdíl od hubu
    // tu není `Caller`, takže per-user diffy míří na `Clients.User`.
    let publishDiffs (hub: IHubContext<ProjectHub>) projectId userId (diffs: ProjectDiff list) =
        for diff in diffs do
            let clients =
                match deliveryOf diff with
                | Broadcast -> hub.Clients.Group(groupOf projectId)
                | SenderOnly
                | PerConnection -> hub.Clients.User(userId)

            clients.SendAsync("ReceiveDiff", diff) |> ignore

    services
        .AddSignalR(fun options ->
            options.EnableDetailedErrors <- detailedErrors
            options.MaximumReceiveMessageSize <- maxMessageSize
        )
        .AddJsonProtocol(fun options -> options.PayloadSerializerOptions <- hubOptions)
    |> ignore

    services.AddSingleton<PresenceTracker>() |> ignore
    services.AddSingleton<MembershipCache>() |> ignore

    configureDataProtection services environment configuration

    // PRD-06: timeout volání ADO je 30 sekund.
    services.AddHttpClient("ado", fun (client: HttpClient) -> client.Timeout <- TimeSpan.FromSeconds 30.0)
    |> ignore

    services.AddSingleton<ProjectActorRegistry>(fun provider ->
        let scopeFactory = provider.GetRequiredService<IServiceScopeFactory>()
        let logger = provider.GetRequiredService<ILogger<ProjectActorRegistry>>()
        let hub = provider.GetRequiredService<IHubContext<ProjectHub>>()

        let bridge =
            {
                ScopeFactory = scopeFactory
                // Purpose podle ADR-008; klíče spravuje Data Protection API.
                Protector = provider.GetRequiredService<IDataProtectionProvider>().CreateProtector "ado-pat"
                Http = provider.GetRequiredService<IHttpClientFactory>().CreateClient "ado"
            }

        let dependencies =
            { RegistryDependencies.Basic(EfProjectStore.create scopeFactory, actorOptions configuration) with
                Publish = publishDiffs hub
                Ado = AdoBridge.create bridge
            }

        ProjectActorRegistry(dependencies, logger)
    )
    |> ignore

    services.AddSingleton<IHostedService>(fun provider ->
        provider.GetRequiredService<ProjectActorRegistry>() :> IHostedService
    )
    |> ignore

    services.AddSingleton<HubServices>() |> ignore
    services.AddAuthorization() |> ignore
