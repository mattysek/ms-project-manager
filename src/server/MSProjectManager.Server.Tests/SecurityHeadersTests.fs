/// Bezpečnostní a cache hlavičky (`security.feature`, ADR-003 doplněk).
///
/// Testuje se přes skutečný hostitel, ne přes volání funkce middlewaru —
/// pointa je právě v tom, že hlavičky přežijí i odpovědi, které vyrábí někdo
/// jiný (statické soubory, SPA fallback, minimal API).
module MSProjectManager.Tests.SecurityHeadersTests

open System.Net.Http
open System.Net.Http.Json
open System.Threading.Tasks
open Xunit
open MSProjectManager.Tests.TestHost

/// Většina testů tu nepotřebuje přihlášení — hlavičky musí platit i pro
/// anonymní odpovědi.
let private withApp (run: TestApp -> Task<unit>) =
    task {
        use app = new TestApp()
        do! run app
    }

let private joinValues (found: bool, values: seq<string> | null) =
    match found, Option.ofObj values with
    | true, Some values -> Some(String.concat ", " values)
    | _ -> None

/// Hlavička může být na odpovědi i na jejím obsahu — `Content-Type` a spol.
/// žijí jinde než `X-Frame-Options`. Chybějící hlavička je prázdný řetězec,
/// ať se testy čtou jako rovnost.
let private header (response: HttpResponseMessage) (name: string) =
    joinValues (response.Headers.TryGetValues name)
    |> Option.orElseWith (fun () -> joinValues (response.Content.Headers.TryGetValues name))
    |> Option.defaultValue ""

let private cacheControl (response: HttpResponseMessage) =
    response.Headers.CacheControl
    |> Option.ofObj
    |> Option.map string
    |> Option.defaultValue ""

// @scenario: security.feature > Odpověď nese bezpečnostní hlavičky
[<Fact>]
let ``odpověď nese bezpečnostní hlavičky`` () =
    withApp (fun app ->
        task {
            use client = app.CreateClient()
            let! response = client.GetAsync "/auth/setup-required"

            Assert.Equal("nosniff", header response "X-Content-Type-Options")
            Assert.Equal("DENY", header response "X-Frame-Options")
            Assert.Equal("no-referrer", header response "Referrer-Policy")
            Assert.Contains("frame-ancestors 'none'", header response "Content-Security-Policy")
        }
    )

// @scenario: security.feature > Content-Security-Policy nepouští cizí skripty
[<Fact>]
let ``CSP nepouští cizí ani inline skripty`` () =
    withApp (fun app ->
        task {
            use client = app.CreateClient()
            let! response = client.GetAsync "/auth/setup-required"
            let csp = header response "Content-Security-Policy"

            Assert.Contains("default-src 'self'", csp)
            Assert.Contains("script-src 'self'", csp)
            Assert.Contains("object-src 'none'", csp)
            // `unsafe-inline` smí být jen u stylů (inline style={{…}} v komponentách).
            Assert.DoesNotContain("script-src 'self' 'unsafe-inline'", csp)
        }
    )

// @scenario: security.feature > Server neprozrazuje použitou technologii
[<Fact>]
let ``odpověď neprozrazuje server ani framework`` () =
    withApp (fun app ->
        task {
            use client = app.CreateClient()
            let! response = client.GetAsync "/auth/setup-required"

            Assert.Equal("", header response "Server")
            Assert.Equal("", header response "X-Powered-By")
        }
    )

// @scenario: security.feature > Přihlašovací cookie je chráněná
[<Fact>]
let ``přihlašovací cookie je HttpOnly a SameSite=Strict`` () =
    withApp (fun app ->
        task {
            let! _ = setupAdmin app "admin" "Admin5678"
            use client = app.CreateClient()

            let! response =
                client.PostAsJsonAsync(
                    "/auth/login",
                    {|
                        UserName = "admin"
                        Password = "Admin5678"
                    |}
                )

            let setCookie = header response "Set-Cookie"

            Assert.Contains("httponly", setCookie.ToLowerInvariant())
            Assert.Contains("samesite=strict", setCookie.ToLowerInvariant())
        }
    )

// @scenario: security.feature > Hashované assety se cachují napořád
[<Fact>]
let ``assety se cachují jako immutable`` () =
    Assert.Equal(
        MSProjectManager.Hosting.CacheHeaders.ImmutableCacheControl,
        MSProjectManager.Hosting.CacheHeaders.cacheControlFor "/assets/index-a1b2c3.js"
    )

// @scenario: security.feature > index.html a API se necachují
[<Fact>]
let ``index.html a API se necachují`` () =
    withApp (fun app ->
        task {
            use client = app.CreateClient()
            let! response = client.GetAsync "/auth/setup-required"

            Assert.Contains("no-store", cacheControl response)

            Assert.Equal(
                MSProjectManager.Hosting.CacheHeaders.NoStoreCacheControl,
                MSProjectManager.Hosting.CacheHeaders.cacheControlFor "/index.html"
            )
        }
    )

// @scenario: security.feature > SPA fallback taky dostane hlavičky
[<Fact>]
let ``SPA fallback dostane hlavičky taky`` () =
    withApp (fun app ->
        task {
            use client = app.CreateClient()
            // Cesta, kterou obsluhuje `MapFallbackToFile` — právě sem
            // `OnPrepareResponse` statických souborů nedosáhne.
            let! response = client.GetAsync "/projekt/libovolna-cesta"

            Assert.Contains("no-store", cacheControl response)
            Assert.Equal("nosniff", header response "X-Content-Type-Options")
        }
    )
