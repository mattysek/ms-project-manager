/// Explicitní `Cache-Control` na každé odpovědi (ADR-011, PRD-00).
///
/// Smysl je zbavit se heuristického cachování: odpověď bez `Cache-Control`
/// si prohlížeč smí uložit sám podle `Last-Modified` (typicky na desetinu
/// stáří dokumentu). Tichý důsledek je stará aplikace nebo stará data v API,
/// aniž by kdokoli něco nakonfiguroval.
///
/// Proč middleware, a ne `OnPrepareResponse` u statických souborů: ten se
/// nevztahuje na `MapFallbackToFile`, kterým se servíruje `index.html` pro
/// všechny SPA cesty, ani na API. Právě ty odpovědi zůstávaly bez hlavičky.
module MSProjectManager.Hosting.CacheHeaders

open System
open System.Threading.Tasks
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http

/// Assety mají hash v názvu, takže se nikdy nemění pod rukama.
[<Literal>]
let ImmutableCacheControl = "public, max-age=31536000, immutable"

/// Všechno ostatní: `index.html`, API, přílohy, auth.
[<Literal>]
let NoStoreCacheControl = "no-cache, no-store, must-revalidate"

/// Je cesta hashovaný build artefakt? Rozhoduje adresář, ne přípona —
/// `assets/` vyrábí Vite a nic jiného tam nepatří.
let isImmutableAsset (path: string) =
    path.StartsWith("/assets/", StringComparison.Ordinal)

let cacheControlFor (path: string) =
    if isImmutableAsset path then
        ImmutableCacheControl
    else
        NoStoreCacheControl

let private applyTo (context: HttpContext) =
    let path = context.Request.Path.Value |> Option.ofObj |> Option.defaultValue ""

    context.Response.Headers.CacheControl <- cacheControlFor path

    if not (isImmutableAsset path) then
        // HTTP/1.0 proxy a starší prohlížeče `Cache-Control` ignorují.
        context.Response.Headers.Pragma <- "no-cache"
        context.Response.Headers.Expires <- "0"

let use' (app: WebApplication) =
    app.Use(fun (context: HttpContext) (next: RequestDelegate) ->
        context.Response.OnStarting(fun () ->
            applyTo context
            Task.CompletedTask
        )

        next.Invoke context
    )
    |> ignore
