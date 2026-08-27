/// Pomocníci pro minimal API handlery.
///
/// Handlery berou `HttpContext` a služby si tahají z `RequestServices` —
/// je to o pár řádků delší než binding přes atributy, ale v F# předvídatelné
/// a bez reflexe.
module MSProjectManager.Api.Http

open System.Security.Claims
open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open Microsoft.Extensions.DependencyInjection
open MSProjectManager.Api.Contracts

/// Id přihlášeného uživatele (`AspNetUsers.Id`).
let userId (ctx: HttpContext) =
    match ctx.User.FindFirstValue ClaimTypes.NameIdentifier with
    | null -> ""
    | value -> value

/// Zobrazované jméno z claimu, s fallbackem na uživatelské jméno.
let displayName (ctx: HttpContext) =
    match ctx.User.FindFirstValue "displayName" with
    | null ->
        ctx.User.FindFirstValue ClaimTypes.Name
        |> Option.ofObj
        |> Option.defaultValue ""
    | value -> value

/// Hodnota z cesty (`{id}`). F# `Func` delegáty nemají použitelné názvy
/// parametrů, takže se na binding podle jména nedá spolehnout — čteme
/// route values ručně.
let routeValue (ctx: HttpContext) (name: string) =
    match ctx.Request.RouteValues.TryGetValue name with
    | true, value -> value |> Option.ofObj |> Option.map string |> Option.defaultValue ""
    | _ -> ""

/// Služba z DI scope requestu.
let service<'T when 'T: not struct and 'T: not null> (ctx: HttpContext) =
    ctx.RequestServices.GetRequiredService<'T>()

/// Tělo požadavku; `None` při prázdném nebo nevalidním JSONu.
let readJson<'T when 'T: not struct and 'T: not null> (ctx: HttpContext) : Task<'T option> =
    task {
        try
            let! value = ctx.Request.ReadFromJsonAsync<'T>()
            return Option.ofObj value
        with _ ->
            return None
    }

/// Chybová odpověď s českou hláškou v poli `message`.
let error (status: int) (message: string) : IResult =
    Results.Json({ Message = message }, statusCode = status)

let badRequest (message: string) =
    error StatusCodes.Status400BadRequest message

let unauthorized (message: string) =
    error StatusCodes.Status401Unauthorized message

let forbidden (message: string) =
    error StatusCodes.Status403Forbidden message

let notFound (message: string) =
    error StatusCodes.Status404NotFound message

let conflict (message: string) =
    error StatusCodes.Status409Conflict message

/// Výsledek `Result` z repozitáře na HTTP odpověď.
let ofResult (onOk: unit -> IResult) (result: Result<unit, string>) =
    match result with
    | Ok() -> onOk ()
    | Error message -> badRequest message
