/// Repozitář trezoru hesel (PRD-09, ADR-016).
///
/// Zvláštnost oproti ostatním repozitářům: **do dat se tu nikdy nekouká**.
/// `Ciphertext` je neprůhledný blob zašifrovaný v prohlížeči a server nemá
/// klíč, takže nemůže validovat obsah, hledat v něm ani ho zobrazit. Jediné,
/// co kontroluje, je vlastnictví, velikost a počet záznamů.
///
/// Vlastníka ověřuje každá operace zvlášť: cizí záznam se tváří jako
/// neexistující (FR-VAULT-11), stejné pravidlo jako u quick notes.
module MSProjectManager.Persistence.Repositories.Vault

open System.Linq
open Microsoft.EntityFrameworkCore
open MSProjectManager.Persistence.Entities
open MSProjectManager.Persistence.AppDbContext
open MSProjectManager.Persistence.Repository

/// Maximální velikost zašifrovaného záznamu (PRD-09, NFR) — aby se z trezoru
/// nestalo úložiště souborů. Base64 nafukuje o třetinu, limit je na blob.
[<Literal>]
let MaxCiphertextLength = 8192

/// Maximální počet záznamů na uživatele (PRD-09, FR-VAULT-04).
[<Literal>]
let MaxEntriesPerUser = 500

/// Parametry odvození klíče, jak je klient potřebuje k odemčení.
type VaultProfile =
    {
        Kdf: string
        Iterations: int
        Salt: string
        Verifier: string
        VerifierIv: string
        CreatedAt: string
        UpdatedAt: string
    }

/// Zašifrovaný záznam tak, jak putuje na klienta.
type VaultEntry =
    {
        Id: string
        Ciphertext: string
        Iv: string
        CreatedAt: string
        UpdatedAt: string
    }

/// Zakládaný profil trezoru.
type NewVaultProfile =
    {
        UserId: string
        Kdf: string
        Iterations: int
        Salt: string
        Verifier: string
        VerifierIv: string
    }

/// Zakládaný nebo přepisovaný záznam. `Id` volí klient (jako u quick notes).
type VaultEntryInput =
    {
        Id: string
        UserId: string
        Ciphertext: string
        Iv: string
    }

let private toProfile (row: VaultProfileRow) : VaultProfile =
    {
        Kdf = row.Kdf
        Iterations = row.Iterations
        Salt = row.Salt
        Verifier = row.Verifier
        VerifierIv = row.VerifierIv
        CreatedAt = row.CreatedAt
        UpdatedAt = row.UpdatedAt
    }

let private toEntry (row: VaultEntryRow) : VaultEntry =
    {
        Id = row.Id
        Ciphertext = row.Ciphertext
        Iv = row.Iv
        CreatedAt = row.CreatedAt
        UpdatedAt = row.UpdatedAt
    }

/// Blob se nedá zkontrolovat na obsah, jen na to, že vůbec je a není přerostlý.
let private validateBlob (ciphertext: string) (iv: string) =
    if
        System.String.IsNullOrWhiteSpace ciphertext
        || System.String.IsNullOrWhiteSpace iv
    then
        Error "Záznam trezoru musí mít obsah"
    elif ciphertext.Length > MaxCiphertextLength then
        Error $"Záznam trezoru může mít nejvýš {MaxCiphertextLength} znaků"
    else
        Ok()

let private tryFindOwnEntry (db: AppDbContext) (entryId: string) (userId: string) =
    async {
        let! row =
            db.VaultEntries.AsNoTracking().FirstOrDefaultAsync(fun row -> row.Id = entryId && row.UserId = userId)
            |> Async.AwaitTask

        return Option.ofObj row
    }

/// Profil trezoru uživatele; `None` znamená „trezor ještě není založený".
let tryGetProfile (db: AppDbContext) (userId: string) : Async<VaultProfile option> =
    async {
        let! row =
            db.VaultProfiles.AsNoTracking().FirstOrDefaultAsync(fun row -> row.UserId = userId)
            |> Async.AwaitTask

        return row |> Option.ofObj |> Option.map toProfile
    }

/// Založí trezor. Druhé založení je chyba — přepsat profil by znamenalo
/// zahodit klíč, kterým jsou zašifrované existující záznamy.
let createProfile (db: AppDbContext) (profile: NewVaultProfile) : Async<Result<VaultProfile, string>> =
    async {
        let! existing = tryGetProfile db profile.UserId

        match existing with
        | Some _ -> return Error "Trezor už existuje"
        | None ->
            let timestamp = nowIso ()

            let row =
                {
                    UserId = profile.UserId
                    Kdf = profile.Kdf
                    Iterations = profile.Iterations
                    Salt = profile.Salt
                    Verifier = profile.Verifier
                    VerifierIv = profile.VerifierIv
                    CreatedAt = timestamp
                    UpdatedAt = timestamp
                }

            db.VaultProfiles.Add row |> ignore
            do! saveChanges db
            return Ok(toProfile row)
    }

/// Záznamy uživatele, od naposledy upravených.
let listEntries (db: AppDbContext) (userId: string) : Async<VaultEntry list> =
    async {
        let! rows =
            db.VaultEntries
                .AsNoTracking()
                .Where(fun row -> row.UserId = userId)
                .OrderByDescending(fun row -> row.UpdatedAt)
                .ToListAsync()
            |> Async.AwaitTask

        return rows |> Seq.map toEntry |> Seq.toList
    }

/// Vlastní záznam; cizí se tváří jako neexistující.
let tryGetEntry (db: AppDbContext) (entryId: string) (userId: string) : Async<VaultEntry option> =
    async {
        let! row = tryFindOwnEntry db entryId userId
        return row |> Option.map toEntry
    }

/// Založí záznam. Bez profilu nemá co existovat — klient by ho neměl čím dešifrovat.
let createEntry (db: AppDbContext) (entry: VaultEntryInput) : Async<Result<VaultEntry, string>> =
    async {
        let! profile = tryGetProfile db entry.UserId

        let! count =
            db.VaultEntries.CountAsync(fun row -> row.UserId = entry.UserId)
            |> Async.AwaitTask

        match profile, validateBlob entry.Ciphertext entry.Iv with
        | None, _ -> return Error "Trezor není založen"
        | Some _, Error message -> return Error message
        | Some _, Ok() when count >= MaxEntriesPerUser -> return Error $"Překročen limit {MaxEntriesPerUser} záznamů"
        | Some _, Ok() ->
            let timestamp = nowIso ()

            let row =
                {
                    Id = entry.Id
                    UserId = entry.UserId
                    Ciphertext = entry.Ciphertext
                    Iv = entry.Iv
                    CreatedAt = timestamp
                    UpdatedAt = timestamp
                }

            db.VaultEntries.Add row |> ignore
            do! saveChanges db
            return Ok(toEntry row)
    }

/// Přepíše obsah záznamu novým blobem (nové IV posílá klient s každým zápisem).
let updateEntry (db: AppDbContext) (entry: VaultEntryInput) : Async<Result<VaultEntry, string>> =
    async {
        let! existing = tryFindOwnEntry db entry.Id entry.UserId

        match existing, validateBlob entry.Ciphertext entry.Iv with
        | None, _ -> return Error "Záznam neexistuje"
        | Some _, Error message -> return Error message
        | Some row, Ok() ->
            let updated =
                { row with
                    Ciphertext = entry.Ciphertext
                    Iv = entry.Iv
                    UpdatedAt = nowIso ()
                }

            db.VaultEntries.Update updated |> ignore
            do! saveChanges db
            return Ok(toEntry updated)
    }

/// Smaže vlastní záznam.
let deleteEntry (db: AppDbContext) (entryId: string) (userId: string) : Async<bool> =
    async {
        let! existing = tryFindOwnEntry db entryId userId

        match existing with
        | None -> return false
        | Some row ->
            db.VaultEntries.Remove row |> ignore
            do! saveChanges db
            return true
    }

/// Rekey smí přešifrovat právě to, co uživatel v trezoru má — nic víc a nic míň.
///
/// Obě strany té rovnosti jsou tvrdé:
///
/// - **Cizí id** je bezpečnostní věc. `vault_entries.id` je globální primární
///   klíč, takže id patřící někomu jinému neprojde přes `UNIQUE` a skončí
///   pádem uprostřed transakce (SQLite Error 19) místo slušného odmítnutí.
///   Mazání přitom běží jen nad vlastními řádky, takže cizí záznam by se
///   nepřepsal — jen by se rozbil zápis.
/// - **Chybějící vlastní id** je věc ztráty dat. Rekey nahrazuje celý obsah,
///   takže záznam, který klient v seznamu neměl (přibyl v jiné záložce mezi
///   načtením a odesláním), by zmizel — a protože je šifrovaný, nikdo by si
///   toho nevšiml. Radši odmítnout a nechat uživatele akci zopakovat.
let private checkCoversOwnEntries (owned: VaultEntryRow seq) (entries: VaultEntryInput list) =
    let ownedIds = owned |> Seq.map (fun row -> row.Id) |> Set.ofSeq
    let incomingIds = entries |> List.map (fun entry -> entry.Id) |> Set.ofList

    if ownedIds = incomingIds then
        Ok()
    else
        Error "Změna hesla musí přešifrovat právě všechny záznamy trezoru"

/// Změna hesla trezoru: nový profil a **všechny** znovu zašifrované záznamy
/// najednou (FR-VAULT-09).
///
/// Jde o jednu transakci schválně. Po částech by přerušené spojení nechalo
/// část záznamů pod starým a část pod novým klíčem — a protože server dovnitř
/// nevidí, nešlo by to ani poznat, ani spravit.
let rekey
    (db: AppDbContext)
    (profile: NewVaultProfile)
    (entries: VaultEntryInput list)
    : Async<Result<VaultProfile, string>> =
    async {
        // `AsNoTracking` je tu nutnost, ne optimalizace: níž se přes `Update`
        // připojuje nová instance se stejným klíčem, a sledovaná původní by
        // s ní kolidovala („another instance with the same key value").
        let! existing =
            db.VaultProfiles.AsNoTracking().FirstOrDefaultAsync(fun row -> row.UserId = profile.UserId)
            |> Async.AwaitTask

        let! oldRows =
            db.VaultEntries.Where(fun row -> row.UserId = profile.UserId).ToListAsync()
            |> Async.AwaitTask

        let invalid =
            entries
            |> List.tryPick (fun e ->
                match validateBlob e.Ciphertext e.Iv with
                | Error message -> Some message
                | Ok() -> None
            )

        match Option.ofObj existing, invalid, checkCoversOwnEntries oldRows entries with
        | None, _, _ -> return Error "Trezor není založen"
        | Some _, Some message, _ -> return Error message
        | Some _, None, Error message -> return Error message
        | Some current, None, Ok() ->
            use! transaction = db.Database.BeginTransactionAsync() |> Async.AwaitTask

            let timestamp = nowIso ()

            let updatedProfile =
                { current with
                    Kdf = profile.Kdf
                    Iterations = profile.Iterations
                    Salt = profile.Salt
                    Verifier = profile.Verifier
                    VerifierIv = profile.VerifierIv
                    UpdatedAt = timestamp
                }

            db.VaultProfiles.Update updatedProfile |> ignore

            // Staré blobs jsou po změně klíče nedešifrovatelné, takže se
            // nemigrují — nahradí se tím, co klient poslal.
            db.VaultEntries.RemoveRange oldRows |> ignore

            for entry in entries do
                db.VaultEntries.Add
                    {
                        Id = entry.Id
                        UserId = profile.UserId
                        Ciphertext = entry.Ciphertext
                        Iv = entry.Iv
                        CreatedAt = timestamp
                        UpdatedAt = timestamp
                    }
                |> ignore

            do! db.SaveChangesAsync() |> Async.AwaitTask |> Async.Ignore
            do! transaction.CommitAsync() |> Async.AwaitTask
            db.ChangeTracker.Clear()
            return Ok(toProfile updatedProfile)
    }

/// Smaže celý trezor včetně záznamů (FR-VAULT-10).
///
/// Nevyžaduje znalost hesla — je to jediné východisko ze zapomenutého hesla
/// a server ho stejně nemá jak ověřit.
let deleteVault (db: AppDbContext) (userId: string) : Async<bool> =
    async {
        let! profile =
            db.VaultProfiles.FirstOrDefaultAsync(fun row -> row.UserId = userId)
            |> Async.AwaitTask

        match Option.ofObj profile with
        | None -> return false
        | Some row ->
            let! entries =
                db.VaultEntries.Where(fun e -> e.UserId = userId).ToListAsync()
                |> Async.AwaitTask

            db.VaultEntries.RemoveRange entries |> ignore
            db.VaultProfiles.Remove row |> ignore
            do! saveChanges db
            return true
    }
