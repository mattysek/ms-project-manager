/// Bezpečnostní hlavičky na každé odpovědi (ADR-003, doplněk).
///
/// Hlavičky se nastavují v `OnStarting`, tedy až těsně před odesláním —
/// jinak by je přepsal ten middleware, který odpověď skutečně vyrábí
/// (statické soubory, minimal API, SignalR).
module MSProjectManager.Hosting.SecurityHeaders

open System.Threading.Tasks
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http

/// Content-Security-Policy.
///
/// Dvě místa, kde politika nemůže být přísnější, než je:
///
/// `style-src 'unsafe-inline'` — komponenty používají inline `style={{…}}`
/// (Gantt bary, barvy kategorií), což jsou style *atributy*. Bez `unsafe-inline`
/// by se přestaly aplikovat. Vyřešit by to šlo jen přepsáním na CSS třídy.
///
/// `frame-src 'self'` — náhled PDF se renderuje v `<iframe>` na vlastní origin
/// (`PreviewModal`). Prohlížečový PDF viewer běží v sandboxu, na DOM rodiče
/// nedosáhne.
///
/// `script-src` naopak přísné být může: Vite build emituje externí modul
/// s hashem v názvu, žádný inline `<script>` v `index.html` není.
let ContentSecurityPolicy =
    String.concat
        "; "
        [
            "default-src 'self'"
            "script-src 'self'"
            "style-src 'self' 'unsafe-inline'"
            "img-src 'self' data: blob:"
            "font-src 'self' data:"
            "connect-src 'self'"
            "frame-src 'self'"
            "object-src 'none'"
            "base-uri 'self'"
            "form-action 'self'"
            "frame-ancestors 'none'"
        ]

/// Hlavičky, které přidáváme.
let headers =
    [
        "Content-Security-Policy", ContentSecurityPolicy
        // Přílohy jsou uživatelský obsah — sniffing typu je u nich přímo cesta k XSS.
        "X-Content-Type-Options", "nosniff"
        // `frame-ancestors` v CSP dělá totéž; tohle je pro staré prohlížeče.
        "X-Frame-Options", "DENY"
        // Ať se URL projektu (a org URL v ADO) nešíří v Refereru.
        "Referrer-Policy", "no-referrer"
        "Permissions-Policy", "camera=(), microphone=(), geolocation=()"
        "Cross-Origin-Opener-Policy", "same-origin"
        "Cross-Origin-Resource-Policy", "same-origin"
    ]

/// Hlavičky, které naopak odstraňujeme — prozrazují technologii serveru.
/// `Server` vypíná Kestrel sám (`AddServerHeader <- false`), `X-Powered-By`
/// přidává až IIS, takže tady jde o pojistku pro nasazení za reverse proxy.
let strippedHeaders = [ "Server"; "X-Powered-By" ]

let private applyTo (response: HttpResponse) =
    for name, value in headers do
        response.Headers[name] <- value

    for name in strippedHeaders do
        response.Headers.Remove name |> ignore

let use' (app: WebApplication) =
    app.Use(fun (context: HttpContext) (next: RequestDelegate) ->
        context.Response.OnStarting(fun () ->
            applyTo context.Response
            Task.CompletedTask
        )

        next.Invoke context
    )
    |> ignore
