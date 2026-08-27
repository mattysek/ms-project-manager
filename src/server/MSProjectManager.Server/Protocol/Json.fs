/// Serializace protokolu — kontrakt s frontendem (ADR-004).
///
/// Tvar, který musí sedět doslova:
///   command   `{ "type": "add_task", "task": { ... } }`
///   diff      `{ "op": "task_added", "task": { ... } }`
///
/// Proto dvě instance `JsonSerializerOptions`: liší se jen názvem pole
/// s diskriminátorem. Obě používají internal tag + pojmenovaná pole,
/// snake_case pro názvy case a camelCase pro názvy polí záznamů, takže
/// `Md` je `md` a `AddKbPage` je `add_kb_page`.
///
/// Chybějící pole typu `option` se deserializuje jako `None` a `None` se
/// neserializuje vůbec — na tom stojí `Partial(T)` patche.
module MSProjectManager.Protocol.Json

open System
open System.Text.Encodings.Web
open System.Text.Json
open System.Text.Json.Serialization
open Microsoft.FSharp.Reflection
open MSProjectManager.Domain.Commands
open MSProjectManager.Domain.Diffs

/// Název case na wire — stejná politika, jakou používá serializátor pro tagy.
let private tagOf (case: UnionCaseInfo) =
    JsonNamingPolicy.SnakeCaseLower.ConvertName case.Name

/// Tabulka wire tag → deserializace do konkrétní skupiny commandů.
/// Staví se z názvů case, takže při přidání commandu není co zapomenout.
let private groupReaders =
    let group (wrap: 'T -> ProjectCommand) =
        FSharpType.GetUnionCases typeof<'T>
        |> Array.toList
        |> List.map (fun case ->
            tagOf case,
            (fun (element: JsonElement) (options: JsonSerializerOptions) ->
                wrap (nonNull (element.Deserialize<'T>(options)))
            )
        )

    [
        group TaskCmd
        group PeopleCmd
        group ProjectMetaCmd
        group RiskCmd
        group KnowledgeCmd
        group PersonalCmd
        group FileCmd
        group AdoCmd
        group SessionCmd
    ]
    |> List.concat
    |> Map.ofList

/// Wire tag commandu (pole `type`) — pro chybové diffy a logování.
let commandType (command: ProjectCommand) : string =
    let outerCase, outerFields =
        FSharpValue.GetUnionFields(command, typeof<ProjectCommand>)

    let innerType = (outerCase.GetFields() |> Array.head).PropertyType
    let innerCase, _ = FSharpValue.GetUnionFields(outerFields |> Array.head, innerType)
    tagOf innerCase

/// Překládá plochý wire tvar commandu na vnořené doménové DU a zpět.
type ProjectCommandConverter() =
    inherit JsonConverter<ProjectCommand>()

    /// Případy DU jsou v CLR potomci `ProjectCommand` a SignalR serializuje
    /// argumenty podle **běhového** typu. Bez tohohle by se converter na
    /// odeslaný command vůbec nepoužil a na drátě by skončil jiný tvar.
    override _.CanConvert(typeToConvert) =
        typeof<ProjectCommand>.IsAssignableFrom typeToConvert

    override _.Read(reader, _typeToConvert, options) =
        use document = JsonDocument.ParseValue(&reader)
        let root = document.RootElement

        let tag =
            match root.TryGetProperty "type" with
            | true, property -> Option.ofObj (property.GetString())
            | false, _ -> None

        match tag |> Option.bind (fun value -> Map.tryFind value groupReaders) with
        | Some read -> read root options
        | None ->
            let popis = defaultArg tag "(chybí)"
            raise (JsonException($"Neznámý typ commandu: {popis}"))

    override _.Write(writer, value, options) =
        match value with
        | TaskCmd command -> JsonSerializer.Serialize(writer, command, options)
        | PeopleCmd command -> JsonSerializer.Serialize(writer, command, options)
        | ProjectMetaCmd command -> JsonSerializer.Serialize(writer, command, options)
        | RiskCmd command -> JsonSerializer.Serialize(writer, command, options)
        | KnowledgeCmd command -> JsonSerializer.Serialize(writer, command, options)
        | PersonalCmd command -> JsonSerializer.Serialize(writer, command, options)
        | FileCmd command -> JsonSerializer.Serialize(writer, command, options)
        | AdoCmd command -> JsonSerializer.Serialize(writer, command, options)
        | SessionCmd command -> JsonSerializer.Serialize(writer, command, options)

let private createOptions (unionTagName: string) =
    let options =
        JsonSerializerOptions(
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        )

    let fsharpOptions =
        JsonFSharpOptions
            .Default()
            .WithUnionInternalTag()
            .WithUnionNamedFields()
            .WithUnionTagName(unionTagName)
            .WithUnionTagNamingPolicy(JsonNamingPolicy.SnakeCaseLower)
            .WithUnwrapOption()
            .WithSkippableOptionFields()
            .WithAllowNullFields(true)
            .WithAllowOverride(true)

    options.Converters.Add(JsonFSharpConverter(fsharpOptions))
    options

/// Options pro commandy (diskriminátor v poli `type`) — i pro `AppState`
/// v `projects.state_json`, aby persistovaný tvar odpovídal wire tvaru.
let commandOptions =
    let options = createOptions "type"
    options.Converters.Insert(0, ProjectCommandConverter())
    options

/// Options pro diffy (diskriminátor v poli `op`).
let diffOptions = createOptions "op"

/// Serializuje hodnotu options pro commandy a stav.
let serialize (value: 'T) : string =
    JsonSerializer.Serialize(value, commandOptions)

/// Deserializuje hodnotu options pro commandy a stav.
let deserialize<'T when 'T: not struct and 'T: not null> (json: string) : 'T =
    nonNull (JsonSerializer.Deserialize<'T>(json, commandOptions))

/// Deserializace, která místo výjimky vrací českou chybu — pro data z wire.
let tryDeserialize<'T when 'T: not struct and 'T: not null> (json: string) : Result<'T, string> =
    try
        Ok(deserialize<'T> json)
    with
    | :? JsonException as ex -> Error ex.Message
    | :? NotSupportedException as ex -> Error ex.Message

/// Serializuje diff pro broadcast.
let serializeDiff (diff: 'T) : string =
    JsonSerializer.Serialize(diff, diffOptions)

/// Diff serializovaný do `op` tvaru i uvnitř options pro commandy.
///
/// SignalR má jen jednu sadu options pro oba směry, ale commandy nesou
/// diskriminátor v `type` a diffy v `op`. Converter proto diff serializuje
/// vlastními options a výsledek jen přepíše do writeru.
type ProjectDiffConverter() =
    inherit JsonConverter<ProjectDiff>()

    /// Totéž co u commandů — diff se posílá jako `obj`, tedy podle běhového
    /// typu konkrétního case.
    override _.CanConvert(typeToConvert) =
        typeof<ProjectDiff>.IsAssignableFrom typeToConvert

    override _.Read(reader, _typeToConvert, _options) =
        use document = JsonDocument.ParseValue(&reader)
        document.RootElement.Deserialize<ProjectDiff>(diffOptions)

    override _.Write(writer, value, _options) =
        use document = JsonDocument.Parse(JsonSerializer.Serialize(value, diffOptions))
        document.RootElement.WriteTo writer

/// Options pro SignalR hub: příchozí commandy podle `type`, odchozí diffy
/// podle `op`.
let hubOptions =
    let options = createOptions "type"
    options.Converters.Insert(0, ProjectCommandConverter())
    options.Converters.Insert(1, ProjectDiffConverter())
    options
