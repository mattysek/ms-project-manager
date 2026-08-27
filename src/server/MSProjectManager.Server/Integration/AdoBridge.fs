/// Implementace `AdoGateway` (ADR-008) — jediné místo, kde se potkává actor
/// s Azure DevOps.
///
/// Actor sem předá command a snímek stavu, dostane zpět seznam efektů. Vlastní
/// mutace stavu se děje až v mailboxu, takže tenhle modul nemá žádný sdílený
/// mutovatelný stav a jde testovat s podvrženým `HttpMessageHandler`.
module MSProjectManager.Integration.AdoBridge

open Microsoft.AspNetCore.DataProtection
open MSProjectManager.Domain.Ado
open MSProjectManager.Domain.Commands
open MSProjectManager.Domain.Diffs
open MSProjectManager.Domain.AdoSync
open MSProjectManager.Domain.AdoGateway
open MSProjectManager.Integration.AdoApiClient
open MSProjectManager.Integration.AdoBridgeContext
open MSProjectManager.Integration.AdoBridgeActions

module AdoCredentialsRepo = MSProjectManager.Persistence.Repositories.AdoCredentials

// ── Konfigurace a PAT (FR-ADO-01 až 03) ─────────────────────────────────────

/// Stav projektu už konfiguraci obsahuje (postaral se reducer); tady se jen
/// dopočítá per-user stav PATu, který do stavu projektu nepatří.
let private savedConfig deps (request: AdoRequest) (config: AdoConfig) =
    async {
        let! status = patStatus deps request.ProjectId request.User.UserId
        return [ Emit(AdoConfigUpdated(config, status.PatSet, status.UpdatedAt)) ]
    }

let private savePat deps (request: AdoRequest) (pat: string) =
    async {
        let encrypted = deps.Protector.Protect pat

        let! timestamp =
            withDb
                deps
                (fun db ->
                    AdoCredentialsRepo.savePat
                        db
                        {
                            ProjectId = request.ProjectId
                            UserId = request.User.UserId
                            PatEncrypted = encrypted
                        }
                )

        return [ Emit(AdoPatSaved(true, Some timestamp)) ]
    }

let private deletePat deps (request: AdoRequest) =
    async {
        let! _ = withDb deps (fun db -> AdoCredentialsRepo.deletePat db request.ProjectId request.User.UserId)
        return [ Emit(AdoPatSaved(false, None)) ]
    }

/// Ověření připojení (FR-ADO-03). Chyba je tu očekávaný výsledek, ne pád —
/// uživatel právě zjišťuje, jestli údaje sedí.
let private testConnection deps (request: AdoRequest) =
    async {
        let! credentials = tryCredentials deps request

        match credentials with
        | Error message -> return [ Emit(AdoConnectionTested(false, message)) ]
        | Ok value ->
            try
                let! identity = verifyConnection deps.Http value

                return
                    [
                        Emit(AdoConnectionTested(true, $"Připojení úspěšné — připojeno jako {identity}"))
                    ]
            with error ->
                return [ Emit(AdoConnectionTested(false, describeError error)) ]
    }

// ── Uživatelská rozhodnutí (FR-ADO-06, 09) ──────────────────────────────────

/// Potvrzení změny se podle `ado-sync.feature` zapisuje do sync logu; odvolání
/// potvrzení ne — do auditu patří rozhodnutí, ne jeho vzetí zpět.
let private acknowledge deps (request: AdoRequest) (wiId: int, changeType: WiChangeType, active: bool) =
    let logged =
        if active then
            [
                AppendLog
                    { logEntry Acknowledged "" with
                        WiId = Some wiId
                    }
            ]
        else
            []

    updateDecisions
        deps
        request.ProjectId
        (fun snapshot ->
            // Hodnotu bereme ze snapshotu, který sync právě uložil — je to
            // přesně to, co uživatel v seznamu změn viděl.
            let value = acknowledgedValue (Map.tryFind (string wiId) snapshot.Items) changeType

            { snapshot with
                AcknowledgedChanges = toggle (changeKey wiId changeType value) active snapshot.AcknowledgedChanges
            }
        )
        logged

let private ignoreGap deps (request: AdoRequest) (wiId: int, active: bool) =
    let logged =
        if active then
            [
                AppendLog
                    { logEntry Ignored "Work item vyřazen z coverage gap" with
                        WiId = Some wiId
                    }
            ]
        else
            []

    updateDecisions
        deps
        request.ProjectId
        (fun snapshot ->
            { snapshot with
                IgnoredGapIds = toggle wiId active snapshot.IgnoredGapIds
            }
        )
        logged

let private ignoreUnlinked deps (request: AdoRequest) (taskId: string, active: bool) =
    updateDecisions
        deps
        request.ProjectId
        (fun snapshot ->
            { snapshot with
                IgnoredUnlinkedTaskIds = toggle taskId active snapshot.IgnoredUnlinkedTaskIds
            }
        )
        []

// ── Operace vyžadující spojení do ADO ───────────────────────────────────────

/// Commandy, které sahají na ADO API, potřebují dešifrovaný PAT i konfiguraci.
let private withConnection deps (request: AdoRequest) action =
    async {
        let! credentials = tryCredentials deps request

        match credentials with
        | Error message -> return [ Emit(ErrorOccurred(message, commandTypeHint request.Command)) ]
        | Ok value ->
            try
                return! action value
            with error ->
                return [ errorEffect request.Command error ]
    }

let private connected deps (request: AdoRequest) (command: AdoCommand) =
    withConnection
        deps
        request
        (fun credentials ->
            let state = request.State

            match command with
            | AdoAcceptFromAdo(wiId, taskId, field, text) ->
                acceptFromAdo deps credentials state (wiId, taskId, field, text)
            | AdoPushAssignee(wiId, taskId) -> pushAssignee deps credentials state (wiId, taskId)
            | AdoPushState(wiId, taskId, target) -> pushState deps credentials state (wiId, taskId, target)
            | AdoPushDescription(wiId, taskId, text, alsoPlanner) ->
                pushDescription deps credentials state (wiId, taskId, text, alsoPlanner)
            | AdoCreateWorkItem(taskId, draft) ->
                createWorkItemFor deps credentials state (credentials.Config, taskId, draft)
            | _ -> async { return [] }
        )

// ── Dispatch ────────────────────────────────────────────────────────────────

let private dispatch deps (request: AdoRequest) =
    match request.Command with
    | AdoSaveConfig config -> savedConfig deps request config
    | AdoSavePat pat -> savePat deps request pat
    | AdoDeletePat -> deletePat deps request
    | AdoTestConnection -> testConnection deps request
    | AdoRunSync -> AdoBridgeSync.run deps request
    | AdoAcknowledgeChange(wiId, changeType, active) -> acknowledge deps request (wiId, changeType, active)
    | AdoIgnoreGap(wiId, active) -> ignoreGap deps request (wiId, active)
    | AdoIgnoreUnlinkedTask(taskId, active) -> ignoreUnlinked deps request (taskId, active)
    | AdoAddGapToPlan(wiId, task) -> async { return addGapToPlan wiId task }
    | AdoLinkGapToTask(wiId, taskId) ->
        match request.State.AdoConfig with
        | None ->
            async {
                return
                    [
                        Emit(ErrorOccurred("ADO integrace není nakonfigurovaná", "ado_link_gap_to_task"))
                    ]
            }
        | Some config -> async { return linkGapToTask request.State config wiId taskId }
    | AdoAcceptFromAdo _
    | AdoPushAssignee _
    | AdoPushState _
    | AdoPushDescription _
    | AdoCreateWorkItem _ -> connected deps request request.Command

/// Gateway pro DI. Neošetřená výjimka nesmí shodit actor — proto poslední
/// záchytná síť i tady, byť jednotlivé větve chyby řeší samy.
let create (deps: BridgeDependencies) : AdoGateway =
    {
        Run =
            fun request ->
                async {
                    try
                        return! dispatch deps request
                    with error ->
                        return [ errorEffect request.Command error ]
                }
    }
