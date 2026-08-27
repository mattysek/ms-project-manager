/// Servírování SPA z `wwwroot` (ADR-011, PRD-00).
///
/// Cache hlavičky tady nejsou schválně — nastavuje je `CacheHeaders`, protože
/// `OnPrepareResponse` se nevztahuje na `MapFallbackToFile`, kterým se
/// `index.html` servíruje pro všechny SPA cesty.
module MSProjectManager.Hosting.StaticFiles

open Microsoft.AspNetCore.Builder

/// Statické soubory + SPA fallback.
let use' (app: WebApplication) =
    app.UseDefaultFiles() |> ignore
    app.UseStaticFiles() |> ignore
    app.MapFallbackToFile("index.html").AllowAnonymous() |> ignore
