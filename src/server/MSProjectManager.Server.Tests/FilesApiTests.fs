/// Přílohy přes REST + diff přes SignalR (ADR-010, `files.feature`).
module MSProjectManager.Tests.FilesApiTests

open System
open System.Net
open System.Net.Http
open System.Net.Http.Json
open System.Text
open Xunit
open MSProjectManager.Domain.Diffs
open MSProjectManager.Api.Contracts
open MSProjectManager.Tests.TestHost
open MSProjectManager.Tests.ProjectsApiTests

let private content (bytes: byte[]) (fileName: string) (mime: string) =
    let form = new MultipartFormDataContent()
    let file = new ByteArrayContent(bytes)
    file.Headers.ContentType <- Headers.MediaTypeHeaderValue mime
    form.Add(file, "file", fileName)
    form

let private upload (session: Session) (projectId: string) (form: MultipartFormDataContent) =
    session.Client.PostAsync($"/api/projects/{projectId}/files", form)

let private pdf (text: string) = Encoding.UTF8.GetBytes text

// @scenario: files.feature > Upload souboru přes file picker
[<Fact>]
let ``nahraný soubor je uložen a ostatní o něm dostanou diff`` () =
    withTeam (fun team ->
        task {
            use! petraHub = connectHub team.App team.Petra
            let! _ = petraHub.Join team.ProjectId

            let! response =
                upload team.Jan team.ProjectId (content (pdf "specifikace") "specifikace-api.pdf" "application/pdf")

            Assert.Equal(HttpStatusCode.OK, response.StatusCode)
            let! uploaded = readJson<FileResponse> response
            Assert.Equal("specifikace-api.pdf", uploaded.File.Name)
            Assert.Equal(team.Jan.User.UserId, uploaded.File.AddedBy)

            let! diff =
                waitForDiff
                    petraHub
                    (fun diff ->
                        match diff with
                        | FileAdded file -> file.Name = "specifikace-api.pdf"
                        | _ -> false
                    )

            Assert.True(
                match diff with
                | FileAdded _ -> true
                | _ -> false
            )

            // Obsah je v databázi, ne ve stavu projektu — stáhne se zvlášť.
            let! download = team.Jan.Client.GetAsync $"/api/files/{uploaded.File.Id}"
            let! bytes = download.Content.ReadAsByteArrayAsync()
            Assert.Equal<byte[]>(pdf "specifikace", bytes)
        }
    )

// @scenario: files.feature > Upload souboru s přílišnou velikostí
[<Fact>]
let ``příliš velký soubor je odmítnut`` () =
    withTeam (fun team ->
        task {
            let big = Array.zeroCreate<byte> (26 * 1024 * 1024)
            let! response = upload team.Jan team.ProjectId (content big "velka-databaze.bak" "application/pdf")
            Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode)
            let! body = readJson<ApiError> response
            Assert.Equal("Soubor je příliš velký. Maximální povolená velikost je 25 MB.", body.Message)
        }
    )

// @scenario: files.feature > Běžné projektové přílohy jdou nahrát
[<Theory>]
[<InlineData("poznamky.md", "text/markdown")>]
[<InlineData("balik.zip", "application/x-zip-compressed")>]
[<InlineData("certifikat.pfx", "application/x-pkcs12")>]
[<InlineData("neznamy.dat", "application/octet-stream")>]
let ``běžné přílohy projdou`` (name: string, mime: string) =
    withTeam (fun team ->
        task {
            // Whitelist MIME typů odmítal přesně tohle a reálný export z provozu
            // tím přišel o polovinu příloh. Uložit bajty není zranitelnost —
            // rozhoduje se až při zobrazení (viz test na `attachment` níž).
            use form = content (pdf "obsah") name mime
            let! response = upload team.Jan team.ProjectId form

            Assert.Equal(HttpStatusCode.OK, response.StatusCode)
        }
    )

// @scenario: files.feature > Stažení souboru
[<Fact>]
let ``stažený soubor má původní název i obsah`` () =
    withTeam (fun team ->
        task {
            let! response =
                upload team.Jan team.ProjectId (content (pdf "obsah pdf") "specifikace-api.pdf" "application/pdf")

            let! uploaded = readJson<FileResponse> response
            let! download = team.Jan.Client.GetAsync $"/api/files/{uploaded.File.Id}"
            Assert.Equal(HttpStatusCode.OK, download.StatusCode)
            let disposition = nonNull download.Content.Headers.ContentDisposition
            Assert.Equal("specifikace-api.pdf", (nonNull disposition.FileName).Trim('"'))
            let! bytes = download.Content.ReadAsByteArrayAsync()
            Assert.Equal<byte[]>(pdf "obsah pdf", bytes)
        }
    )

// @scenario: files.feature > Dev může stahovat soubory
[<Fact>]
let ``Dev si soubor stáhne`` () =
    withTeam (fun team ->
        task {
            let! response =
                upload team.Jan team.ProjectId (content (pdf "obsah") "specifikace-api.pdf" "application/pdf")

            let! uploaded = readJson<FileResponse> response
            let! download = team.Petra.Client.GetAsync $"/api/files/{uploaded.File.Id}"
            Assert.Equal(HttpStatusCode.OK, download.StatusCode)
        }
    )

// @scenario: files.feature > Neoprávněný přístup k souboru přes přímou URL
[<Fact>]
let ``nečlen projektu dostane 403`` () =
    withTeam (fun team ->
        task {
            let! response =
                upload team.Jan team.ProjectId (content (pdf "obsah") "specifikace-api.pdf" "application/pdf")

            let! uploaded = readJson<FileResponse> response
            let! outsider = createUser team.App team.Admin ("kdosi", "Kdosi Cizí", "Heslo1234")
            let! download = outsider.Client.GetAsync $"/api/files/{uploaded.File.Id}"
            Assert.Equal(HttpStatusCode.Forbidden, download.StatusCode)
        }
    )

// @scenario: files.feature > Dev nemůže smazat soubor
[<Fact>]
let ``Dev soubor smazat nesmí`` () =
    withTeam (fun team ->
        task {
            let! response =
                upload team.Jan team.ProjectId (content (pdf "obsah") "zastarale-dokumenty.zip" "application/zip")

            let! uploaded = readJson<FileResponse> response
            let! deleted = team.Petra.Client.DeleteAsync $"/api/files/{uploaded.File.Id}"
            Assert.Equal(HttpStatusCode.Forbidden, deleted.StatusCode)
            let! stillThere = team.Jan.Client.GetAsync $"/api/files/{uploaded.File.Id}"
            Assert.Equal(HttpStatusCode.OK, stillThere.StatusCode)
        }
    )

// @scenario: files.feature > Smazání souboru (PM)
[<Fact>]
let ``PM soubor smaže a zmizí i z úložiště`` () =
    withTeam (fun team ->
        task {
            let! response =
                upload team.Jan team.ProjectId (content (pdf "obsah") "zastarale-dokumenty.zip" "application/zip")

            let! uploaded = readJson<FileResponse> response
            let! deleted = team.Jan.Client.DeleteAsync $"/api/files/{uploaded.File.Id}"
            Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode)
            let! gone = team.Jan.Client.GetAsync $"/api/files/{uploaded.File.Id}"
            Assert.Equal(HttpStatusCode.NotFound, gone.StatusCode)
        }
    )

[<Fact>]
let ``celková velikost příloh roste s uploady`` () =
    withTeam (fun team ->
        task {
            let! first = upload team.Jan team.ProjectId (content (Array.zeroCreate 1000) "a.pdf" "application/pdf")
            let! firstBody = readJson<FileResponse> first
            Assert.Equal(1000L, firstBody.TotalSize)

            let! second = upload team.Jan team.ProjectId (content (Array.zeroCreate 500) "b.png" "image/png")
            let! secondBody = readJson<FileResponse> second
            Assert.Equal(1500L, secondBody.TotalSize)
        }
    )

// @scenario: files.feature > Skriptovatelný obsah se nikdy nepošle inline
[<Fact>]
let ``skriptovatelný obsah se nikdy nepošle inline`` () =
    withTeam (fun team ->
        task {
            // SVG i HTML se nahrát smějí, ale ven jdou vždycky jako příloha ke
            // stažení — z `file://` se k naší cookie ani originu nedostanou.
            // Tady je celá záruka, ne ve filtru při nahrávání.
            let svg =
                Encoding.UTF8.GetBytes "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"

            use svgForm = content svg "ikona.svg" "image/svg+xml"
            let! uploaded = upload team.Jan team.ProjectId svgForm
            Assert.Equal(HttpStatusCode.OK, uploaded.StatusCode)
            let! stored = readJson<FileResponse> uploaded

            let! response = team.Jan.Client.GetAsync $"/api/files/{stored.File.Id}?inline=true"

            Assert.Equal(HttpStatusCode.OK, response.StatusCode)
            let disposition = nonNull response.Content.Headers.ContentDisposition
            Assert.Equal("attachment", disposition.DispositionType)
        }
    )

// @scenario: files.feature > Náhled se vynutí jako stažení u typů, které umí spouštět skript
[<Fact>]
let ``náhled typu mimo safelist se pošle jako attachment`` () =
    withTeam (fun team ->
        task {
            let! upload' = upload team.Jan team.ProjectId (content (pdf "poznámky") "poznamky.txt" "text/plain")
            let! uploaded = readJson<FileResponse> upload'

            let! response = team.Jan.Client.GetAsync $"/api/files/{uploaded.File.Id}?inline=true"

            let disposition =
                response.Content.Headers.ContentDisposition
                |> Option.ofObj
                |> Option.map (fun value -> value.DispositionType)

            Assert.Equal(Some "attachment", disposition)
        }
    )

// @scenario: files.feature > Náhled obrázku a PDF zůstává inline
[<Fact>]
let ``náhled obrázku a PDF zůstává inline`` () =
    withTeam (fun team ->
        task {
            for name, mime in
                [
                    "diagram-architektury.png", "image/png"
                    "specifikace-api.pdf", "application/pdf"
                ] do
                let! upload' = upload team.Jan team.ProjectId (content (pdf "obsah") name mime)
                let! uploaded = readJson<FileResponse> upload'

                let! response = team.Jan.Client.GetAsync $"/api/files/{uploaded.File.Id}?inline=true"

                // `Results.File` bez názvu souboru hlavičku vůbec nepošle —
                // právě to prohlížeč vykreslí inline.
                Assert.True(isNull (box response.Content.Headers.ContentDisposition))
        }
    )

// @scenario: files.feature > Dev může nahrávat soubory
[<Fact>]
let ``Dev smí nahrát soubor a ostatní o něm dostanou diff`` () =
    withTeam (fun team ->
        task {
            use! janHub = connectHub team.App team.Jan
            let! _ = janHub.Join team.ProjectId

            let! response =
                upload team.Petra team.ProjectId (content (pdf "analýza") "moje-analyza.pdf" "application/pdf")

            Assert.Equal(HttpStatusCode.OK, response.StatusCode)
            let! uploaded = readJson<FileResponse> response
            Assert.Equal(team.Petra.User.UserId, uploaded.File.AddedBy)

            let! _ =
                waitForDiff
                    janHub
                    (fun diff ->
                        match diff with
                        | FileAdded file -> file.Name = "moje-analyza.pdf"
                        | _ -> false
                    )

            ()
        }
    )

// @scenario: project-management.feature > Do archivovaného projektu nelze nahrát přílohu
[<Fact>]
let ``do archivovaného projektu nelze nahrát přílohu`` () =
    withTeam (fun team ->
        task {
            let! archived = team.Jan.Client.PostAsync($"/api/projects/{team.ProjectId}/archive", null)
            Assert.Equal(HttpStatusCode.NoContent, archived.StatusCode)

            // Přílohy jdou přes REST, ne přes hub — zámek archivu je proto
            // musí kontrolovat zvlášť, jinak by šlo do zamrzlého projektu dál
            // nahrávat soubory.
            use form = content (pdf "smlouva") "smlouva.pdf" "application/pdf"
            let! response = upload team.Jan team.ProjectId form

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode)
            let! body = readJson<ApiError> response
            Assert.Contains("archivovaný", body.Message)
        }
    )
