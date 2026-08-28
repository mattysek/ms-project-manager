/// Přihlášení, odhlášení, změna hesla a první spuštění (PRD-01, ADR-003).
module MSProjectManager.Api.Auth

open System.Linq
open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open Microsoft.AspNetCore.Identity
open Microsoft.EntityFrameworkCore
open Microsoft.Extensions.Configuration
open MSProjectManager.Persistence.Entities
open MSProjectManager.Api.Contracts
open MSProjectManager.Api.Http

/// Role administrátora v Identity.
[<Literal>]
let AdminRole = "admin"

/// Hláška nesmí prozradit, jestli účet existuje (FR-AUTH-01).
[<Literal>]
let InvalidCredentials = "Nesprávné uživatelské jméno nebo heslo"

[<Literal>]
let LockedOut = "Účet je dočasně uzamčen. Zkuste to znovu za 15 minut."

[<Literal>]
let PasswordTooShort = "Heslo musí mít alespoň 8 znaků"

let private users (ctx: HttpContext) = service<UserManager<AppUser>> ctx
let private signIn (ctx: HttpContext) = service<SignInManager<AppUser>> ctx

/// Konfigurační klíč pro samoobslužnou registraci (FR-AUTH-08).
[<Literal>]
let AllowSelfRegistrationKey = "Auth:AllowSelfRegistration"

/// Smí si uživatel založit účet sám?
///
/// Čte se z `IConfiguration` rovnou tady, ne přes `Hosting.Options.AuthOptions`:
/// tenhle modul je jediný konzument a `Api` se překládá před `Hosting`, takže
/// na ten typ ani nedosáhne. Výchozí hodnota je **zapnuto**.
let private selfRegistrationAllowed (ctx: HttpContext) =
    match (service<IConfiguration> ctx).GetSection(AllowSelfRegistrationKey).Value with
    | null -> true
    | text ->
        match bool.TryParse text with
        | true, value -> value
        // Překlep v konfiguraci nesmí registraci tiše otevřít.
        | false, _ -> false

let private currentUser (manager: UserManager<AppUser>) (user: AppUser) =
    task {
        let! roles = manager.GetRolesAsync user

        return
            {
                UserId = user.Id
                UserName = user.UserName |> Option.ofObj |> Option.defaultValue ""
                DisplayName = user.DisplayName
                IsAdmin = roles.Contains AdminRole
            }
    }

/// Přeloží chyby Identity do češtiny; delší hesla mají vlastní hlášku, aby
/// odpovídala scénáři „Nové heslo nesplňuje minimální délku".
let describeIdentityErrors (result: IdentityResult) =
    let codes = result.Errors |> Seq.map (fun error -> error.Code) |> Seq.toList

    if codes |> List.contains "PasswordTooShort" then
        PasswordTooShort
    elif codes |> List.contains "DuplicateUserName" then
        "Uživatelské jméno je již obsazeno"
    elif codes |> List.contains "PasswordMismatch" then
        "Současné heslo není správné"
    else
        result.Errors
        |> Seq.map (fun error -> error.Description)
        |> String.concat " "
        |> fun text -> if text = "" then "Požadavek se nezdařil" else text

/// `POST /auth/login`
let login (ctx: HttpContext) : Task<IResult> =
    task {
        match! readJson<LoginRequest> ctx with
        | None -> return badRequest InvalidCredentials
        | Some request ->
            let manager = users ctx
            let! user = manager.FindByNameAsync request.UserName

            match Option.ofObj user with
            // Neexistující účet i špatné heslo vrací totéž.
            | None -> return unauthorized InvalidCredentials
            | Some found when not found.IsActive -> return unauthorized InvalidCredentials
            | Some found ->
                let! result = (signIn ctx).PasswordSignInAsync(found, request.Password, true, true)

                if result.IsLockedOut then
                    return error StatusCodes.Status423Locked LockedOut
                elif not result.Succeeded then
                    return unauthorized InvalidCredentials
                else
                    let! current = currentUser manager found
                    return Results.Json current
    }

/// `POST /auth/logout`
let logout (ctx: HttpContext) : Task<IResult> =
    task {
        do! (signIn ctx).SignOutAsync()
        return Results.NoContent()
    }

/// `GET /auth/me`
let me (ctx: HttpContext) : Task<IResult> =
    task {
        let manager = users ctx
        let! user = manager.FindByIdAsync(userId ctx)

        match Option.ofObj user with
        | None -> return unauthorized "Nejste přihlášen"
        | Some found ->
            let! current = currentUser manager found
            return Results.Json current
    }

/// `POST /auth/change-password`
let changePassword (ctx: HttpContext) : Task<IResult> =
    task {
        match! readJson<ChangePasswordRequest> ctx with
        | None -> return badRequest "Chybí heslo"
        | Some request ->
            let manager = users ctx
            let! user = manager.FindByIdAsync(userId ctx)

            match Option.ofObj user with
            | None -> return unauthorized "Nejste přihlášen"
            | Some found ->
                let! result = manager.ChangePasswordAsync(found, request.CurrentPassword, request.NewPassword)

                if result.Succeeded then
                    return
                        Results.Json
                            {|
                                message = "Heslo bylo úspěšně změněno"
                            |}
                else
                    return badRequest (describeIdentityErrors result)
    }

/// `GET /auth/setup-required` — anonymní „co se tu dá dělat" před přihlášením.
///
/// Kromě prvního spuštění nese i příznak registrace (FR-AUTH-08): klient obojí
/// potřebuje ve stejnou chvíli a druhý round trip by za to nestál. Cesta
/// zůstává, i když název už nepokrývá celý obsah — `e2e/run.sh` na ni čeká
/// jako na healthcheck a měnit ji by znamenalo měnit i to.
let setupRequired (ctx: HttpContext) : Task<IResult> =
    task {
        let manager = users ctx
        let! any = manager.Users.AnyAsync()

        return
            Results.Json
                {|
                    required = not any
                    registrationAllowed = selfRegistrationAllowed ctx
                |}
    }

/// `POST /auth/register` — samoobslužné založení účtu (FR-AUTH-08).
///
/// Tři odmítnutí, každé z jiného důvodu:
/// - vypnutá registrace → 403, a to **na serveru**; skrytý odkaz v UI není
///   autorizace,
/// - prázdná databáze → 409, protože do ní patří admin přes `/auth/setup`.
///   Jinak by první příchozí dostal běžný účet a systém by zůstal bez
///   administrátora,
/// - obsazené jméno → 400 s konkrétní hláškou. Registrace existenci účtu
///   prozradit musí, jinak nejde říct, proč založení neprošlo — na rozdíl od
///   přihlášení, kde platí opak (ADR-003, doplněk).
let register (ctx: HttpContext) : Task<IResult> =
    task {
        if not (selfRegistrationAllowed ctx) then
            return forbidden "Registrace není povolená"
        else
            let manager = users ctx
            let! any = manager.Users.AnyAsync()

            if not any then
                return conflict "Aplikace ještě není nastavená"
            else
                match! readJson<RegisterRequest> ctx with
                | None -> return badRequest "Chybí údaje účtu"
                | Some request ->
                    let user =
                        AppUser(
                            UserName = request.UserName,
                            DisplayName = request.DisplayName,
                            IsActive = true
                        )

                    let! created = manager.CreateAsync(user, request.Password)

                    if not created.Succeeded then
                        return badRequest (describeIdentityErrors created)
                    else
                        // Žádná role: registrovaný účet je běžný uživatel bez
                        // členství v projektu (ADR-003, doplněk).
                        do! (signIn ctx).SignInAsync(user, true)
                        let! current = currentUser manager user
                        return Results.Json current
    }

/// `POST /auth/setup` — vytvoří prvního admina a rovnou ho přihlásí (FR-AUTH-07).
let setup (ctx: HttpContext) : Task<IResult> =
    task {
        let manager = users ctx
        let! any = manager.Users.AnyAsync()

        if any then
            return conflict "Aplikace už je nastavená"
        else
            match! readJson<SetupRequest> ctx with
            | None -> return badRequest "Chybí údaje účtu"
            | Some request ->
                let user =
                    AppUser(UserName = request.UserName, DisplayName = request.DisplayName, IsActive = true)

                let! created = manager.CreateAsync(user, request.Password)

                if not created.Succeeded then
                    return badRequest (describeIdentityErrors created)
                else
                    let! _ = manager.AddToRoleAsync(user, AdminRole)
                    do! (signIn ctx).SignInAsync(user, true)
                    let! current = currentUser manager user
                    return Results.Json current
    }
