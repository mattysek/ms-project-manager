/// Actor jednoho otevřeného projektu (ADR-002).
///
/// Jediná autorita nad stavem projektu: všechny mutace jdou přes mailbox,
/// zpracovávají se sekvenčně, takže nejsou potřeba zámky ani transakce.
/// Actor sám nic nebroadcastuje — vrátí diffy volajícímu (hubu), aby nemusel
/// znát SignalR a šel testovat bez serveru.
///
/// Životní cyklus: první zpráva načte stav z DB, `Tick` každých pár sekund
/// uloží změny (debounce) a po 15 minutách nečinnosti actor uloží a skončí.
module MSProjectManager.Actors.ProjectActor

open System
open MSProjectManager.Common.Clock
open MSProjectManager.Domain.State
open MSProjectManager.Domain.Commands
open MSProjectManager.Domain.Diffs
open MSProjectManager.Domain.AdoGateway
open MSProjectManager.Domain.Reducer
open MSProjectManager.Actors.ProjectStore

/// Ladicí šrouby actoru; testy si je zkracují na milisekundy.
type ActorOptions =
    {
        PersistInterval: TimeSpan
        IdleTimeout: TimeSpan
        MaxQueueLength: int
    }

    static member Default =
        {
            PersistInterval = TimeSpan.FromSeconds 5.0
            IdleTimeout = TimeSpan.FromMinutes 15.0
            MaxQueueLength = 1000
        }

/// Závislosti actoru. `OnStopped` odebere actor z registru, `OnError` loguje.
///
/// `Ado` a `Publish` obsluhují dlouhé ADO operace: běží mimo mailbox a jejich
/// průběh i výsledek se ke klientům dostane mimo odpověď na command, tedy
/// přes `Publish` (ADR-002, ADR-008).
[<NoEquality; NoComparison>]
type ActorDependencies =
    {
        Store: ProjectStore
        Options: ActorOptions
        OnStopped: string -> unit
        OnError: string -> exn -> unit
        Ado: AdoGateway
        /// `userId` → diffy. Routing (broadcast vs. jen odesílateli) řeší
        /// příjemce podle `Diffs.deliveryOf`.
        Publish: string -> ProjectDiff list -> unit
    }

    /// Závislosti bez ADO integrace — pro testy a servery bez ADO.
    static member Basic(store, options) =
        {
            Store = store
            Options = options
            OnStopped = ignore
            OnError = fun _ _ -> ()
            Ado = AdoGateway.Disabled
            Publish = fun _ _ -> ()
        }

[<NoEquality; NoComparison>]
type private Message =
    | Execute of UserContext * ProjectCommand * AsyncReplyChannel<Result<ProjectDiff list, string>>
    | Snapshot of string * AsyncReplyChannel<Result<ClientAppState, string>>
    /// Výsledek ADO operace, která doběhla mimo mailbox.
    | AdoDone of UserContext * AdoEffect list
    | Flush of AsyncReplyChannel<unit>
    | Tick
    | Stop of AsyncReplyChannel<unit>

type private Loaded =
    {
        State: AppState
        Dirty: bool
        LastActivity: DateTimeOffset
    }

/// Stav mailboxu: `None` = projekt v DB neexistuje.
type private Inner = Loaded option

/// Co má smyčka udělat po zpracování zprávy. Díky tomu je vlastní obsluha
/// zpráv plochá funkce a rekurze zůstává na jednom místě.
type private Outcome =
    | Continue of Inner
    | Halt

let private missing (projectId: string) = Error $"Projekt {projectId} neexistuje"

/// ADO commandy actor jen odstartuje — zpracovává je bridge mimo mailbox.
let private adoCommandOf (command: ProjectCommand) =
    match command with
    | AdoCmd adoCommand -> Some adoCommand
    | _ -> None

type ProjectActor(projectId: string, deps: ActorDependencies) =
    let touch (loaded: Loaded) =
        { loaded with
            LastActivity = DateTimeOffset.UtcNow
        }

    let load () =
        async {
            let! state = deps.Store.Load projectId

            return
                state
                |> Option.map (fun value ->
                    {
                        State = value
                        Dirty = false
                        LastActivity = DateTimeOffset.UtcNow
                    }
                )
        }

    /// Uloží stav, pokud je co ukládat. Selhání zápisu nesmí zahodit změny
    /// v paměti — příznak `Dirty` proto zůstane a zkusí se to zas při dalším ticku.
    let persist (inner: Inner) =
        async {
            match inner with
            | Some loaded when loaded.Dirty ->
                try
                    let! saved = deps.Store.Save projectId loaded.State

                    return
                        if saved then
                            Some { loaded with Dirty = false }
                        else
                            Some loaded
                with ex ->
                    deps.OnError projectId ex
                    return Some loaded
            | other -> return other
        }

    /// Výsledek úspěšně aplikovaného commandu: diffy, nový stav a případný
    /// ADO command k odstartování.
    let applied (loaded: Loaded) (command: ProjectCommand) (next: AppState, diffs: ProjectDiff list) =
        Ok diffs,
        Some
            { touch loaded with
                State = next
                Dirty = loaded.Dirty || not (List.isEmpty diffs)
            },
        adoCommandOf command |> Option.map (fun adoCommand -> next, adoCommand)

    /// Vrací i případný ADO command k odstartování — spouští ho až smyčka,
    /// která má přístup k `inbox.Post`.
    let handleExecute (inner: Inner) (user: UserContext) (command: ProjectCommand) =
        match inner with
        | None -> missing projectId, inner, None
        | Some loaded ->
            match applyCommand loaded.State user (nowIso ()) command with
            | Ok outcome -> applied loaded command outcome
            | Error message -> Error message, Some(touch loaded), None

    /// Aplikuje efekty ADO operace a rozešle výsledné diffy.
    let handleAdoDone (inner: Inner) (user: UserContext) (effects: AdoEffect list) =
        match inner with
        | None -> inner
        | Some loaded ->
            let next, diffs = applyEffects loaded.State user.DisplayName (nowIso ()) effects
            deps.Publish user.UserId diffs

            Some
                { touch loaded with
                    State = next
                    Dirty = loaded.Dirty || List.exists mutatesState effects
                }

    /// Spustí ADO operaci mimo mailbox; výsledek se vrátí jako `AdoDone`.
    let startAdo (post: Message -> unit) (user: UserContext) (state: AppState) (command: AdoCommand) =
        let request =
            {
                ProjectId = projectId
                User = user
                State = state
                Command = command
                Report = fun diff -> deps.Publish user.UserId [ diff ]
            }

        Async.Start(
            async {
                let! effects =
                    async {
                        try
                            return! deps.Ado.Run request
                        with ex ->
                            deps.OnError projectId ex
                            return [ Emit(ErrorOccurred(ex.Message, commandTypeHint command)) ]
                    }

                post (AdoDone(user, effects))
            }
        )

    let handleSnapshot (inner: Inner) (userId: string) (reply: AsyncReplyChannel<Result<ClientAppState, string>>) =
        match inner with
        | Some loaded ->
            reply.Reply(Ok(forUser userId loaded.State))
            Some(touch loaded)
        | None ->
            reply.Reply(missing projectId)
            inner

    /// Prázdný actor (projekt v DB není) je nečinný z definice — jinak by
    /// v paměti visel navždy.
    let isIdle (inner: Inner) =
        inner
        |> Option.forall (fun loaded -> DateTimeOffset.UtcNow - loaded.LastActivity > deps.Options.IdleTimeout)

    let handleTick (inner: Inner) =
        async {
            let! next = persist inner

            if isIdle next then
                deps.OnStopped projectId
                return Halt
            else
                return Continue next
        }

    /// Předchozí znění KB stránky, pokud ji command přepisuje nebo maže.
    ///
    /// Snímek se bere **před** aplikací commandu — po ní už je původní obsah
    /// pryč. Zápis do historie běží mimo mailbox: je to čtení-nezávislý
    /// vedlejší efekt a actor kvůli němu nemá čekat.
    let kbSnapshotBefore (inner: Inner) (user: UserContext) (command: ProjectCommand) =
        let pageId =
            match command with
            | KnowledgeCmd(UpdateKbPage(id, _)) -> Some id
            | KnowledgeCmd(DeleteKbPage id) -> Some id
            | _ -> None

        match inner, pageId with
        | Some loaded, Some id ->
            loaded.State.KbPages
            |> List.tryFind (fun page -> page.Id = id)
            |> Option.map (fun page ->
                {
                    PageId = page.Id
                    Title = page.Title
                    Content = page.Content
                    SavedAt = nowIso ()
                    SavedBy = user.DisplayName
                }
            )
        | _ -> None

    let archiveKbPage (snapshot: KbPageSnapshot) =
        Async.Start(
            async {
                try
                    do! deps.Store.ArchiveKbPage projectId snapshot
                with ex ->
                    deps.OnError projectId ex
            }
        )

    let handleMessage (post: Message -> unit) (inner: Inner) message =
        async {
            match message with
            | Execute(user, command, reply) ->
                let snapshot = kbSnapshotBefore inner user command
                let result, next, pending = handleExecute inner user command
                reply.Reply result

                match result, snapshot with
                | Ok _, Some value -> archiveKbPage value
                | _ -> ()

                match pending with
                | Some(state, adoCommand) -> startAdo post user state adoCommand
                | None -> ()

                return Continue next
            | Snapshot(userId, reply) -> return Continue(handleSnapshot inner userId reply)
            | AdoDone(user, effects) -> return Continue(handleAdoDone inner user effects)
            | Flush reply ->
                let! next = persist inner
                reply.Reply()
                return Continue next
            | Tick -> return! handleTick inner
            | Stop reply ->
                let! _ = persist inner
                reply.Reply()
                return Halt
        }

    /// ADR-002: pád při zpracování zprávy znamená reload z SQLite, ne pád serveru.
    let handleSafely (post: Message -> unit) (inner: Inner) message =
        async {
            try
                return! handleMessage post inner message
            with ex ->
                deps.OnError projectId ex
                let! reloaded = load ()
                return Continue reloaded
        }

    let agent =
        MailboxProcessor.Start(fun inbox ->
            // FL0085 chce na rekurzivní funkci [<TailCall>]. U smyčky mailboxu je to
            // falešný poplach: `return!` uvnitř `async` není tail call, který by
            // kompilátor uměl ověřit — atribut by jen vyrobil FS3569. Riziko přetečení
            // zásobníku tu není, protože rekurzi rozplétá builder přes continuations.
            // fsharplint:disable-next-line FL0085
            let rec loop (inner: Inner) =
                async {
                    let! message = inbox.Receive()

                    match! handleSafely inbox.Post inner message with
                    | Continue next -> return! loop next
                    | Halt -> return ()
                }

            async {
                let! initial = load ()
                return! loop initial
            }
        )

    let cancellation = new Threading.CancellationTokenSource()
    let mutable disposed = false

    /// Zastaví ticker; volá se z `Stop` i z `Dispose` a musí snést obojí.
    let cancelTicker () =
        if not disposed && not cancellation.IsCancellationRequested then
            cancellation.Cancel()

    do
        let ticker =
            async {
                while true do
                    do! Async.Sleep(int deps.Options.PersistInterval.TotalMilliseconds)
                    agent.Post Tick
            }

        Async.Start(ticker, cancellation.Token)

    /// Délka fronty — hub podle ní odmítá commandy při přetížení.
    member _.QueueLength = agent.CurrentQueueLength

    /// Zpracuje command a vrátí diffy k rozeslání.
    member _.Execute(user: UserContext, command: ProjectCommand) =
        if agent.CurrentQueueLength >= deps.Options.MaxQueueLength then
            async { return Error "Server je přetížen, zkuste akci zopakovat" }
        else
            agent.PostAndAsyncReply(fun reply -> Execute(user, command, reply))

    /// Projekce stavu pro daného uživatele (`full_state`).
    member _.FullState(userId: string) =
        agent.PostAndAsyncReply(fun reply -> Snapshot(userId, reply))

    /// Vynutí uložení — používá se při vypínání služby a v testech.
    /// Vynutí uložení. `timeoutMs` je pojistka: `PostAndAsyncReply` čeká na
    /// odpověď mailboxu donekonečna, a když už smyčka skončila (idle timeout,
    /// `Stop`), odpověď nikdy nepřijde. Volající z HTTP requestu na tom nesmí
    /// viset.
    member _.Flush(?timeoutMs: int) =
        async {
            try
                do! agent.PostAndAsyncReply(Flush, ?timeout = timeoutMs)
            with :? TimeoutException ->
                ()
        }

    member _.Stop() =
        async {
            do! agent.PostAndAsyncReply Stop
            cancelTicker ()
        }

    interface IDisposable with
        // Actor může být uklizen dvakrát: idle timeoutem i vypnutím služby.
        member this.Dispose() =
            if not disposed then
                disposed <- true
                cancellation.Cancel()
                cancellation.Dispose()
                (agent :> IDisposable).Dispose()
