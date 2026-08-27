/// Kdo co „vlastní" (ADR-006, doplněk „vlastní znamená co?").
///
/// Osoba v projektu a uživatelský účet jsou dvě různé entity; spojuje je
/// `Person.UserId`. Vlastnictví se proto nikdy neodvozuje z `Person.Id`.
module MSProjectManager.Domain.Ownership

open MSProjectManager.Domain.Types
open MSProjectManager.Domain.State

/// Patří osoba tomuto účtu? Osoba bez účtu (`UserId = null`) nepatří nikomu.
let personOwnedBy (userId: string) (person: Person) =
    match person.UserId with
    | null -> false
    | owner -> owner = userId

/// Osoby projektu přiřazené danému účtu (v praxi nejvýš jedna).
let personsOf (state: AppState) (userId: string) =
    state.People |> List.filter (personOwnedBy userId)

/// Vlastní uživatel osobu s tímto id?
let ownsPerson (state: AppState) (userId: string) (personId: string) =
    state.People
    |> List.exists (fun person -> person.Id = personId && personOwnedBy userId person)

/// Vlastní uživatel úkol přiřazený této osobě? Úkol v backlogu (prázdné `P`)
/// nepatří nikomu.
let ownsAssignment (state: AppState) (userId: string) (personId: string) =
    not (System.String.IsNullOrEmpty personId) && ownsPerson state userId personId

/// Vlastní uživatel tento úkol? Neexistující úkol propouštíme — jeho
/// neexistenci hlásí reducer vlastní chybou.
let ownsTask (state: AppState) (userId: string) (taskId: string) =
    match state.Tasks |> List.tryFind (fun task -> task.Id = taskId) with
    | Some task -> ownsAssignment state userId task.P
    | None -> true
