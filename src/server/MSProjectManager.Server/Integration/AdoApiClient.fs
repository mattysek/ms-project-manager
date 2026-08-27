/// Volání Azure DevOps REST API (ADR-008) — port `src/utils/adoApi.ts`.
///
/// PAT sem přichází už dešifrovaný a dál než do hlavičky `Authorization`
/// se nedostane; do logu ani do odpovědi klientovi nikdy.
///
/// `HttpClient` se předává zvenčí, aby testy mohly podstrčit vlastní
/// `HttpMessageHandler` a nevolat ADO doopravdy.
module MSProjectManager.Integration.AdoApiClient

open System
open System.Net.Http
open System.Net.Http.Headers
open System.Text
open System.Text.Json
open System.Text.Json.Serialization
open System.Threading.Tasks
open MSProjectManager.Domain.Ado
open MSProjectManager.Domain.AdoMarkdown

/// Verze REST API, proti které je klient psaný.
[<Literal>]
let ApiVersion = "7.0"

/// ADO limit na počet work itemů v jednom dotazu; zároveň strop syncu
/// z PRD-06 („max 200 WI per sync").
[<Literal>]
let BatchSize = 200

/// Chyba z ADO. `Status` je HTTP kód, `0` znamená timeout nebo síťovou chybu.
exception AdoApiException of status: int * detail: string

/// Přihlašovací údaje k jednomu volání.
type AdoCredentials = { Config: AdoConfig; Pat: string }

let private jsonOptions =
    let options =
        JsonSerializerOptions(PropertyNamingPolicy = JsonNamingPolicy.CamelCase)

    let fsharpOptions =
        JsonFSharpOptions.Default().WithUnwrapOption().WithSkippableOptionFields().WithAllowNullFields(true)

    options.Converters.Add(JsonFSharpConverter fsharpOptions)
    options

// ── Odpovědi ADO ────────────────────────────────────────────────────────────

type private ProjectResponse = { Name: string }
type private WorkItemsResponse = { Value: AdoWorkItem list }
type private WiqlItem = { Id: int }
type private WiqlResponse = { WorkItems: WiqlItem list }
type private CreatedWorkItem = { Id: int }

type private IdentityEntry =
    {
        DisplayName: string
        SignInAddress: string
    }

type private IdentityResult = { Identities: IdentityEntry list }
type private IdentityResponse = { Results: IdentityResult list }

// ── Transport ───────────────────────────────────────────────────────────────

let private authHeader (pat: string) =
    AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.ASCII.GetBytes(":" + pat)))

let private send (http: HttpClient) (pat: string) (request: HttpRequestMessage) : Async<string> =
    async {
        request.Headers.Authorization <- authHeader pat

        try
            let! response = http.SendAsync request |> Async.AwaitTask
            let! body = response.Content.ReadAsStringAsync() |> Async.AwaitTask

            if response.IsSuccessStatusCode then
                return body
            else
                return raise (AdoApiException(int response.StatusCode, body))
        with
        | :? TaskCanceledException -> return raise (AdoApiException(0, "Volání ADO trvalo déle než 30 sekund"))
        | :? HttpRequestException as ex -> return raise (AdoApiException(0, ex.Message))
    }

let private get (http: HttpClient) (credentials: AdoCredentials) (url: string) =
    async {
        use request = new HttpRequestMessage(HttpMethod.Get, url)
        return! send http credentials.Pat request
    }

let private post (http: HttpClient) (credentials: AdoCredentials) (url: string, body: string) =
    async {
        use request = new HttpRequestMessage(HttpMethod.Post, url)
        request.Content <- new StringContent(body, Encoding.UTF8, "application/json")
        return! send http credentials.Pat request
    }

/// PATCH s `application/json-patch+json` — ADO jiný content type u úprav
/// work itemů nepřijme.
let private patch (http: HttpClient) (credentials: AdoCredentials) (url: string, body: string) =
    async {
        use request = new HttpRequestMessage(HttpMethod.Patch, url)
        request.Content <- new StringContent(body, Encoding.UTF8, "application/json-patch+json")
        return! send http credentials.Pat request
    }

let private parse<'T> (body: string) : 'T =
    match JsonSerializer.Deserialize<'T>(body, jsonOptions) with
    | null -> raise (AdoApiException(0, "ADO vrátilo prázdnou odpověď"))
    | value -> value

let private projectUrl (credentials: AdoCredentials) (path: string) =
    let config = credentials.Config
    $"{config.OrgUrl}/{Uri.EscapeDataString config.Project}/_apis/{path}api-version={ApiVersion}"

// ── Ověření připojení a identity ────────────────────────────────────────────

/// Název projektu v ADO, pokud se povedlo připojit (FR-ADO-03).
let verifyConnection (http: HttpClient) (credentials: AdoCredentials) : Async<string> =
    async {
        let config = credentials.Config

        let url =
            $"{config.OrgUrl}/_apis/projects/{Uri.EscapeDataString config.Project}?api-version={ApiVersion}"

        let! body = get http credentials url
        return (parse<ProjectResponse> body).Name
    }

/// Zobrazované jméno identity v ADO podle e-mailu (mapování členů).
let verifyIdentity (http: HttpClient) (credentials: AdoCredentials) (email: string) : Async<string option> =
    async {
        let url =
            $"{credentials.Config.OrgUrl}/_apis/IdentityPicker/Identities?api-version={ApiVersion}"

        let query =
            {|
                query = email
                identityTypes = [ "user" ]
                operationScopes = [ "ims"; "source" ]
                options = {| MinResults = 1; MaxResults = 5 |}
            |}

        let! body = post http credentials (url, JsonSerializer.Serialize query)
        let response = parse<IdentityResponse> body

        return
            response.Results
            |> List.tryHead
            |> Option.bind (fun result ->
                result.Identities
                |> List.tryFind (fun identity ->
                    String.Equals(identity.SignInAddress, email, StringComparison.OrdinalIgnoreCase)
                )
            )
            |> Option.map (fun identity -> identity.DisplayName)
    }

// ── Načtení work itemů ──────────────────────────────────────────────────────

let private wiFields =
    String.concat
        ","
        [
            "System.Id"
            "System.Title"
            "System.State"
            "System.WorkItemType"
            "System.AssignedTo"
            "System.Description"
            "System.AreaPath"
            "System.IterationPath"
            "System.ChangedDate"
            "Microsoft.VSTS.Scheduling.RemainingWork"
            "Microsoft.VSTS.Common.Severity"
        ]

/// Dotaz na dávku work itemů.
///
/// ADO **neumí kombinovat** `fields` a `$expand` — vrátí 400. Když tedy
/// potřebujeme relace (hledání nových child Bugů, FR-ADO-05), musíme si říct
/// o všechna pole. Payload je větší, proto se to dělá jen tam, kde je to
/// potřeba.
let private batchUrl (credentials: AdoCredentials) (joined: string) (withRelations: bool) =
    if withRelations then
        projectUrl credentials $"wit/workitems?ids={joined}&$expand=relations&"
    else
        projectUrl credentials $"wit/workitems?ids={joined}&fields={wiFields}&"

/// Co a jak stáhnout — pohromadě, protože limit FSharpLint jsou 4 parametry.
[<NoEquality; NoComparison>]
type private BatchRequest =
    {
        Ids: int list
        /// `true` = dotaz s `$expand=relations` (a tedy bez `fields`).
        WithRelations: bool
        OnProgress: int -> unit
    }

let private fetchBatches
    (http: HttpClient)
    (credentials: AdoCredentials)
    (request: BatchRequest)
    : Async<AdoWorkItem list> =
    let ids = request.Ids

    async {
        if List.isEmpty ids then
            return []
        else
            let batches = ids |> List.chunkBySize BatchSize
            let mutable loaded = []

            for batch in batches do
                let joined = batch |> List.map string |> String.concat ","
                let! body = get http credentials (batchUrl credentials joined request.WithRelations)
                loaded <- loaded @ (parse<WorkItemsResponse> body).Value
                request.OnProgress(List.length loaded)

            return loaded
    }

/// Id child work itemů z relací (`Hierarchy-Forward` míří na potomka).
let childIdsOf (workItems: AdoWorkItem list) : int list =
    workItems
    |> List.collect (fun wi -> wi.Relations |> Option.defaultValue [])
    |> List.filter (fun relation -> relation.Rel = "System.LinkTypes.Hierarchy-Forward")
    |> List.choose (fun relation ->
        let m = Text.RegularExpressions.Regex.Match(relation.Url, "/(\\d+)$")
        if m.Success then Some(int m.Groups.[1].Value) else None
    )
    |> List.distinct

/// Work items po dávkách po 200 (limit ADO i strop z PRD-06). `onProgress`
/// dostane počet už načtených položek, aby UI mohlo ukazovat „(42/87)".
let fetchWorkItems
    (http: HttpClient)
    (credentials: AdoCredentials)
    (ids: int list)
    (onProgress: int -> unit)
    : Async<AdoWorkItem list> =
    fetchBatches
        http
        credentials
        {
            Ids = ids
            WithRelations = false
            OnProgress = onProgress
        }

/// Navázané work items **i s relacemi**, plus jejich child work items.
///
/// Bez tohohle druhého kroku nemohla detekce nových child Bugů nikdy
/// vystřelit: relace se nestahovaly (viz `batchUrl`) a samotné child WI
/// nejsou na žádný úkol navázané, takže v odpovědi vůbec nebyly.
let fetchWorkItemsWithChildren
    (http: HttpClient)
    (credentials: AdoCredentials)
    (ids: int list)
    (onProgress: int -> unit)
    : Async<AdoWorkItem list> =
    async {
        let! parents =
            fetchBatches
                http
                credentials
                {
                    Ids = ids
                    WithRelations = true
                    OnProgress = onProgress
                }

        let childIds =
            childIdsOf parents |> List.filter (fun id -> not (List.contains id ids))

        let! children =
            fetchBatches
                http
                credentials
                {
                    Ids = childIds
                    WithRelations = true
                    OnProgress = ignore
                }

        return parents @ children
    }

/// Id work itemů z WIQL dotazu.
let runWiqlQuery (http: HttpClient) (credentials: AdoCredentials) (query: string) : Async<int list> =
    async {
        let url = projectUrl credentials "wit/wiql?"
        let! body = post http credentials (url, JsonSerializer.Serialize {| query = query |})
        return (parse<WiqlResponse> body).WorkItems |> List.map (fun item -> item.Id)
    }

/// WIQL dotaz na rozpracovanou práci v `areaPath` — základ Coverage gapu.
let coverageGapQuery (config: AdoConfig) =
    let types =
        config.TrackedWiTypes
        |> List.map (fun value -> $"'{value}'")
        |> String.concat ", "

    let iteration =
        if String.IsNullOrWhiteSpace config.DefaultIteration then
            ""
        else
            $"AND [System.IterationPath] UNDER '{config.DefaultIteration}'"

    $"SELECT [System.Id] FROM WorkItems \
      WHERE [System.AreaPath] UNDER '{config.AreaPath}' \
      AND [System.State] IN ('Active', 'New') \
      AND [System.WorkItemType] IN ({types}) {iteration} \
      ORDER BY [System.ChangedDate] DESC"

/// Work items v `areaPath` sledovaných typů (FR-ADO-09).
let fetchCoverageGapWorkItems (http: HttpClient) (credentials: AdoCredentials) : Async<AdoWorkItem list> =
    async {
        if String.IsNullOrWhiteSpace credentials.Config.AreaPath then
            return []
        else
            let! ids = runWiqlQuery http credentials (coverageGapQuery credentials.Config)

            if List.isEmpty ids then
                return []
            else
                return! fetchWorkItems http credentials (ids |> List.truncate BatchSize) ignore
    }

// ── Zápis do ADO ────────────────────────────────────────────────────────────

// `box` vrací pod nullness analýzou `objnull`; JSON payload null hodnotu snese,
// takže parametr je `objnull` a ne `obj`.
let private operation (op: string) (path: string) (value: objnull) =
    {|
        op = op
        path = "/fields/" + path
        value = value
    |}

/// Založí work item a vrátí jeho id (FR-ADO-08). Popis přichází jako markdown,
/// do ADO jde HTML.
let createWorkItem (http: HttpClient) (credentials: AdoCredentials) (draft: AdoWorkItemDraft) : Async<int> =
    async {
        let optional (path: string) (value: string) =
            if String.IsNullOrWhiteSpace value then
                []
            else
                [ operation "add" path (box value) ]

        let patches =
            [ operation "add" "System.Title" (box draft.Title) ]
            @ optional "System.Description" (markdownToHtml draft.DescriptionMd)
            @ optional "System.AreaPath" draft.AreaPath
            @ optional "System.IterationPath" draft.IterationPath
            @ optional "System.AssignedTo" draft.AssignedTo
            @ [
                operation "add" "Microsoft.VSTS.Scheduling.RemainingWork" (box draft.RemainingWork)
            ]

        let url =
            projectUrl credentials $"wit/workitems/${Uri.EscapeDataString draft.WiType}?"

        let! body = patch http credentials (url, JsonSerializer.Serialize patches)
        return (parse<CreatedWorkItem> body).Id
    }

/// Přepíše jedno pole work itemu (stav, přiřazení, popis).
let updateWorkItemField (http: HttpClient) (credentials: AdoCredentials) (wiId: int) (field: string * string) =
    async {
        let path, value = field
        let patches = [ operation "replace" path (box value) ]
        let url = projectUrl credentials $"wit/workitems/{wiId}?"
        let! _ = patch http credentials (url, JsonSerializer.Serialize patches)
        return ()
    }

/// Česká hláška k chybě z ADO (FR-ADO-03).
let describeError (error: exn) =
    match error with
    | AdoApiException(401, _) -> "Ověření selhalo: Neplatný nebo expirovaný Personal Access Token"
    | AdoApiException(403, _) -> "Ověření selhalo: PAT nemá dostatečná oprávnění (scope vso.work_write)"
    | AdoApiException(404, _) -> "Projekt nebo work item v ADO nebyl nalezen"
    | AdoApiException(0, detail) -> $"Nepodařilo se spojit s ADO: {detail}"
    | AdoApiException(status, _) -> $"ADO vrátilo chybu {status}"
    | ex -> ex.Message
