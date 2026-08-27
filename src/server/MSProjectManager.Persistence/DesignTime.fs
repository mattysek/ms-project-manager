/// Továrna kontextu pro `dotnet ef` (design time).
///
/// EF nástroje potřebují `AppDbContext` vytvořit bez běžícího hosta; connection
/// string je proto jen dočasný soubor vedle projektu — migrace se generují
/// z modelu, ne z dat.
module MSProjectManager.Persistence.DesignTime

open Microsoft.EntityFrameworkCore
open Microsoft.EntityFrameworkCore.Design
open MSProjectManager.Persistence.AppDbContext

/// Cesta k databázi používaná jen nástroji `dotnet ef`.
[<Literal>]
let DesignTimeDatabase = "msprojectmanager-design.db"

/// Assembly, ve které leží migrace. Je to jediný C# projekt v repozitáři —
/// EF Core neumí generovat migrace pro F#, ale řídí se jazykem *migračního*
/// projektu, ne projektu s kontextem (ADR-013).
[<Literal>]
let MigrationsAssembly = "MSProjectManager.Migrations"

type AppDbContextFactory() =
    interface IDesignTimeDbContextFactory<AppDbContext> with
        member _.CreateDbContext(_args: string[]) =
            let builder = DbContextOptionsBuilder<AppDbContext>()

            builder.UseSqlite(
                MSProjectManager.Persistence.Sqlite.connectionString DesignTimeDatabase,
                fun options -> options.MigrationsAssembly MigrationsAssembly |> ignore
            )
            |> ignore

            new AppDbContext(builder.Options)
