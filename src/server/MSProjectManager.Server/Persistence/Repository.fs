/// Společné drobnosti repozitářů — čas, mapování role a null sloupců.
module MSProjectManager.Persistence.Repository

open System
open Microsoft.EntityFrameworkCore
open MSProjectManager.Domain.State

/// ISO 8601 UTC — sdílené s actorem, viz `Common.Clock`.
let nowIso = MSProjectManager.Common.Clock.nowIso

/// Role v DB je text `pm` / `dev` (CHECK constraint v `project_members`).
let roleToText (role: ProjectRole) =
    match role with
    | Pm -> "pm"
    | Dev -> "dev"

/// Přečte roli z DB; neznámá hodnota je chyba dat, ne důvod k pádu serveru.
let roleOfText (text: string) =
    match text with
    | "pm" -> Some Pm
    | "dev" -> Some Dev
    | _ -> None

/// Nullable sloupec na `option`.
let ofNullable (value: string | null) : string option = Option.ofObj value

/// `option` na nullable sloupec.
let toNullable (value: string option) : string | null =
    match value with
    | Some text -> text
    | None -> null

/// Uloží změny a vyprázdní change tracker.
///
/// Repozitáře jsou bezstavové: jedna operace = jedna transakce. Bez vyčištění
/// by v kontextu zůstávaly sledované instance z předchozích volání a další
/// `Update` se stejným klíčem by skončil konfliktem identit.
let saveChanges (db: DbContext) =
    async {
        do! db.SaveChangesAsync() |> Async.AwaitTask |> Async.Ignore
        db.ChangeTracker.Clear()
    }
