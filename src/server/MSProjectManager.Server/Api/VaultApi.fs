/// Trezor hesel — per-user REST (PRD-09, ADR-016).
///
/// Server je tu úložiště, ne účastník: `ciphertext` přijde zašifrovaný
/// z prohlížeče a stejně zašifrovaný odejde. Heslo k trezoru nezná, klíč
/// nemá a obsah nemá jak přečíst — proto tu není žádná validace obsahu,
/// jen vlastnictví a velikost.
///
/// Mimo SignalR ze stejného důvodu jako quick notes, jen naléhavěji:
/// `AppState` se broadcastuje všem členům projektu (ADR-004), a trezor je
/// soukromý.
module MSProjectManager.Api.VaultApi

open System
open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open MSProjectManager.Persistence.AppDbContext
open MSProjectManager.Persistence.Repositories
open MSProjectManager.Api.Contracts
open MSProjectManager.Api.Http

let private db (ctx: HttpContext) = service<AppDbContext> ctx

/// Trezor, který ještě není založený — klient podle toho nabídne založení.
let private missingProfile: VaultProfileResponse =
    {
        Exists = false
        Kdf = ""
        Iterations = 0
        Salt = ""
        Verifier = ""
        VerifierIv = ""
    }

let private toProfileResponse (profile: Vault.VaultProfile) : VaultProfileResponse =
    {
        Exists = true
        Kdf = profile.Kdf
        Iterations = profile.Iterations
        Salt = profile.Salt
        Verifier = profile.Verifier
        VerifierIv = profile.VerifierIv
    }

let private toEntryResponse (entry: Vault.VaultEntry) : VaultEntryResponse =
    {
        Id = entry.Id
        Ciphertext = entry.Ciphertext
        Iv = entry.Iv
        CreatedAt = entry.CreatedAt
        UpdatedAt = entry.UpdatedAt
    }

let private entryId (request: VaultEntryRequest) =
    match Option.ofObj request.Id with
    | Some value when not (String.IsNullOrWhiteSpace value) -> value
    | _ -> Guid.NewGuid().ToString "N"

/// `GET /api/vault` — parametry odvození klíče, ne obsah.
let profile (ctx: HttpContext) : Task<IResult> =
    task {
        let! found = Vault.tryGetProfile (db ctx) (userId ctx)

        return
            found
            |> Option.map toProfileResponse
            |> Option.defaultValue missingProfile
            |> Results.Json
    }

/// `POST /api/vault` — založení trezoru.
let create (ctx: HttpContext) : Task<IResult> =
    task {
        match! readJson<CreateVaultRequest> ctx with
        | None -> return badRequest "Chybí parametry trezoru"
        | Some request ->
            let! created =
                Vault.createProfile
                    (db ctx)
                    {
                        UserId = userId ctx
                        Kdf = request.Kdf
                        Iterations = request.Iterations
                        Salt = request.Salt
                        Verifier = request.Verifier
                        VerifierIv = request.VerifierIv
                    }

            match created with
            | Ok value -> return Results.Json(toProfileResponse value)
            | Error message -> return badRequest message
    }

/// `GET /api/vault/entries` — zašifrované záznamy přihlášeného uživatele.
let list (ctx: HttpContext) : Task<IResult> =
    task {
        let! entries = Vault.listEntries (db ctx) (userId ctx)
        return entries |> List.map toEntryResponse |> Results.Json
    }

/// `POST /api/vault/entries`
let createEntry (ctx: HttpContext) : Task<IResult> =
    task {
        match! readJson<VaultEntryRequest> ctx with
        | None -> return badRequest "Chybí obsah záznamu"
        | Some request ->
            let! created =
                Vault.createEntry
                    (db ctx)
                    {
                        Id = entryId request
                        UserId = userId ctx
                        Ciphertext = request.Ciphertext
                        Iv = request.Iv
                    }

            match created with
            | Ok entry -> return Results.Json(toEntryResponse entry)
            | Error message -> return badRequest message
    }

/// `PUT /api/vault/entries/{id}`
let updateEntry (ctx: HttpContext) (id: string) : Task<IResult> =
    task {
        match! readJson<VaultEntryRequest> ctx with
        | None -> return badRequest "Chybí obsah záznamu"
        | Some request ->
            let! updated =
                Vault.updateEntry
                    (db ctx)
                    {
                        Id = id
                        UserId = userId ctx
                        Ciphertext = request.Ciphertext
                        Iv = request.Iv
                    }

            match updated with
            | Ok entry -> return Results.Json(toEntryResponse entry)
            | Error message -> return notFound message
    }

/// `DELETE /api/vault/entries/{id}` — cizí záznam se tváří jako neexistující.
let deleteEntry (ctx: HttpContext) (id: string) : Task<IResult> =
    task {
        let! deleted = Vault.deleteEntry (db ctx) id (userId ctx)

        if deleted then
            return Results.NoContent()
        else
            return notFound "Záznam neexistuje"
    }

/// `POST /api/vault/rekey` — změna hesla trezoru jedním atomickým zápisem.
let rekey (ctx: HttpContext) : Task<IResult> =
    task {
        match! readJson<RekeyVaultRequest> ctx with
        | None -> return badRequest "Chybí parametry trezoru"
        | Some request ->
            let entries =
                request.Entries
                |> Option.ofObj
                |> Option.defaultValue [||]
                |> Array.toList
                |> List.map (fun entry ->
                    ({
                        Id = entryId entry
                        UserId = userId ctx
                        Ciphertext = entry.Ciphertext
                        Iv = entry.Iv
                    }
                    : Vault.VaultEntryInput)
                )

            let! result =
                Vault.rekey
                    (db ctx)
                    {
                        UserId = userId ctx
                        Kdf = request.Kdf
                        Iterations = request.Iterations
                        Salt = request.Salt
                        Verifier = request.Verifier
                        VerifierIv = request.VerifierIv
                    }
                    entries

            match result with
            | Ok value -> return Results.Json(toProfileResponse value)
            | Error message -> return badRequest message
    }

/// `DELETE /api/vault` — zrušení trezoru bez znalosti hesla (FR-VAULT-10).
let deleteVault (ctx: HttpContext) : Task<IResult> =
    task {
        let! deleted = Vault.deleteVault (db ctx) (userId ctx)

        if deleted then
            return Results.NoContent()
        else
            return notFound "Trezor neexistuje"
    }
