# PRD-00: Přehled systému — migrace na multi-user

## Přehled

MSProjectManager je nástroj pro správu projektů a kapacit projektového týmu. Současná verze funguje jako čistě lokální single-user aplikace (React SPA + IndexedDB, žádný server). Tato sada PRD dokumentuje přepis na multi-user kolaborativní nástroj se serverovým backendem.

Aplikace je určena pro projektové týmy do 15 lidí v korporátním prostředí. Bude hostována jako Windows Service na Windows VM (self-hosted, intranet).

## Cíle

1. **Multi-user real-time kolaborace** — více členů týmu může pracovat v aplikaci současně a vidět navzájem své změny v reálném čase
2. **Zachování MVU architektury** — model-view-update pattern s immutable state a command-based mutacemi se zachovává na serveru i klientovi
3. **Role-based access control** — Project Manager má plný přístup; Developer má přístup k vlastním úkolům, kapacitě a osobním nástrojům
4. **Offline schopnost** — aplikace je použitelná při výpadku sítě; změny se synchronizují při obnovení spojení
5. **Quick Notes** — nová funkcionalita per-user poznámek přístupná vždy z headeru
6. **Autentizace** — lokální username/heslo auth, bez veřejné registrace

## Non-goals (první verze)

- Mobilní aplikace
- Veřejný přístup (internet-facing deployment)
- Více než 15 souběžných uživatelů
- SSO / OAuth / LDAP integrace
- Notification systém (email, push)
- Audit log nad rámec ADO sync logu
- Multi-tenant (více organizací v jedné instanci)
- Verzování stavu projektu (git-like history) — **výjimkou jsou KB stránky**, které historii verzí mají; jde o dokumentaci, ne o stav projektu

## Uživatelé a role

| Role | Popis |
|---|---|
| **Admin** | První uživatel systému; může vytvářet uživatelské účty a spravovat přístup. Nemá speciální projekt-level oprávnění nad rámec PM. |
| **Project Manager (PM)** | Člen projektu s rolí `pm`; plný R/W přístup ke všem funkcím projektu včetně ADO Sync konfigurace a správy členů |
| **Developer (Dev)** | Člen projektu s rolí `dev`; R/W přístup k vlastním úkolům, vlastní alokaci, vlastním TODO/Reminders, KB stránkám a Quick Notes; READ ONLY zbytek |

## Tech stack

| Komponenta | Technologie |
|---|---|
| Frontend | React 18 + TypeScript (zachován, přepisuje persistence vrstvu) |
| Backend | F# + ASP.NET Core (.NET 10 LTS) |
| Real-time | SignalR (WebSocket) |
| Autentizace | ASP.NET Core Identity + cookie-based auth |
| Databáze | SQLite s WAL módem |
| Hosting | Windows Service (IHostedService) na Windows VM |
| Soubory | BLOB v SQLite |

## Fáze implementace

### Fáze 0 — Nastavení projektů a statické analýzy
**Cíl:** Kvalitativní mantinely stojí dřív, než vznikne první řádek serverového kódu

- [x] Biome (TS lint + formátovač) — `biome.json`, limity dle ADR-012
- [x] FSharpLint — `fsharplint.json` odvozený z úplného defaultu
- [x] Fantomas — konfigurace v `.editorconfig`
- [x] `Directory.Build.props` — warnings as errors, `--warnon:1182/3390/3517`
- [x] `.config/dotnet-tools.json` — Fantomas 7.0.5, FSharpLint 0.27.0
- [x] `./build/build.sh lint` a `format`
- [x] Založení `src/server/MSProjectManager.Server` (`net10.0`, F#) + `MSProjectManager.Server.Tests`, solution `MSProjectManager.slnx`
- [x] `./build/build.sh test` — Vitest (frontend) + `dotnet test` (backend)

Detaily a zdůvodnění: [ADR-012](../adr/ADR-012-code-quality-tooling.md).
Dluh na existujícím frontendu se splácí až v [PRD-07](PRD-07-frontend-code-quality.md).

### Fáze 1 — Backend foundation
**Cíl:** Funkční server bez změn na frontendu

- [x] ASP.NET Core projekt s F# jako primárním jazykem
- [x] Windows Service hosting setup
- [x] SQLite databáze s EF Core migracemi (Identity tabulky + custom tabulky)
- [x] ASP.NET Core Identity — login, logout, cookie auth
- [x] `ProjectActor` (MailboxProcessor) + `ProjectActorRegistry`
- [x] SignalR Hub (`ProjectHub`) — echo server (command in → broadcast out)
- [x] REST API: `POST /auth/login`, `POST /auth/logout`, `GET /projects`, `POST /projects`, `DELETE /projects/{id}`
- [x] REST API: `GET /api/files/{id}`, `POST /api/projects/{id}/files`

### Fáze 2 — Frontend napojení
**Cíl:** Frontend přestane používat IndexedDB pro projekt stav, napojí se na SignalR

- [x] Odstranění `useAutoSave` hooku
- [x] Implementace `useProjectChannel` hooku (SignalR connection management)
- [x] Přepis všech `setX(...)` volání na `channel.push("cmd", command)`
- [x] `applyDiff` funkce — aplikuje server diff na lokální React stav
- [x] LandingPage napojení na REST API (seznam projektů z DB)
- [x] Auth UI — login stránka, logout tlačítko v headeru
- [x] Full state load při otevření projektu (nahrazuje load z IndexedDB)

### Fáze 3 — Role + správa členů
**Cíl:** Role systém funkční, PM může spravovat členy projektu

- [x] Permission matrix enforcement v `ProjectActor`
- [x] UI `PermissionGate` komponenta (disable/hide prvků bez oprávnění)
- [x] Správa členů projektu v Project view (PM only)
- [x] Správa uživatelských účtů (Admin only) — přidat/deaktivovat uživatele

### Fáze 4 — Quick Notes
**Cíl:** Nová per-user funkcionalita

- [x] Quick Notes panel v Header (floating, nezávislý na view)
- [x] CRUD pro quick notes (markdown, link na projekt, konverze na úkol)
- [x] REST API pro quick notes (**ne** SignalR — poznámky jsou per-user, viz PRD-04 „Out of scope")

### Fáze 5 — Offline podpora
**Cíl:** Aplikace je použitelná při výpadku sítě

- [x] Offline detekce (navigator.onLine + SignalR events)
- [x] Command queue v IndexedDB
- [x] State cache v IndexedDB při načtení projektu
- [x] Reconnect replay logika
- [x] Conflict resolution UI

### Fáze 6 — Refaktoring frontendu
**Cíl:** Splacení dluhu na kvalitě kódu, přepnutí lint pravidel na `error`

Viz [PRD-07](PRD-07-frontend-code-quality.md). Záměrně poslední — Fáze 2 a 3 většinu dotčených souborů přepisují.

- [x] Formátovací commit (Biome)
- [x] Korektnostní nálezy (`useExhaustiveDependencies`, `noArrayIndexKey`)
- [x] Přístupnost (168 → 0)
- [x] Dekompozice velkých komponent (338 → 0 nálezů)
- [x] Přepnutí lint pravidel na `error`

**Výjimka k vytažení dopředu:** sanitizace HTML z markdownu (`dangerouslySetInnerHTML`, 5 výskytů) patří do **Fáze 2**. V multi-user prostředí se z ní stává stored XSS — cizí obsah se renderuje v prohlížeči ostatních uživatelů včetně PM.

## Datový model (DB schéma)

```sql
-- Identity (automaticky generováno):
-- AspNetUsers (+ DisplayName: TEXT), AspNetUserClaims, AspNetUserLogins,
-- AspNetUserTokens, AspNetRoles, AspNetUserRoles, AspNetRoleClaims

-- Custom tabulky:
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    state_json TEXT NOT NULL,   -- celý AppState jako JSON
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT            -- soft delete; smazat lze jen archivovaný projekt
);

-- Historie KB stránek. Mimo state_json schválně: stav se broadcastuje při
-- každém full_state, revize se čtou jen na vyžádání.
CREATE TABLE kb_page_revisions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    page_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    saved_at TEXT NOT NULL,
    saved_by TEXT NOT NULL
);

CREATE TABLE project_members (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES AspNetUsers(Id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('pm', 'dev')),
    joined_at TEXT NOT NULL,
    PRIMARY KEY (project_id, user_id)
);

CREATE TABLE files (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    data BLOB NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    added_at TEXT NOT NULL,
    added_by TEXT NOT NULL REFERENCES AspNetUsers(Id)
);

CREATE TABLE ado_credentials (
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES AspNetUsers(Id) ON DELETE CASCADE,
    pat_encrypted TEXT NOT NULL,
    snapshot_json TEXT,         -- ADO snapshot per projekt (sdílený)
    updated_at TEXT NOT NULL,
    PRIMARY KEY (project_id, user_id)
);

CREATE TABLE quick_notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES AspNetUsers(Id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    linked_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    converted_to_task_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

## Build a nasazení

Detaily a zdůvodnění viz [ADR-011](../adr/ADR-011-frontend-build-deployment.md).

### Build

Oba stacky se buildují v kontejnerech přes podman — lokálně není potřeba Node.js ani .NET SDK:

| Příkaz | Co dělá |
|---|---|
| `./build/build.sh web` | Build frontendu + kopie `dist/` → `src/server/MSProjectManager.Server/wwwroot/` |
| `./build/build.sh server` | `dotnet build -c Release` |
| `./build/build.sh all` | Obojí |
| `./build/build.sh publish` | Frontend + `win-x64` publish do `publish/` pro Windows VM |
| `./build/build.sh clean` | Smaže `dist/`, `wwwroot/` artefakty a build volumes |

Závislosti (`node_modules`, NuGet cache) žijí v pojmenovaných podman volumes mimo repozitář.

### Servírování frontendu

Frontend je statický build servírovaný ASP.NET Corem z `wwwroot`. `vite-plugin-singlefile` byl zrušen — build produkuje `index.html` + `assets/` s hashovanými názvy.

**Cache hlavičky** (implementuje se ve `Startup`/`Program`):

| Soubor | `Cache-Control` |
|---|---|
| `index.html` | `no-cache, no-store, must-revalidate` |
| `assets/*` | `public, max-age=31536000, immutable` |

SPA routing: `app.MapFallbackToFile("index.html")` — všechny nesouborové cesty vrací `index.html`.

`wwwroot` je vlastněný buildem a patří do `.gitignore`.

### Nasazení na Windows VM

1. `./build/build.sh publish`
2. Zkopírovat `publish/` na VM
3. Registrovat jako službu: `sc.exe create MSProjectManager binPath="...\MSProjectManager.Server.exe"`

#### Zapisovatelná data

Služba zapisuje do dvou podsložek vedle sebe. Relativní cesty se rozhodují
proti složce, ze které služba běží (`ContentRootPath`) — **ne** proti
aktuálnímu adresáři procesu, protože Windows Service startuje s
`CurrentDirectory` v `C:\Windows\System32`.

| Cesta | Klíč v `appsettings.json` | Obsah |
|---|---|---|
| `data/` | `Database:Path` | SQLite databáze (+ `-wal`, `-shm`) |
| `keys/` | `DataProtection:KeysPath` | key ring, kterým se šifrují ADO PATy |

Zapisovatelná musí být celá složka, ne jen soubor — WAL zakládá sourozence.

**Pokud instalace leží pod `Program Files`**, kam účet služby zapisovat nesmí,
nastavit obě cesty absolutně do `%ProgramData%\MSProjectManager\`.

**Zálohovat je potřeba obojí.** Bez key ringu jsou uložené PATy po obnově
nedešifrovatelné. Zároveň platí, že key ring je svázaný se strojem (DPAPI
local-machine), takže obnova na jiné VM PATy stejně nerozšifruje a uživatelé
je zadají znovu — vědomá volba, viz [ADR-008](../adr/ADR-008-ado-proxy.md),
doplněk.

#### Před spuštěním do provozu

- `AllowedHosts` nastavit z `"*"` na hostname VM.
- `Auth:RequireHttps` nechat na `true`; server pak zapíná HSTS
  a přesměrování na HTTPS.

## Non-funkcionální požadavky

- Latence commandu → broadcast: < 100ms za standardních podmínek (lokální síť)
- Maximálně 15 souběžných uživatelů
- SQLite WAL mód, PRAGMA synchronous = NORMAL
- Soubory: max 25 MB per soubor, max 500 MB celkem per projekt (monitoring)
- Cookie session: 8 hodin sliding expiry (konfigurovatelné), `HttpOnly`, `SameSite=Strict`
- ADO PAT šifrování: ASP.NET Core Data Protection API; key ring na disku, chráněný DPAPI (local machine)
- Bezpečnostní hlavičky na každé odpovědi: CSP, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`
- Přílohy se servírují `inline` jen u rastrových obrázků a PDF; zbytek vždy jako `attachment`
- Projekt musí mít vždy alespoň jednoho přihlásitelného PM — hlídá to odebrání člena, změna role i deaktivace účtu
- Projekty se archivují; trvale smazat lze jen archivovaný projekt
- Historie KB stránek: 50 verzí na stránku, zapisuje se před každou změnou i smazáním
- Offline fungují i Quick Notes (vlastní IndexedDB fronta); online-only zůstávají jen přílohy a import projektu
- Initial load frontendu: < 400 kB gzip; opakované načtení po změně aplikačního kódu < 60 kB gzip (zbytek z cache)
- Build musí být proveditelný bez lokálně instalovaného Node.js a .NET SDK
