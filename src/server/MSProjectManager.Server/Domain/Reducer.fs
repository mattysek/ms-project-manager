/// Reducer stavu projektu — jediné místo, kde se stav mění.
///
/// `applyCommand` je čistá funkce: žádné I/O, žádné side efekty, tedy plně
/// testovatelná bez serveru. Pořadí je vždy autorizace (ADR-006) a teprve
/// pak doménová validace a mutace; command bez oprávnění se stavu ani
/// nedotkne.
///
/// Dispatch je záměrně jen rozcestník na moduly per doménový slice — každý
/// slice si drží vlastní pravidla i chybové hlášky.
module MSProjectManager.Domain.Reducer

open MSProjectManager.Domain.State
open MSProjectManager.Domain.Commands
open MSProjectManager.Domain.Diffs
open MSProjectManager.Domain.Authorization
open MSProjectManager.Domain.Reducers

let private dispatch (state: AppState) (user: UserContext) (now: string) (command: ProjectCommand) =
    match command with
    | TaskCmd taskCommand -> Tasks.apply state user now taskCommand
    | PeopleCmd peopleCommand -> People.apply state peopleCommand
    | ProjectMetaCmd metaCommand -> ProjectMeta.apply state metaCommand
    | RiskCmd riskCommand -> Risks.apply state riskCommand
    | KnowledgeCmd knowledgeCommand -> Knowledge.apply state knowledgeCommand
    | PersonalCmd personalCommand -> Personal.apply state user personalCommand
    | FileCmd fileCommand -> Files.apply state fileCommand
    | AdoCmd adoCommand -> Session.applyAdo state adoCommand
    | SessionCmd sessionCommand -> Session.applySession state user sessionCommand

/// Aplikuje command na stav projektu. Vrací nový stav a diffy k rozeslání,
/// nebo českou chybovou hlášku pro `error` diff odesílateli.
///
/// `now` je parametr, ne `DateTime.UtcNow` uvnitř: razítko autorství u úkolů
/// (`Task.UpdatedAt`) by jinak z reduceru udělalo nedeterministickou funkci
/// a testy by nešly psát na rovnost celého stavu.
let applyCommand
    (state: AppState)
    (user: UserContext)
    (now: string)
    (command: ProjectCommand)
    : Result<AppState * ProjectDiff list, string> =
    authorizeCommand state user command
    |> Result.bind (fun () -> dispatch state user now command)
