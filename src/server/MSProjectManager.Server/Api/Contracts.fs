/// Tvary REST požadavků a odpovědí.
///
/// Záznamy jsou `CLIMutable`, aby je uměl navázat `System.Text.Json`; na wire
/// jsou camelCase, stejně jako zbytek protokolu.
module MSProjectManager.Api.Contracts

open MSProjectManager.Domain.Types
open MSProjectManager.Domain.State

// ── Autentizace ─────────────────────────────────────────────────────────────

[<CLIMutable>]
type LoginRequest = { UserName: string; Password: string }

[<CLIMutable>]
type SetupRequest =
    {
        UserName: string
        DisplayName: string
        Password: string
    }

/// Samoobslužná registrace (FR-AUTH-08). Tvar odpovídá `SetupRequest`, ale
/// je to vědomě vlastní typ: setup zakládá **admina** do prázdné databáze,
/// registrace běžný účet do rozběhnutého systému. Sloučit je by znamenalo, že
/// změna jednoho tiše mění i to druhé.
[<CLIMutable>]
type RegisterRequest =
    {
        UserName: string
        DisplayName: string
        Password: string
    }

[<CLIMutable>]
type ChangePasswordRequest =
    {
        CurrentPassword: string
        NewPassword: string
    }

/// Přihlášený uživatel tak, jak ho zobrazuje Header.
type CurrentUser =
    {
        UserId: string
        UserName: string
        DisplayName: string
        IsAdmin: bool
    }

/// Chyba API — klient zobrazí `message` jako toast nebo inline hlášku.
type ApiError = { Message: string }

// ── Správa uživatelů ────────────────────────────────────────────────────────

[<CLIMutable>]
type CreateUserRequest =
    {
        UserName: string
        DisplayName: string
        Password: string
    }

[<CLIMutable>]
type ResetPasswordRequest = { NewPassword: string }

type UserSummary =
    {
        Id: string
        UserName: string
        DisplayName: string
        IsActive: bool
        IsAdmin: bool
        /// Projekty, kde má deaktivovaný účet přiřazenou osobu s úkoly.
        ///
        /// Upozornění, ne zákaz: lidé z týmu odcházejí a jejich účty se musí
        /// dát zavřít. Bez téhle informace ale admin netuší, že po sobě nechal
        /// v plánu úkoly na někom, kdo se už nepřihlásí — a PM se to dozví, až
        /// když se nic neděje. Prázdné u aktivních účtů.
        OrphanedIn: string list
    }

/// Uživatel nabídnutý PM k přidání do projektu (FR-ROLE-02). Záměrně chudší
/// než `UserSummary` — PM nemá důvod znát stav ani admin příznak cizích účtů.
type MemberCandidate = { UserId: string; DisplayName: string }

// ── Projekty a členové ──────────────────────────────────────────────────────

[<CLIMutable>]
type CreateProjectRequest = { Name: string }

type ProjectSummaryResponse =
    {
        Id: string
        Name: string
        Role: ProjectRole
        UpdatedAt: string
        /// Chybí u aktivních projektů; archiv se v UI zobrazuje zvlášť.
        ArchivedAt: string option
    }

/// Jedna verze KB stránky pro dialog „Historie".
type KbRevisionResponse =
    {
        Id: string
        Title: string
        Content: string
        SavedAt: string
        SavedBy: string
    }

[<CLIMutable>]
type AddMemberRequest = { UserId: string; Role: string }

[<CLIMutable>]
type ChangeMemberRoleRequest = { Role: string }

type MemberResponse =
    {
        UserId: string
        DisplayName: string
        Role: ProjectRole
        JoinedAt: string
    }

// ── Soubory ─────────────────────────────────────────────────────────────────

/// Odpověď uploadu — metadata bez obsahu (ADR-010).
type FileResponse = { File: FileRef; TotalSize: int64 }

// ── Quick notes ─────────────────────────────────────────────────────────────

[<CLIMutable>]
/// `Id` posílá klient, aby poznámka vytvořená offline měla identitu ještě
/// před dohráním — následné úpravy a smazání se pak mají čeho chytit
/// (offline.feature). Chybějící `Id` znamená „vygeneruj si ho, serveru".
type CreateNoteRequest =
    {
        Id: string | null
        Content: string
        LinkedProjectId: string | null
    }

[<CLIMutable>]
type UpdateNoteRequest =
    {
        Content: string
        LinkedProjectId: string | null
        ConvertedToTaskId: string | null
    }

type NoteResponse =
    {
        Id: string
        Content: string
        LinkedProjectId: string | null
        ConvertedToTaskId: string | null
        CreatedAt: string
        UpdatedAt: string
    }

// ── Přehled napříč projekty (PRD-08) ────────────────────────────────────────

/// Jeden můj úkol, ať leží v kterémkoli projektu.
///
/// Rozsah je v **kalendářních datech**, ne v číslech týdnů: `Task.S`/`E` jsou
/// 1-based indexy do časové osy *svého* projektu (ADR-014), takže W5 v jednom
/// projektu je jiný týden než W5 v druhém. Převod dělá server (`Weeks.weekStartIso`),
/// aby ho každý konzument nedělal po svém — přesně tomu se ADR-014 vyhýbá.
type MyTaskResponse =
    {
        ProjectId: string
        ProjectName: string
        TaskId: string
        Name: string
        Cat: string
        Md: float
        Progress: int
        /// Pondělí prvního týdne úkolu; `None` u projektu bez platných datumů.
        FromIso: string option
        /// Pátek posledního týdne úkolu.
        ToIso: string option
    }

/// Odpověď `GET /api/me/workload`.
///
/// Kapacita se schválně neposílá: závisí na českých svátcích a pracovních
/// dnech, což je klientský výpočet (ADR-005, `utils/dates.ts`). Server posílá
/// fakta (co, kdy, kolik MD), klient je porovná s dostupností.
type WorkloadResponse =
    {
        /// Zpoždění projekce v sekundách — kolik může být přehled pozadu.
        StaleAfterSeconds: int
        Tasks: MyTaskResponse list
    }

// ── Trezor hesel (PRD-09, ADR-016) ──────────────────────────────────────────

/// Parametry odvození klíče. Server je jen ukládá a vrací — heslo k trezoru
/// ani odvozený klíč sem nikdy nedorazí.
[<CLIMutable>]
type CreateVaultRequest =
    {
        Kdf: string
        Iterations: int
        Salt: string
        Verifier: string
        VerifierIv: string
    }

/// Stav trezoru pro klienta. `Exists = false` znamená „ještě není založený",
/// a pak jsou ostatní pole prázdná.
type VaultProfileResponse =
    {
        Exists: bool
        Kdf: string
        Iterations: int
        Salt: string
        Verifier: string
        VerifierIv: string
    }

/// Zašifrovaný záznam. `Id` volí klient, stejně jako u quick notes.
[<CLIMutable>]
type VaultEntryRequest =
    {
        Id: string | null
        Ciphertext: string
        Iv: string
    }

type VaultEntryResponse =
    {
        Id: string
        Ciphertext: string
        Iv: string
        CreatedAt: string
        UpdatedAt: string
    }

/// Změna hesla trezoru — nový profil plus všechny přešifrované záznamy
/// v jednom požadavku, protože se musí zapsat atomicky (ADR-016).
[<CLIMutable>]
type RekeyVaultRequest =
    {
        Kdf: string
        Iterations: int
        Salt: string
        Verifier: string
        VerifierIv: string
        Entries: VaultEntryRequest[] | null
    }
