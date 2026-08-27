/// Presence — kdo je online, v jakém projektu a na jakém view (FR-COLLAB-04).
///
/// Efemérní stav spojení, do `AppState` nepatří (ADR-004). Drží se v paměti
/// procesu; po restartu se sestaví znovu tím, jak se klienti připojí.
module MSProjectManager.Realtime.Presence

open System.Collections.Concurrent
open MSProjectManager.Domain.State

/// Paleta barev avatarů — stejná jako `PERSON_COLORS` na frontendu.
let private palette =
    [|
        "#4f9cf9"
        "#34d399"
        "#06b6d4"
        "#a78bfa"
        "#fbbf24"
        "#f87171"
        "#fb923c"
        "#e879f9"
        "#a3e635"
        "#38bdf8"
    |]

/// Stabilní barva uživatele — stejný účet má stejný avatar u všech.
let colorOf (userId: string) =
    let hash = userId |> Seq.sumBy int
    palette.[abs hash % palette.Length]

type private Connection =
    {
        ProjectId: string
        UserId: string
        DisplayName: string
        View: string
    }

/// Připojení k projektu.
type Joining =
    {
        ConnectionId: string
        ProjectId: string
        UserId: string
        DisplayName: string
    }

type PresenceTracker() =
    let connections = ConcurrentDictionary<string, Connection>()

    let toEntry (connection: Connection) : PresenceEntry =
        {
            UserId = connection.UserId
            DisplayName = connection.DisplayName
            View = connection.View
            Color = colorOf connection.UserId
        }

    /// Zaregistruje spojení v projektu.
    member _.Join(joining: Joining) =
        connections.[joining.ConnectionId] <-
            {
                ProjectId = joining.ProjectId
                UserId = joining.UserId
                DisplayName = joining.DisplayName
                View = ""
            }

    /// Aktualizuje view spojení; vrací projekt, kterého se to týká.
    member _.SetView(connectionId: string, view: string) =
        match connections.TryGetValue connectionId with
        | true, connection ->
            connections.[connectionId] <- { connection with View = view }
            Some connection.ProjectId
        | _ -> None

    /// Projekt, do kterého je spojení přihlášené.
    member _.ProjectOf(connectionId: string) =
        match connections.TryGetValue connectionId with
        | true, connection -> Some connection.ProjectId
        | _ -> None

    /// Odhlásí spojení; vrací projekt, ze kterého odešlo.
    member _.Leave(connectionId: string) =
        match connections.TryRemove connectionId with
        | true, connection -> Some connection.ProjectId
        | _ -> None

    /// Kdo je v projektu (jeden záznam na uživatele, i když má víc oken).
    member _.Entries(projectId: string) : PresenceEntry list =
        connections.Values
        |> Seq.filter (fun connection -> connection.ProjectId = projectId)
        |> Seq.groupBy (fun connection -> connection.UserId)
        |> Seq.choose (fun (_, group) -> group |> Seq.tryHead |> Option.map toEntry)
        |> Seq.sortBy (fun entry -> entry.DisplayName)
        |> Seq.toList

    /// Dvojice (spojení, uživatel) v projektu — pro per-connection doručení.
    member _.ConnectionsIn(projectId: string) =
        connections
        |> Seq.filter (fun pair -> pair.Value.ProjectId = projectId)
        |> Seq.map (fun pair -> pair.Key, pair.Value.UserId)
        |> Seq.toList
