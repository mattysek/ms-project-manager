/// SignalR hub projektu (ADR-004, PRD-02).
///
/// Hub je tenká vrstva: ověří členství, předá command actorovi a rozešle
/// diffy podle pravidel routingu z ADR-004. Žádná doménová logika tu není.
module MSProjectManager.Realtime.ProjectHub

open System.Threading.Tasks
open Microsoft.AspNetCore.Authorization
open Microsoft.AspNetCore.SignalR
open Microsoft.Extensions.Logging
open MSProjectManager.Domain.State
open MSProjectManager.Domain.Commands
open MSProjectManager.Domain.Diffs
open MSProjectManager.Protocol.Json
open MSProjectManager.Actors.ProjectActorRegistry
open MSProjectManager.Realtime.Presence
open MSProjectManager.Realtime.Membership

/// Název SignalR skupiny projektu.
let groupOf (projectId: string) = $"project:{projectId}"

/// Mění command stav projektu?
///
/// Archivovaný projekt je zamrzlý stav před smazáním, ne jen filtr v seznamu —
/// otevřít a číst ho jde dál, zapisovat ne. Presence z toho vypadává schválně:
/// je to informace o tom, kdo se dívá, ne o obsahu projektu, a bez ní by
/// v archivu zmizely avatary ostatních čtenářů.
let private mutatesProject (command: ProjectCommand) =
    match command with
    | SessionCmd(UpdatePresence _) -> false
    | _ -> true

/// Závislosti hubu pohromadě — DI je vloží jedním parametrem, takže hub
/// zůstává v limitu čtyř parametrů konstruktoru.
type HubServices(registry: ProjectActorRegistry, membership: MembershipCache, presence: PresenceTracker) =
    member _.Registry = registry
    member _.Membership = membership
    member _.Presence = presence

[<Authorize>]
type ProjectHub(services: HubServices, logger: ILogger<ProjectHub>) =
    inherit Hub()

    let registry = services.Registry
    let membership = services.Membership
    let presence = services.Presence

    member private this.UserId =
        match this.Context.UserIdentifier with
        | null -> ""
        | id -> id

    member private this.DisplayName =
        match Option.ofObj this.Context.User with
        | None -> this.UserId
        | Some user ->
            match user.FindFirst "displayName" with
            | null -> this.UserId
            | claim -> claim.Value

    /// Projekt, do kterého je spojení přihlášené — pro volání bez `projectId`.
    member private this.ResolveProject(projectId: string | null) =
        match projectId with
        | null -> presence.ProjectOf this.Context.ConnectionId
        | "" -> presence.ProjectOf this.Context.ConnectionId
        | value -> Some value

    member private this.SendPresence(projectId: string) =
        this.Clients.Group(groupOf projectId).SendAsync("PresenceUpdate", presence.Entries projectId)

    /// Pošle každému spojení v projektu jeho vlastní projekci stavu — cizí
    /// TODO a připomínky se tudy nedostanou ven.
    member private this.SendFullStateToAll(projectId: string) =
        task {
            let actor = registry.Get projectId

            for connectionId, userId in presence.ConnectionsIn projectId do
                let! snapshot = actor.FullState userId |> Async.StartAsTask

                match snapshot with
                | Ok state -> do! this.Clients.Client(connectionId).SendAsync("ReceiveFullState", state)
                | Error _ -> ()
        }

    member private this.Dispatch(projectId: string, diffs: ProjectDiff list) =
        task {
            for diff in diffs do
                match deliveryOf diff with
                | Broadcast -> do! this.Clients.Group(groupOf projectId).SendAsync("ReceiveDiff", diff)
                | SenderOnly -> do! this.Clients.Caller.SendAsync("ReceiveDiff", diff)
                | PerConnection -> do! this.SendFullStateToAll projectId
        }

    member private this.Fail(command: ProjectCommand, message: string) =
        logger.LogWarning("Odmítnutý command {Command} od {User}: {Message}", commandType command, this.UserId, message)
        this.Clients.Caller.SendAsync("ReceiveDiff", ErrorOccurred(message, commandType command))

    /// Připojení k projektu: ověří členství, přidá do skupiny a vrátí stav.
    member this.JoinProject(projectId: string) : Task<ClientAppState> =
        task {
            match! membership.TryGetRole(projectId, this.UserId) |> Async.StartAsTask with
            | None -> return raise (HubException "Nejste členem tohoto projektu")
            | Some _ ->
                do! this.Groups.AddToGroupAsync(this.Context.ConnectionId, groupOf projectId)

                presence.Join
                    {
                        ConnectionId = this.Context.ConnectionId
                        ProjectId = projectId
                        UserId = this.UserId
                        DisplayName = this.DisplayName
                    }

                let! snapshot = registry.Get(projectId).FullState this.UserId |> Async.StartAsTask
                do! this.SendPresence projectId

                match snapshot with
                | Ok state -> return state
                | Error message -> return raise (HubException message)
        }

    /// Opuštění projektu (FR-COLLAB-08).
    member this.LeaveProject(projectId: string) : Task =
        task {
            do! this.Groups.RemoveFromGroupAsync(this.Context.ConnectionId, groupOf projectId)
            presence.Leave this.Context.ConnectionId |> ignore
            do! this.SendPresence projectId
        }
        :> Task

    /// Vyžádání čerstvého stavu po reconnectu (FR-COLLAB-06).
    member this.GetFullState(projectId: string | null) : Task<ClientAppState> =
        task {
            match this.ResolveProject projectId with
            | None -> return raise (HubException "Není otevřený žádný projekt")
            | Some id ->
                match! membership.TryGetRole(id, this.UserId) |> Async.StartAsTask with
                | None -> return raise (HubException "Nejste členem tohoto projektu")
                | Some _ ->
                    match! registry.Get(id).FullState this.UserId |> Async.StartAsTask with
                    | Ok state -> return state
                    | Error message -> return raise (HubException message)
        }

    /// Předá command actorovi a rozešle výsledné diffy.
    member private this.Run(projectId: string, role: ProjectRole, command: ProjectCommand) =
        task {
            let user =
                {
                    UserId = this.UserId
                    DisplayName = this.DisplayName
                    Role = role
                }

            match! registry.Get(projectId).Execute(user, command) |> Async.StartAsTask with
            | Error message -> do! this.Fail(command, message)
            | Ok diffs ->
                do! this.Dispatch(projectId, diffs)

                match command with
                | SessionCmd(UpdatePresence view) ->
                    presence.SetView(this.Context.ConnectionId, view) |> ignore
                    do! this.SendPresence projectId
                | _ -> ()
        }

    /// Zpracuje command a rozešle diffy.
    member this.SendCommand(projectId: string | null, command: ProjectCommand) : Task =
        task {
            match this.ResolveProject projectId with
            | None -> do! this.Fail(command, "Není otevřený žádný projekt")
            | Some id ->
                match! membership.TryGetRole(id, this.UserId) |> Async.StartAsTask with
                | None -> do! this.Fail(command, "Nejste členem tohoto projektu")
                | Some role ->
                    let! isArchived = membership.IsArchived id |> Async.StartAsTask

                    if mutatesProject command && isArchived then
                        do! this.Fail(command, "Projekt je archivovaný — nejdřív ho vraťte z archivu")
                    else
                        do! this.Run(id, role, command)
        }
        :> Task

    override this.OnDisconnectedAsync(exn) =
        // `base` nejde volat zevnitř výrazu task {}, proto se volá dopředu.
        let baseCall = base.OnDisconnectedAsync exn

        task {
            match presence.Leave this.Context.ConnectionId with
            | Some projectId -> do! this.SendPresence projectId
            | None -> ()

            do! baseCall
        }
        :> Task
