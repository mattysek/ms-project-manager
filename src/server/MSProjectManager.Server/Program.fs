/// Vstupní bod serveru.
///
/// Hostuje se jako Windows Service (`UseWindowsService` je na jiných
/// systémech no-op), stav projektů drží aktory v paměti a SQLite je jediné
/// úložiště (ADR-001, ADR-002).
module MSProjectManager.Program

open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Hosting
open Microsoft.AspNetCore.Identity
open Microsoft.EntityFrameworkCore
open Microsoft.Extensions.DependencyInjection
open Microsoft.Extensions.Hosting
open MSProjectManager.Persistence.AppDbContext
open MSProjectManager.Hosting

/// Připraví databázi: pragmy (WAL, page_size) musí být dřív než migrace,
/// protože `page_size` jde nastavit jen na prázdném souboru (ADR-010).
let private prepareDatabase (app: WebApplication) =
    let path = Options.databasePath app.Environment app.Configuration
    MSProjectManager.Persistence.Sqlite.initialize path

    use scope = app.Services.CreateScope()
    let db = scope.ServiceProvider.GetRequiredService<AppDbContext>()
    db.Database.Migrate()

    let roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>()

    if not (roles.RoleExistsAsync(MSProjectManager.Api.Auth.AdminRole).Result) then
        roles.CreateAsync(IdentityRole MSProjectManager.Api.Auth.AdminRole).Result
        |> ignore

/// Poskládá aplikaci; sdílí ho i integrační testy.
let buildApp (args: string[]) =
    let builder = WebApplication.CreateBuilder(args)
    builder.Host.UseWindowsService() |> ignore

    // `Server: Kestrel` zbytečně prozrazuje, na čem to běží.
    builder.WebHost.ConfigureKestrel(fun options -> options.AddServerHeader <- false)
    |> ignore

    Services.register builder.Services builder.Environment builder.Configuration
    let app = builder.Build()

    // Hlavičky co nejdřív v pipeline, ať platí i pro odpovědi, které vzniknou
    // dřív než autentizace (přesměrování, 401, statické soubory).
    SecurityHeaders.use' app
    CacheHeaders.use' app

    if (Options.auth app.Configuration).RequireHttps then
        app.UseHsts() |> ignore
        app.UseHttpsRedirection() |> ignore

    app.UseAuthentication() |> ignore
    app.UseAuthorization() |> ignore
    Endpoints.map app
    StaticFiles.use' app
    app

[<EntryPoint>]
let main args =
    let app = buildApp args
    prepareDatabase app
    app.Run()
    0
