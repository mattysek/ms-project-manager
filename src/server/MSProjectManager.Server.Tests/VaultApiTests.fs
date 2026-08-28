/// Trezor hesel přes REST (PRD-09, ADR-016).
///
/// Server je pro trezor jen úložiště: obsah nezná a neumí ho přečíst. Testy
/// tady proto hlídají dvě věci, které z klienta ověřit nejdou — že se cizí
/// trezor nedá načíst a že v databázi opravdu neleží nic čitelného.
module MSProjectManager.Tests.VaultApiTests

open System.Net
open System.Net.Http.Json
open System.Threading.Tasks
open Microsoft.Extensions.DependencyInjection
open Microsoft.EntityFrameworkCore
open Xunit
open MSProjectManager.Api.Contracts
open MSProjectManager.Persistence.AppDbContext
open MSProjectManager.Tests.TestHost

[<NoEquality; NoComparison>]
type Pair =
    {
        App: TestApp
        Jan: Session
        Petra: Session
    }

/// Blob, jak ho posílá prohlížeč — pro server je to neprůhledný base64.
let private blob (marker: string) : VaultEntryRequest =
    {
        Id = null
        Ciphertext = $"c2lmcm92YW5vLXtcezRlXX0{marker}"
        Iv = "YWJjZGVmZ2hpamts"
    }

let private createVault (session: Session) =
    session.Client.PostAsJsonAsync(
        "/api/vault",
        {
            Kdf = "PBKDF2-SHA256"
            Iterations = 600000
            Salt = "c29sLXNvbC1zb2w="
            Verifier = "dmVyaWZpZXItYmxvYg=="
            VerifierIv = "aXYtaXYtaXYtaXY="
        }
    )

let private addEntry (session: Session) (marker: string) =
    task {
        let! response = session.Client.PostAsJsonAsync("/api/vault/entries", blob marker)
        return! readJson<VaultEntryResponse> response
    }

let private entriesOf (session: Session) =
    getJson<VaultEntryResponse list> session.Client "/api/vault/entries"

let private withPair (run: Pair -> Task<unit>) =
    task {
        use app = new TestApp()
        let! admin = setupAdmin app "admin" "Admin5678"
        let! jan = createUser app admin ("jan.novak", "Jan Novák", "Heslo1234")
        let! petra = createUser app admin ("petra.kolarova", "Petra Kolářová", "Heslo1234")

        do! run { App = app; Jan = jan; Petra = petra }
    }

[<Fact>]
let ``prázdný trezor hlásí, že ještě není založený`` () =
    withPair (fun pair ->
        task {
            let! profile = getJson<VaultProfileResponse> pair.Jan.Client "/api/vault"
            Assert.False profile.Exists

            let! _ = createVault pair.Jan
            let! after = getJson<VaultProfileResponse> pair.Jan.Client "/api/vault"
            Assert.True after.Exists
            Assert.Equal(600000, after.Iterations)
        }
    )

[<Fact>]
let ``druhé založení trezoru je odmítnuto`` () =
    // Přepsaný profil by znamenal nový klíč — a existující záznamy by se staly
    // nedešifrovatelnými.
    withPair (fun pair ->
        task {
            let! _ = createVault pair.Jan
            let! second = createVault pair.Jan

            Assert.Equal(HttpStatusCode.BadRequest, second.StatusCode)
        }
    )

[<Fact>]
let ``záznam nejde založit bez trezoru`` () =
    withPair (fun pair ->
        task {
            let! response = pair.Jan.Client.PostAsJsonAsync("/api/vault/entries", blob "a")

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode)
        }
    )

// @scenario: vault.feature > Cizí trezor není dostupný
[<Fact>]
let ``uživatel vidí jen vlastní záznamy a cizí nenačte`` () =
    withPair (fun pair ->
        task {
            let! _ = createVault pair.Jan
            let! _ = createVault pair.Petra
            let! janEntry = addEntry pair.Jan "jan"
            let! _ = addEntry pair.Petra "petra"

            let! janList = entriesOf pair.Jan
            let! petraList = entriesOf pair.Petra
            Assert.Single janList |> ignore
            Assert.Single petraList |> ignore
            Assert.NotEqual<string>(janList.Head.Id, petraList.Head.Id)

            // Cizí záznam se tváří jako neexistující — 404, ne 403: existenci
            // cizích dat nemá smysl potvrzovat (FR-VAULT-11).
            let! foreignDelete = pair.Petra.Client.DeleteAsync $"/api/vault/entries/{janEntry.Id}"
            Assert.Equal(HttpStatusCode.NotFound, foreignDelete.StatusCode)

            let! foreignUpdate =
                pair.Petra.Client.PutAsJsonAsync($"/api/vault/entries/{janEntry.Id}", blob "utok")

            Assert.Equal(HttpStatusCode.NotFound, foreignUpdate.StatusCode)

            // A záznam Jana musí být pořád jeho a nedotčený.
            let! stillThere = entriesOf pair.Jan
            Assert.Single stillThere |> ignore
            Assert.Equal(janEntry.Ciphertext, stillThere.Head.Ciphertext)
        }
    )

// @scenario: vault.feature > Server obsah trezoru nevidí
[<Fact>]
let ``v databázi leží jen šifrovaný blob`` () =
    withPair (fun pair ->
        task {
            let! _ = createVault pair.Jan
            let! _ = addEntry pair.Jan "jan"

            use scope = pair.App.Services.CreateScope()
            let db = scope.ServiceProvider.GetRequiredService<AppDbContext>()
            let! rows = db.VaultEntries.AsNoTracking().ToListAsync()

            // Server nemá klíč, takže se dovnitř nedostane ani takhle —
            // uložený je právě to, co poslal prohlížeč, a nic víc.
            let row = Assert.Single rows
            Assert.Equal((blob "jan").Ciphertext, row.Ciphertext)
            Assert.DoesNotContain("Tajne123", row.Ciphertext)

            // Profil nesmí nést heslo ani nic, z čeho by šlo odvodit klíč.
            let! profiles = db.VaultProfiles.AsNoTracking().ToListAsync()
            let profile = Assert.Single profiles
            Assert.DoesNotContain("Heslo1234", profile.Verifier)
            Assert.DoesNotContain("Heslo1234", profile.Salt)
        }
    )

// @scenario: vault.feature > Úprava záznamu
[<Fact>]
let ``úprava přepíše blob i IV`` () =
    withPair (fun pair ->
        task {
            let! _ = createVault pair.Jan
            let! entry = addEntry pair.Jan "puvodni"

            let! response =
                pair.Jan.Client.PutAsJsonAsync(
                    $"/api/vault/entries/{entry.Id}",
                    { Id = null; Ciphertext = "bm92eS1ibG9i"; Iv = "bm92ZS1pdi0xMjM0" }
                )

            let! updated = readJson<VaultEntryResponse> response
            Assert.Equal("bm92eS1ibG9i", updated.Ciphertext)
            Assert.Equal("bm92ZS1pdi0xMjM0", updated.Iv)

            let! list = entriesOf pair.Jan
            Assert.Single list |> ignore
        }
    )

// @scenario: vault.feature > Zrušení trezoru bez znalosti hesla
[<Fact>]
let ``zrušení trezoru smaže profil i záznamy`` () =
    withPair (fun pair ->
        task {
            let! _ = createVault pair.Jan
            let! _ = addEntry pair.Jan "jan"

            let! deleted = pair.Jan.Client.DeleteAsync "/api/vault"
            Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode)

            let! profile = getJson<VaultProfileResponse> pair.Jan.Client "/api/vault"
            Assert.False profile.Exists

            let! list = entriesOf pair.Jan
            Assert.Empty list
        }
    )

// @scenario: vault.feature > Změna hesla k trezoru
[<Fact>]
let ``rekey vymění profil i všechny záznamy naráz`` () =
    withPair (fun pair ->
        task {
            let! _ = createVault pair.Jan
            let! first = addEntry pair.Jan "prvni"
            let! second = addEntry pair.Jan "druhy"

            let! response =
                pair.Jan.Client.PostAsJsonAsync(
                    "/api/vault/rekey",
                    {
                        Kdf = "PBKDF2-SHA256"
                        Iterations = 600000
                        Salt = "bm92YS1zb2wtMTIzNA=="
                        Verifier = "bm92eS12ZXJpZmllcg=="
                        VerifierIv = "bm92ZS1pdi0xMjM0"
                        Entries =
                            [|
                                { Id = first.Id; Ciphertext = "cHJlc2lmcm92YW5vLTE="; Iv = "aXYtMS1pdi0xMjM0" }
                                { Id = second.Id; Ciphertext = "cHJlc2lmcm92YW5vLTI="; Iv = "aXYtMi1pdi0xMjM0" }
                            |]
                    }
                )

            Assert.Equal(HttpStatusCode.OK, response.StatusCode)

            let! profile = getJson<VaultProfileResponse> pair.Jan.Client "/api/vault"
            Assert.Equal("bm92YS1zb2wtMTIzNA==", profile.Salt)

            // Staré blobs jsou po výměně klíče nedešifrovatelné, takže po nich
            // nesmí nic zbýt — jinak by v trezoru zůstal mrtvý obsah.
            let! list = entriesOf pair.Jan
            Assert.Equal(2, list.Length)
            Assert.All(list, fun entry -> Assert.StartsWith("cHJlc2lmcm92YW5v", entry.Ciphertext))
        }
    )

[<Fact>]
let ``rekey s cizím id je odmítnut a nic nerozbije`` () =
    // `vault_entries.id` je globální primární klíč, takže cizí id neprojde přes
    // UNIQUE a bez téhle kontroly zápis spadne uprostřed transakce (SQLite
    // Error 19) místo slušného odmítnutí.
    withPair (fun pair ->
        task {
            let! _ = createVault pair.Jan
            let! janEntry = addEntry pair.Jan "jan"
            let! _ = createVault pair.Petra
            let! petraEntry = addEntry pair.Petra "petra"

            let! response =
                pair.Petra.Client.PostAsJsonAsync(
                    "/api/vault/rekey",
                    {
                        Kdf = "PBKDF2-SHA256"
                        Iterations = 600000
                        Salt = "cGV0cmEtc29sLTEyMzQ="
                        Verifier = "cGV0cmEtdmVyaWZpZXI="
                        VerifierIv = "aXYtaXYtaXYtaXY="
                        Entries = [| { Id = janEntry.Id; Ciphertext = "dXRvay1ibG9i"; Iv = "aXYtaXYtaXYtaXY=" } |]
                    }
                )

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode)

            // Janův záznam zůstal nedotčený a Petřin taky — odmítnutý rekey
            // nesmí sáhnout na žádnou stranu.
            let! janList = entriesOf pair.Jan
            Assert.Single janList |> ignore
            Assert.Equal(janEntry.Ciphertext, janList.Head.Ciphertext)

            let! petraList = entriesOf pair.Petra
            Assert.Single petraList |> ignore
            Assert.Equal(petraEntry.Ciphertext, petraList.Head.Ciphertext)
        }
    )

[<Fact>]
let ``rekey bez některého vlastního záznamu je odmítnut`` () =
    // Rekey nahrazuje celý obsah. Kdyby prošel neúplný seznam, chybějící
    // záznam by tiše zmizel — a protože je šifrovaný, nikdo by si toho
    // nevšiml.
    withPair (fun pair ->
        task {
            let! _ = createVault pair.Jan
            let! first = addEntry pair.Jan "prvni"
            let! _ = addEntry pair.Jan "druhy"

            let! response =
                pair.Jan.Client.PostAsJsonAsync(
                    "/api/vault/rekey",
                    {
                        Kdf = "PBKDF2-SHA256"
                        Iterations = 600000
                        Salt = "bm92YS1zb2wtMTIzNA=="
                        Verifier = "bm92eS12ZXJpZmllcg=="
                        VerifierIv = "bm92ZS1pdi0xMjM0"
                        Entries =
                            [| { Id = first.Id; Ciphertext = "cHJlc2lmcm92YW5vLTE="; Iv = "aXYtMS1pdi0xMjM0" } |]
                    }
                )

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode)

            let! list = entriesOf pair.Jan
            Assert.Equal(2, list.Length)
        }
    )

[<Fact>]
let ``nepřihlášený uživatel se k trezoru nedostane`` () =
    task {
        use app = new TestApp()
        let anonymous = app.CreateClient()

        let! profile = anonymous.GetAsync "/api/vault"
        let! entries = anonymous.GetAsync "/api/vault/entries"

        Assert.Equal(HttpStatusCode.Unauthorized, profile.StatusCode)
        Assert.Equal(HttpStatusCode.Unauthorized, entries.StatusCode)
    }
