/// Databázové entity — 1:1 podle SQL schématu v PRD-00.
///
/// Sloupce jsou snake_case, mapování názvů je v `AppDbContext`. Časy se
/// ukládají jako ISO 8601 text (SQLite nemá datový typ pro datum), stejně
/// jako je posílá a čte frontend.
module MSProjectManager.Persistence.Entities

open Microsoft.AspNetCore.Identity

/// Uživatel systému. Účty se nemažou, jen deaktivují (FR-AUTH-05) — na
/// userId visí členství, přílohy i quick notes.
type AppUser() =
    inherit IdentityUser()

    /// Zobrazované jméno v UI (Header, presence, seznam členů).
    member val DisplayName = "" with get, set

    /// Deaktivovaný účet se nepřihlásí.
    member val IsActive = true with get, set

/// Řádek tabulky `projects`. `StateJson` je celý `AppState`.
///
/// `ArchivedAt` je soft delete: archivovaný projekt zmizí ze seznamu, ale
/// data (úkoly, přílohy, KB) zůstávají a jde ho vrátit. Tvrdé smazání je až
/// druhý krok nad archivem.
[<CLIMutable>]
type ProjectRow =
    {
        Id: string
        Name: string
        StateJson: string
        CreatedAt: string
        UpdatedAt: string
        ArchivedAt: string | null
    }

/// Řádek tabulky `project_members`. `Role` je `pm` nebo `dev` (ADR-006).
[<CLIMutable>]
type ProjectMemberRow =
    {
        ProjectId: string
        UserId: string
        Role: string
        JoinedAt: string
    }

/// Řádek tabulky `files` — metadata i BLOB obsahu (ADR-010).
[<CLIMutable>]
type FileRow =
    {
        Id: string
        ProjectId: string
        Name: string
        MimeType: string
        Size: int64
        Data: byte[]
        Note: string
        AddedAt: string
        AddedBy: string
    }

/// Řádek tabulky `ado_credentials`. PAT je šifrovaný (ADR-008), snapshot je
/// sdílený per projekt a může chybět.
[<CLIMutable>]
type AdoCredentialRow =
    {
        ProjectId: string
        UserId: string
        PatEncrypted: string
        SnapshotJson: string | null
        UpdatedAt: string
    }

/// Řádek tabulky `quick_notes` — osobní poznámky uživatele (PRD-04).
[<CLIMutable>]
type QuickNoteRow =
    {
        Id: string
        UserId: string
        Content: string
        LinkedProjectId: string | null
        ConvertedToTaskId: string | null
        CreatedAt: string
        UpdatedAt: string
    }

/// Řádek tabulky `kb_page_revisions` — předchozí znění KB stránky.
///
/// Historie záměrně **není** součástí `state_json`: stav se broadcastuje
/// celé skupině při každém `full_state`, kdežto revize se čtou jen když si
/// je někdo vyžádá. Držet je ve stavu by znamenalo posílat celou historii
/// všem při každém otevření projektu.
[<CLIMutable>]
type KbRevisionRow =
    {
        Id: string
        ProjectId: string
        PageId: string
        Title: string
        Content: string
        SavedAt: string
        SavedBy: string
    }

/// Řádek tabulky `vault_profiles` — parametry odvození klíče trezoru (ADR-016).
///
/// Server tu drží jen to, co potřebuje klient, aby si klíč odvodil sám: sůl,
/// počet iterací a `Verifier`. Heslo k trezoru sem nikdy nedorazí ani jako
/// hash — kdyby ano, celý smysl trezoru padá.
///
/// `Verifier` je konstanta zašifrovaná odvozeným klíčem. Odemčení je pokus
/// o její dešifrování: GCM tag selže při špatném hesle, aniž by se sáhlo na
/// jediný záznam.
[<CLIMutable>]
type VaultProfileRow =
    {
        UserId: string
        /// Název odvozovací funkce (dnes vždy `PBKDF2-SHA256`) — kvůli budoucí výměně.
        Kdf: string
        Iterations: int
        Salt: string
        Verifier: string
        VerifierIv: string
        CreatedAt: string
        UpdatedAt: string
    }

/// Řádek tabulky `vault_entries` — jeden záznam trezoru jako neprůhledný blob.
///
/// `Ciphertext` je AES-256-GCM nad JSONem celého záznamu **včetně názvu**,
/// takže server nezná ani jména položek. Časy zůstávají v plaintextu: řadí se
/// podle nich seznam a šifrovat je by znamenalo stáhnout celý trezor jen kvůli
/// seřazení.
[<CLIMutable>]
type VaultEntryRow =
    {
        Id: string
        UserId: string
        Ciphertext: string
        Iv: string
        CreatedAt: string
        UpdatedAt: string
    }

/// Řádek tabulky `work_log_entries` — jeden vykázaný úsek práce (PRD-10).
///
/// Data jsou striktně per-user (ADR-017): výkaz vidí jen jeho autor, takže
/// vlastnictví se ověřuje u každé operace a cizí záznam se tváří jako
/// neexistující — stejné pravidlo jako u quick notes a trezoru.
///
/// `EndedAt = null` znamená **běžící stopky**. Takový řádek smí mít uživatel
/// nejvýš jeden; invariantu drží repozitář, ne klient.
///
/// `Tags` je JSON pole v jednom sloupci schválně. Server podle tagů nikdy
/// nefiltruje ani neagreguje (dělá to klient nad staženým rozsahem), takže
/// vazební tabulka by nekupovala nic než join navíc.
///
/// `ProjectId` je jen štítek: mazání projektu ho nastaví na `null`, protože
/// odvedená práce se stala i tehdy, když projekt mezitím zmizel.
[<CLIMutable>]
type WorkLogEntryRow =
    {
        Id: string
        UserId: string
        Title: string
        Description: string
        ProjectId: string | null
        /// ISO 8601 UTC. Posílá ho klient, server ho jen validuje (ADR-017).
        StartedAt: string
        /// `null` = běžící činnost.
        EndedAt: string | null
        /// JSON pole řetězců, např. `["pohotovost","víkend"]`.
        Tags: string
        CreatedAt: string
        UpdatedAt: string
    }
