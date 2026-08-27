/// Přílohy — upload a download (ADR-010).
///
/// Obsah souboru nikdy neprochází stavem projektu ani SignalR broadcastem;
/// přes actor jde jen `FileRef`, aby metadata dorazila všem klientům.
module MSProjectManager.Api.FilesApi

open System
open System.IO
open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open Microsoft.AspNetCore.SignalR
open MSProjectManager.Domain.Types
open MSProjectManager.Domain.State
open MSProjectManager.Domain.Commands
open MSProjectManager.Domain.Diffs
open MSProjectManager.Persistence.AppDbContext
open MSProjectManager.Persistence.Repository
open MSProjectManager.Persistence.Repositories
open MSProjectManager.Actors.ProjectActorRegistry
open MSProjectManager.Realtime.Membership
open MSProjectManager.Realtime.ProjectHub
open MSProjectManager.Api.Contracts
open MSProjectManager.Api.Http

/// Maximální velikost jednoho souboru (PRD-00).
[<Literal>]
let MaxFileSize = 26214400L // 25 MB

/// Typy, které se smějí poslat `inline` (náhled v `<img>`/`<iframe>`).
///
/// **Tady leží celá bezpečnostní záruka příloh** — ne v tom, co jde nahrát.
///
/// Nahrávání dřív filtroval whitelist MIME typů a odmítal běžné projektové
/// přílohy: `text/markdown`, `.pfx`, `application/x-zip-compressed`, cokoli
/// s `application/octet-stream`. Reálný export z provozu tím přišel o polovinu
/// souborů. Uložit bajty ale samo o sobě zranitelnost není — uložené XSS
/// vzniká až tam, kde se obsah **vykreslí jako HTML na našem originu**, a proti
/// tomu stojí dvě zábrany, které whitelist při uploadu stejně nenahradí:
///
/// 1. Servírování: seznam níž je uzavřený, všechno ostatní dostane
///    `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`.
///    Stažený soubor se otevírá z `file://`, tedy mimo náš origin a bez cookie.
/// 2. Náhled na klientovi: markdown i Word procházejí `sanitizeHtml`
///    (DOMPurify), text a kód se vykreslují jako escapovaný `<pre>` a metadata
///    (jméno, poznámka, MIME) jdou přes JSX, které escapuje samo.
///
/// Kdo přidá nový typ náhledu, posouvá tuhle hranici — a musí ji ohlídat tam.
/// Viz ADR-010, doplněk. Rastr a PDF; PDF vykresluje
/// sandboxovaný prohlížečový viewer, na DOM rodiče nedosáhne. Cokoli jiného jde
/// vždy jako `attachment`, takže se to z našeho originu nikdy nevykreslí.
let private inlineSafeMimes =
    [
        "image/png"
        "image/jpeg"
        "image/gif"
        "image/webp"
        "image/bmp"
        "application/pdf"
    ]

let isInlineSafeMime (mime: string | null) =
    match mime with
    | null -> false
    | value -> List.contains (value.ToLowerInvariant()) inlineSafeMimes


let private db (ctx: HttpContext) = service<AppDbContext> ctx
let private membership (ctx: HttpContext) = service<MembershipCache> ctx

let private requireMember (ctx: HttpContext) (projectId: string) =
    (membership ctx).TryGetRole(projectId, userId ctx) |> Async.StartAsTask

/// Přílohy jdou přes REST, ne přes hub, takže je zámek archivu z `ProjectHub`
/// mine — musí se zkontrolovat i tady, jinak by do zamrzlého projektu šlo dál
/// nahrávat a mazat soubory.
let private requireWritable (ctx: HttpContext) (projectId: string) =
    (membership ctx).IsArchived projectId |> Async.StartAsTask

/// Pošle metadata přes actor, aby je klienti dostali jako diff.
let private announce (ctx: HttpContext) (projectId: string) (command: FileCommand) =
    task {
        let registry = service<ProjectActorRegistry> ctx
        let hub = service<IHubContext<ProjectHub>> ctx

        let user =
            {
                UserId = userId ctx
                DisplayName = displayName ctx
                Role = Pm
            }

        match! registry.Get(projectId).Execute(user, FileCmd command) |> Async.StartAsTask with
        | Ok diffs ->
            for diff in diffs do
                do! hub.Clients.Group(groupOf projectId).SendAsync("ReceiveDiff", diff)
        | Error _ -> ()
    }

let private storeUpload (ctx: HttpContext) (projectId: string) (file: IFormFile) =
    task {
        use stream = new MemoryStream()
        do! file.CopyToAsync stream

        let reference =
            {
                Id = Guid.NewGuid().ToString "N"
                Name = file.FileName
                MimeType = file.ContentType
                Size = file.Length
                AddedAt = nowIso ()
                AddedBy = userId ctx
                Note = ""
            }

        do!
            Files.add
                (db ctx)
                {
                    ProjectId = projectId
                    Ref = reference
                    Data = stream.ToArray()
                }

        do! announce ctx projectId (AddFile reference)
        let! total = Files.totalSize (db ctx) projectId
        return Results.Json { File = reference; TotalSize = total }
    }

/// `POST /api/projects/{id}/files`
let upload (ctx: HttpContext) (projectId: string) : Task<IResult> =
    task {
        match! requireMember ctx projectId with
        | None -> return forbidden "Nejste členem tohoto projektu"
        | Some _ ->
            let! isArchived = requireWritable ctx projectId

            if isArchived then
                return badRequest "Projekt je archivovaný — nejdřív ho vraťte z archivu"
            elif not ctx.Request.HasFormContentType then
                return badRequest "Očekávám multipart/form-data"
            else
                let! form = ctx.Request.ReadFormAsync()

                match form.Files |> Seq.tryHead with
                | None -> return badRequest "Chybí soubor"
                | Some file when file.Length > MaxFileSize ->
                    return
                        error
                            StatusCodes.Status413PayloadTooLarge
                            "Soubor je příliš velký. Maximální povolená velikost je 25 MB."
                | Some file -> return! storeUpload ctx projectId file
    }

/// `GET /api/files/{id}` — `?inline=true` pro náhled, jinak ke stažení.
///
/// `inline` se uzná jen u typů z `inlineSafeMimes`. U všeho ostatního se
/// posílá `Content-Disposition: attachment`, i když si klient řekl o náhled:
/// obsah je uživatelský a servíruje se ze stejného originu jako aplikace,
/// takže cokoli skriptovatelného zobrazené inline je uložené XSS. Nahrát jde
/// přitom cokoli (viz `inlineSafeMimes`), takže je tahle větev jediná, co mezi
/// obsah a origin stojí — SVG, HTML i neznámé typy jí vypadnou na `attachment`.
let download (ctx: HttpContext) (fileId: string) : Task<IResult> =
    task {
        let! projectId = Files.tryGetProjectId (db ctx) fileId

        match projectId with
        | None -> return notFound "Soubor neexistuje"
        | Some project ->
            match! requireMember ctx project with
            | None -> return forbidden "Nemáte přístup k tomuto souboru"
            | Some _ ->
                let! stored = Files.tryGet (db ctx) fileId

                match stored with
                | None -> return notFound "Soubor neexistuje"
                | Some file ->
                    let wantsInline = ctx.Request.Query.["inline"].ToString() = "true"

                    if wantsInline && isInlineSafeMime file.Ref.MimeType then
                        return Results.File(file.Data, file.Ref.MimeType)
                    else
                        return Results.File(file.Data, file.Ref.MimeType, file.Ref.Name)
    }

/// `DELETE /api/files/{id}` — mazat smí jen PM (FR-ROLE-01); autorizaci
/// vyhodnotí actor, REST jen odstraní BLOB.
let remove (ctx: HttpContext) (fileId: string) : Task<IResult> =
    task {
        let! projectId = Files.tryGetProjectId (db ctx) fileId

        match projectId with
        | None -> return notFound "Soubor neexistuje"
        | Some project ->
            match! requireMember ctx project with
            | None -> return forbidden "Nejste členem tohoto projektu"
            | Some Dev -> return forbidden "Nedostatečná oprávnění: pouze PM může mazat přílohy"
            | Some Pm ->
                let! isArchived = requireWritable ctx project

                if isArchived then
                    return badRequest "Projekt je archivovaný — nejdřív ho vraťte z archivu"
                else

                do! announce ctx project (DeleteFile fileId)
                let! deleted = Files.delete (db ctx) fileId

                if deleted then
                    return Results.NoContent()
                else
                    return notFound "Soubor neexistuje"
    }
