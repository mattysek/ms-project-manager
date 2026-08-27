/// Zázemí ADO mostu (ADR-008): přístup k DB, dešifrování PATu, snapshot a log.
///
/// Most běží **mimo** mailbox actora i mimo request pipeline, takže si DB scope
/// musí otevřít sám. PAT se tu dešifruje na poslední chvíli a dál než do
/// `AdoCredentials` se nedostane — do stavu projektu, do logu ani ke klientovi
/// nikdy.
module MSProjectManager.Integration.AdoBridgeContext

open System
open Microsoft.AspNetCore.DataProtection
open Microsoft.Extensions.DependencyInjection
open System.Net.Http
open MSProjectManager.Domain.Types
open MSProjectManager.Domain.Ado
open MSProjectManager.Domain.Commands
open MSProjectManager.Domain.Diffs
open MSProjectManager.Protocol.Json
open MSProjectManager.Domain.AdoGateway
open MSProjectManager.Persistence.AppDbContext
open MSProjectManager.Persistence.Repositories
open MSProjectManager.Integration.AdoApiClient

/// Závislosti mostu. `Protector` je vyrobený s purpose `"ado-pat"`.
[<NoEquality; NoComparison>]
type BridgeDependencies =
    {
        ScopeFactory: IServiceScopeFactory
        Protector: IDataProtector
        Http: HttpClient
    }

/// Otevře DB scope na dobu jedné operace.
let withDb (deps: BridgeDependencies) (action: AppDbContext -> Async<'T>) : Async<'T> =
    async {
        use scope = deps.ScopeFactory.CreateScope()
        let db = scope.ServiceProvider.GetRequiredService<AppDbContext>()
        return! action db
    }

/// Konfigurace ze stavu projektu spolu s dešifrovaným PATem.
///
/// Obě části můžou chybět nezávisle a uživatel potřebuje vědět která — proto
/// tři různé hlášky místo jedné obecné.
let tryCredentials (deps: BridgeDependencies) (request: AdoRequest) : Async<Result<AdoCredentials, string>> =
    async {
        match request.State.AdoConfig with
        | None -> return Error "ADO integrace není nakonfigurovaná — vyplňte nastavení připojení"
        | Some config ->
            let! stored = withDb deps (fun db -> AdoCredentials.tryGetPat db request.ProjectId request.User.UserId)

            match stored with
            | None -> return Error "Není uložený PAT — zadejte ho v nastavení ADO Sync"
            | Some encrypted ->
                try
                    return
                        Ok
                            {
                                Config = config
                                Pat = deps.Protector.Unprotect encrypted
                            }
                with _ ->
                    // Typicky po výměně klíčů Data Protection API.
                    return Error "Uložený PAT se nepodařilo dešifrovat — uložte ho prosím znovu"
    }

/// Stav PATu pro diffy `ado_config_updated` a `ado_pat_saved` (FR-ADO-02).
let patStatus (deps: BridgeDependencies) (projectId: string) (userId: string) =
    withDb deps (fun db -> AdoCredentials.patStatus db projectId userId)

/// Snapshot posledního syncu; poškozený JSON bereme jako „žádný snapshot",
/// aby jedna vadná hodnota nezablokovala sync natrvalo.
let tryLoadSnapshot (deps: BridgeDependencies) (projectId: string) : Async<AdoSnapshot option> =
    async {
        let! stored = withDb deps (fun db -> AdoCredentials.tryGetSnapshot db projectId)

        return
            stored
            |> Option.bind (fun json ->
                match tryDeserialize<AdoSnapshot> json with
                | Ok snapshot -> Some snapshot
                | Error _ -> None
            )
    }

let saveSnapshot (deps: BridgeDependencies) (projectId: string) (snapshot: AdoSnapshot) =
    withDb deps (fun db -> AdoCredentials.saveSnapshot db projectId (serialize snapshot))

/// Aktualizuje uživatelská rozhodnutí ve snapshotu (FR-ADO-06, FR-ADO-09).
/// Bez uloženého snapshotu není co měnit — sync ještě neproběhl.
///
/// `extra` jsou efekty, které se přidají jen když se rozhodnutí opravdu uložilo
/// — typicky záznam do sync logu.
let updateDecisions
    (deps: BridgeDependencies)
    (projectId: string)
    (change: AdoSnapshot -> AdoSnapshot)
    (extra: AdoEffect list)
    : Async<AdoEffect list> =
    async {
        let! snapshot = tryLoadSnapshot deps projectId

        match snapshot with
        | None -> return [ Emit(ErrorOccurred("Nejdřív spusťte synchronizaci", "ado")) ]
        | Some current ->
            do! saveSnapshot deps projectId (change current)
            return extra
    }

// ── Sync log ────────────────────────────────────────────────────────────────

let private newId () = Guid.NewGuid().ToString "N"

let nowIso () =
    DateTimeOffset.UtcNow.ToString "yyyy-MM-ddTHH:mm:ss.fffZ"

/// Záznam do sync logu (FR-ADO-10).
let logEntry (action: AdoSyncAction) (details: string) =
    {
        Id = newId ()
        Timestamp = nowIso ()
        Action = action
        TaskId = None
        TaskName = None
        WiId = None
        WiTitle = None
        Details = details
    }

/// Záznam svázaný s úkolem a work itemem.
let logFor (action: AdoSyncAction) (task: Task option) (wi: int * string) (details: string) =
    let wiId, wiTitle = wi

    { logEntry action details with
        TaskId = task |> Option.map (fun item -> item.Id)
        TaskName = task |> Option.map (fun item -> item.Name)
        WiId = Some wiId
        WiTitle = Some wiTitle
    }

/// Chyba z ADO přeložená do české hlášky pro uživatele (FR-ADO-03).
let errorEffect (command: AdoCommand) (error: exn) =
    Emit(ErrorOccurred(describeError error, commandTypeHint command))
