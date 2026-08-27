/// Reducer doménového slice „rizika a příležitosti".
module MSProjectManager.Domain.Reducers.Risks

open MSProjectManager.Domain.Types
open MSProjectManager.Domain.State
open MSProjectManager.Domain.Patches
open MSProjectManager.Domain.Commands
open MSProjectManager.Domain.Diffs
open MSProjectManager.Common.Collections

let private riskId (risk: Risk) = risk.Id
let private oppId (opp: Opportunity) = opp.Id

let private addRisk (state: AppState) (risk: Risk) =
    if containsId riskId risk.Id state.Risks then
        Error $"Riziko {risk.Id} v projektu už existuje"
    else
        Ok(
            { state with
                Risks = append risk state.Risks
            },
            [ RiskAdded risk ]
        )

let private updateRisk (state: AppState) (id: string) (fields: RiskFields) =
    if containsId riskId id state.Risks then
        let risks = updateById riskId id (mergeRisk fields) state.Risks
        Ok({ state with Risks = risks }, [ RiskUpdated(id, fields) ])
    else
        Error $"Riziko {id} v projektu neexistuje"

let private deleteRisk (state: AppState) (id: string) =
    if containsId riskId id state.Risks then
        Ok(
            { state with
                Risks = removeById riskId id state.Risks
            },
            [ RiskDeleted id ]
        )
    else
        Error $"Riziko {id} v projektu neexistuje"

let private addOpportunity (state: AppState) (opp: Opportunity) =
    if containsId oppId opp.Id state.Opps then
        Error $"Příležitost {opp.Id} v projektu už existuje"
    else
        Ok(
            { state with
                Opps = append opp state.Opps
            },
            [ OpportunityAdded opp ]
        )

let private updateOpportunity (state: AppState) (id: string) (fields: OpportunityFields) =
    if containsId oppId id state.Opps then
        let opps = updateById oppId id (mergeOpportunity fields) state.Opps
        Ok({ state with Opps = opps }, [ OpportunityUpdated(id, fields) ])
    else
        Error $"Příležitost {id} v projektu neexistuje"

let private deleteOpportunity (state: AppState) (id: string) =
    if containsId oppId id state.Opps then
        Ok(
            { state with
                Opps = removeById oppId id state.Opps
            },
            [ OpportunityDeleted id ]
        )
    else
        Error $"Příležitost {id} v projektu neexistuje"

/// Aplikuje command nad riziky a příležitostmi.
let apply (state: AppState) (command: RiskCommand) : Result<AppState * ProjectDiff list, string> =
    match command with
    | AddRisk risk -> addRisk state risk
    | UpdateRisk(id, fields) -> updateRisk state id fields
    | DeleteRisk id -> deleteRisk state id
    | AddOpportunity opp -> addOpportunity state opp
    | UpdateOpportunity(id, fields) -> updateOpportunity state id fields
    | DeleteOpportunity id -> deleteOpportunity state id
