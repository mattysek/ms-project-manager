/// Přihlášení, odhlášení, změna hesla a první spuštění (PRD-01, ADR-003).
module MSProjectManager.Api.Auth

open System.Linq
open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open Microsoft.AspNetCore.Identity
open Microsoft.EntityFrameworkCore
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

/// `GET /auth/setup-required` — prázdná databáze znamená první spuštění.
let setupRequired (ctx: HttpContext) : Task<IResult> =
    task {
        let manager = users ctx
        let! any = manager.Users.AnyAsync()
        return Results.Json {| required = not any |}
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
