# ADR-004: Command-based protokol přes SignalR

## Status
Přijato

## Kontext

V single-user verzi React frontend přímo mutuje lokální stav (`setState`) a ukládá celý projekt do IndexedDB. V multi-user verzi musí být server autoritativní zdroj pravdy a všichni klienti musí vidět konzistentní stav. Je nutné definovat komunikační protokol mezi klientem a serverem.

Klíčové požadavky:
- Změna jednoho uživatele musí být okamžitě viditelná ostatním
- Zprávy musí být malé (ne celý stav projektu)
- Klient musí vědět, co se změnilo, aby mohl aktualizovat lokální React stav
- Zachovat MVU (Model-View-Update) architekturu — reducer pattern

## Rozhodnutí

**Command-based protokol: klient posílá typované commandy, server broadcastuje typované diffy**

### Klient → Server (Commands)

```typescript
type ProjectCommand =
  // Tasks
  | { type: "add_task"; task: Task }
  | { type: "update_task"; taskId: string; fields: Partial<Task> }
  | { type: "move_task"; taskId: string; s: number; e: number }
  | { type: "update_progress"; taskId: string; progress: number }
  | { type: "delete_task"; taskId: string }
  // People
  | { type: "add_person"; person: Person }
  | { type: "update_person"; personId: string; fields: Partial<Person> }
  | { type: "delete_person"; personId: string }
  | { type: "update_alloc"; personId: string; weekIdx: number; pct: number }
  // Project metadata
  | { type: "update_project"; fields: Partial<Project> }
  | { type: "set_milestones"; milestones: Milestone[] }
  // Risks & Opportunities
  | { type: "add_risk"; risk: Risk }
  | { type: "update_risk"; riskId: string; fields: Partial<Risk> }
  | { type: "delete_risk"; riskId: string }
  | { type: "add_opportunity"; opp: Opportunity }
  | { type: "update_opportunity"; oppId: string; fields: Partial<Opportunity> }
  | { type: "delete_opportunity"; oppId: string }
  // Categories & Roles
  | { type: "set_cats"; cats: Categories }
  | { type: "set_roles"; roles: Roles }
  // KB
  | { type: "add_kb_page"; page: KBPage }
  | { type: "update_kb_page"; pageId: string; fields: Partial<KBPage> }
  | { type: "delete_kb_page"; pageId: string }
  // TODO (per user — server routing)
  | { type: "add_todo"; todo: TodoItem }
  | { type: "update_todo"; todoId: string; fields: Partial<TodoItem> }
  | { type: "delete_todo"; todoId: string }
  | { type: "add_reminder"; reminder: RecurringReminder }
  | { type: "update_reminder"; reminderId: string; fields: Partial<RecurringReminder> }
  | { type: "delete_reminder"; reminderId: string }
  // Session
  | { type: "undo" }
  | { type: "redo" }
```

### Server → Klient (Diffy)

```typescript
type ProjectDiff =
  | { op: "task_added"; task: Task }
  | { op: "task_updated"; taskId: string; fields: Partial<Task> }
  | { op: "task_deleted"; taskId: string }
  | { op: "person_added"; person: Person }
  | { op: "person_updated"; personId: string; fields: Partial<Person> }
  | { op: "person_deleted"; personId: string }
  | { op: "project_updated"; fields: Partial<Project> }
  | { op: "milestones_set"; milestones: Milestone[] }
  | { op: "risk_added"; risk: Risk }
  | { op: "risk_updated"; riskId: string; fields: Partial<Risk> }
  | { op: "risk_deleted"; riskId: string }
  | { op: "opportunity_added"; opp: Opportunity }
  | { op: "opportunity_updated"; oppId: string; fields: Partial<Opportunity> }
  | { op: "opportunity_deleted"; oppId: string }
  | { op: "cats_set"; cats: Categories }
  | { op: "roles_set"; roles: Roles }
  | { op: "kb_page_added"; page: KBPage }
  | { op: "kb_page_updated"; pageId: string; fields: Partial<KBPage> }
  | { op: "kb_page_deleted"; pageId: string }
  | { op: "full_state"; state: AppState }   // pouze při prvním připojení nebo reconnect
  | { op: "error"; message: string; commandType: string }
  | { op: "presence"; users: PresenceEntry[] }  // kdo je online na jakém view
```

### SignalR Hub metody

```
Klient volá:  hub.invoke("SendCommand", command)
Server volá:  hub.on("ReceiveDiff", (diff) => applyDiff(diff))
              hub.on("ReceiveFullState", (state) => resetState(state))
              hub.on("PresenceUpdate", (users) => updatePresence(users))
```

### Optimistická aplikace

Klient aplikuje command lokálně okamžitě (optimisticky), pak čeká na server potvrzení. Pokud server vrátí `error`, klient rollbackne na poslední potvrzený stav (drží `lastConfirmedState` ref).

## Alternativy

### Full state sync (celý AppState při každé změně)
- **Pro:** jednoduché na implementaci
- **Proti:** AppState projektu může mít stovky KB; broadcastovat ho při každém tahu Gantt baru (desítky eventů za sekundu) je zcela neúnosné

### Field-level CRDT (Conflict-free Replicated Data Types)
- **Pro:** offline-first, žádné konflikty, matematicky garantovaná konvergence
- **Proti:** CRDT implementace pro všechny typy dat (ordered lists, maps, text) jsou velmi komplexní; pro 15 uživatelů a interní nástroj je CRDT přepálené řešení

### Operational Transform (OT)
- **Pro:** používají Google Docs, Figma — ověřené pro real-time kolaboraci
- **Proti:** implementace OT je extrémně složitá, zejména pro non-text data (Gantt bary, matice alokací); vyžaduje centrální OT server

## Důsledky

**Pozitivní:**
- Server actor zpracovává commandy sekvenčně → deterministický výsledek bez race conditions
- Diffy jsou malé → minimální síťový provoz i při intenzivní práci
- Klient-side reducér (`applyDiff`) je čistá funkce — snadno testovatelné
- Zachovává MVU pattern: command → state → diff → broadcast

**Negativní:**
- Typová synchronizace mezi F# (ServerCommand) a TypeScript (ProjectCommand) musí být udržována ručně nebo generována; při přidání nového command typu hrozí desynchronizace
- Optimistická aplikace vyžaduje `lastConfirmedState` mechanismus pro rollback — přidává komplexitu do klienta

**Implementační poznámky:**
- TODO a Reminders commandy jsou routovány přes ProjectActor, ale ukládány per-user — actor deleguje na UserService
- `undo`/`redo` commandy jsou interpretovány serverem per-session: server si pamatuje poslední N commandů daného uživatele a aplikuje reverzní operaci

## Doplněk — mezery zjištěné při implementaci

Seznamy výše jsou závazné, ale při stavbě obou stran se ukázalo, že **nejsou úplné**: několik commandů a diffů vyžadovaných PRD a ostatními ADR v nich chybí. Doplňujeme je zde, aby obě strany stavěly proti témuž kontraktu. Rozhodnutí ADR se tím nemění, jen se dopisuje, co v původním seznamu vypadlo.

### Chybějící commandy

| Command | Zdroj požadavku |
|---|---|
| `{ type: "update_presence"; view: string }` | PRD-02, FR-COLLAB-04 |
| `{ type: "full_state_import"; state: AppState }` | ADR-005, „Důsledky" — import parsuje klient, výsledek posílá jako jeden command |
| `{ type: "ado_save_config"; config: ADOConfig }` | PRD-06, FR-ADO-01 |
| `{ type: "ado_save_pat"; pat: string }` / `{ type: "ado_delete_pat" }` | ADR-008, PRD-06 FR-ADO-02 |
| `{ type: "ado_test_connection" }` | PRD-06, FR-ADO-03 |
| `{ type: "ado_run_sync" }` | PRD-06, FR-ADO-04 |

### Chybějící diffy

| Diff | Zdroj požadavku |
|---|---|
| `{ op: "todo_added" \| "todo_updated" \| "todo_deleted"; … }` | protějšky `add_todo`/`update_todo`/`delete_todo` |
| `{ op: "reminder_added" \| "reminder_updated" \| "reminder_deleted"; … }` | protějšky reminder commandů |
| `{ op: "file_added"; file: FileRef }`, `{ op: "file_updated"; fileId; fields }`, `{ op: "file_deleted"; fileId }` | ADR-010 (upload flow, krok 4) |
| `{ op: "role_changed"; newRole: "pm" \| "dev" }` | PRD-03, FR-ROLE-06 |
| `{ op: "ado_config_updated"; config: ADOConfig; patSet: bool; patUpdatedAt }` | PRD-06, FR-ADO-02 — PAT se **nikdy** nevrací, jen jeho stav |
| `{ op: "ado_sync_progress"; phase: string; done: int; total: int }` | PRD-06, FR-ADO-04 („Stahuji work items… (42/87)") |
| `{ op: "ado_sync_completed"; changes: WIChange[]; gaps: …; log: ADOSyncLogEntry[] }` | PRD-06, FR-ADO-04/05/09 |

### Routing diffů — ne všechno je broadcast

Původní text říká, že diff jde „všem uživatelům ve skupině". To neplatí pro per-user data:

| Diff | Doručení |
|---|---|
| `todo_*`, `reminder_*` | **pouze spojení odesílatele.** TODO a Reminders jsou per-user (viz Implementační poznámky výše) — broadcast by je vyzradil ostatním členům projektu. |
| `role_changed` | pouze spojení dotčeného uživatele |
| `error` | pouze spojení odesílatele commandu |
| `ado_sync_progress` | pouze spojení uživatele, který sync spustil |
| ostatní | broadcast celé skupině `project:{projectId}` |

Důsledek: per-user diffy existují proto, aby klient dostal serverové potvrzení a mohl při chybě rollbacknout — ne kvůli sdílení.

### Presence není součástí `AppState`

`presence` je v seznamu diffů, ale `AppState` presence nemodeluje a modelovat nemá: je to efemérní stav spojení, ne data projektu. Kdyby v `AppState` byl, protekl by do undo/redo bufferu i do persistovaného `state_json`.

Klient ho proto drží mimo — ve stavu `useProjectChannel`. `applyDiff` na `presence` vrací stav nezměněný. Totéž platí pro `error` a `ado_sync_progress`.

### Tvar `full_state`

`full_state.state` je `AppState` s **přesně** těmito poli (pořadí nerozhoduje, přítomnost ano):

```
project, people, tasks, cats, roles, risks, opps,
reminders, todos, kbPages, files, adoConfig, adoSyncLog
```

Oproti `AppState` v `src/client/App.tsx` přibývá `files` — po ADR-010 jsou to pouze `FileRef` metadata bez `data`, takže už není důvod držet je mimo hlavní stav. Klient je nadále vynechává z undo/redo historie.

### TODO a připomínky jsou soukromé — projekce stavu per uživatel

`todo-reminders.feature` má scénář **„TODO jsou soukromé per-user"**: `jan.novak` nesmí vidět TODO, které si založila `petra.kolarova`. Kdyby `todos`/`reminders` byly v `AppState` plochý seznam, `full_state` by cizí TODO rozeslal všem členům projektu.

**Rozhodnutí:** serverový `AppState` je drží klíčované uživatelem:

```fsharp
TodosByUser     : Map<string, TodoItem list>
RemindersByUser : Map<string, RecurringReminder list>
```

Stav odchází ke klientovi **výhradně** přes projekci `AppState.forUser : userId -> ClientAppState`, která z těchto map vybere jen záznamy volajícího a zploští je na `todos` / `reminders`. Klientský tvar se tím nemění — frontend vidí jako dosud ploché seznamy vlastních položek.

Proč projekce, a ne samostatná tabulka: ADR-002 dává actorovi jeden stav a jednu cestu persistence (`projects.state_json`). Druhá tabulka by znamenala druhý persistenční kanál a rozdvojený životní cyklus. Cena je, že soukromí závisí na jednom místě v kódu — proto je `forUser` **jediná** povolená serializační cesta ke klientovi a scénář „TODO jsou soukromé per-user" je na ni navázaný test.

### `undo` / `redo` server odmítá

ADR-007 (novější a konkrétnější) rozhodl, že undo řeší klient: pošle inverzní command, který projde standardní cestou. Serverová interpretace `undo`/`redo` z „Implementačních poznámek" výše se tedy **neimplementuje** — actor tyto commandy odmítne chybou. V protokolu zůstávají jen jako rezervovaná jména.

### Hub metody — úplný seznam

Sekce „SignalR Hub metody" výše vynechává, jak se klient do skupiny projektu vůbec dostane a jak si vyžádá stav po reconnectu. Doplňujeme:

| Směr | Metoda | Význam |
|---|---|---|
| klient → server | `JoinProject(projectId)` | ověří členství, přidá spojení do `project:{projectId}`, odpoví `full_state` |
| klient → server | `LeaveProject(projectId)` | opustí skupinu, odebere z presence (FR-COLLAB-08) |
| klient → server | `SendCommand(projectId, command)` | |
| klient → server | `GetFullState(projectId)` | vyžádání čerstvého stavu po reconnectu (FR-COLLAB-06) |
| server → klient | `ReceiveDiff`, `ReceiveFullState`, `PresenceUpdate` | |

**Proč explicitní `JoinProject`, a ne `projectId` v query stringu spojení:** query string váže projekt na životnost spojení, takže přepnutí projektu si vynutí reconnect. Explicitní join/leave navíc přímo odpovídá FR-COLLAB-08 („klient opustí SignalR skupinu") a dává serveru jasné místo pro kontrolu členství.

### Stav mimo `AppState` — shrnutí

Kromě `presence` (viz výše) do `AppState` nepatří ani:

| Diff | Kam patří |
|---|---|
| `role_changed` | role je součást session kontextu uživatele, ne dat projektu |
| `ado_config_updated` — pole `patSet`, `patUpdatedAt` | stav PAT je **per-user**, kdežto `adoConfig` je sdílený; do `AppState.adoConfig` se promítá jen `config` |
| `ado_sync_progress` | průběh běžící operace, ne stav |
| `error` | |

`applyDiff` je pro tyto případy identita; konzumuje je příslušný hook.

### Další doplněné commandy a diffy

Nad rámec tabulek výše ještě:

| Command | Důvod |
|---|---|
| `update_milestone_checklist` | FR-ROLE-01 dává Dev R/W na položky checklistu, ale `set_milestones` je PM-only — bez samostatného commandu nelze obojí splnit zároveň |
| `add_file`, `update_file_note`, `delete_file` | upload flow z ADR-010 |

| Diff | Důvod |
|---|---|
| `alloc_updated` | `update_alloc` neměl v původním seznamu protějšek |
| `milestone_checklist_updated` | protějšek `update_milestone_checklist` |
| `ado_pat_saved`, `ado_sync_log_appended` | PRD-06, FR-ADO-02 a FR-ADO-10 |

### Změna datumů projektu přepočítává stav na serveru

`update_project` se změnou `startDate`/`endDate` musí — stejně jako dnes `changeDates` v `App.tsx` — oříznout `s`/`e` úkolů do nového rozsahu a změnit délku `weekAlloc` u osob. Autoritativní stav vlastní server, takže tuhle mutaci provádí actor a rozešle ji jako diffy.

Není to spor s ADR-005: na klientovi zůstává **výpočet** `Week[]` včetně českých svátků a pracovních dnů (pro zobrazení), server potřebuje jen **počet** týdnů mezi dvěma daty, což je aritmetika nad kalendářem bez znalosti svátků.
