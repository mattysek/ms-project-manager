# PRD-06: Azure DevOps Sync

## Přehled

ADO Sync umožňuje synchronizaci úkolů v plánovači s Work Items v Azure DevOps. Synchronizace je bidirectionální (ADO → Planner i Planner → ADO). V multi-user verzi jsou volání ADO API proxovány přes server; PAT je uložen encrypted na serveru a nikdy neopustí backend.

## Cíle

- PM může synchronizovat stav projektu s ADO Work Items
- PAT nikdy není vystaven v browseru
- Coverage gap — přehled WI v ADO bez linku v plánovači
- Audit log synchronizačních akcí

## Non-goals

- Dev uživatelé nemohou konfigurovat ani spouštět ADO Sync
- Automatická (scheduled) synchronizace — vždy manuálně spuštěná
- Podpora více ADO organizací per projekt
- Synchronizace Epic / Feature hierarchie

## Uživatelé a role

| Aktér | Přístup |
|---|---|
| **PM** | Plná konfigurace, spouštění syncu, čtení logu |
| **Dev** | Pouze čtení sync logu |
| **Server (AdoApiClient)** | Provádí HTTP volání na ADO s PAT |

## Funkcionální požadavky

### FR-ADO-01: Konfigurace připojení (PM only)
- Pole konfigurace:
  - `orgUrl` — URL ADO organizace (např. `https://dev.azure.com/moje-org`)
  - `project` — název ADO projektu
  - `areaPath` — cesta pro Coverage gap (např. `NPEZ\RP04`)
  - `trackedWiTypes` — typy WI pro Coverage gap (multiselect: Bug, Task, Product Backlog Item, User Story…)
  - `defaultPushWiType` — typ WI pro push z plánovače (např. `Product Backlog Item`)
  - `defaultIteration` — výchozí iterace při push (např. `NPEZ\Sprint 42`)
  - `mdToHoursCoefficient` — konverzní koeficient: 1 MD = X hodin (default 8)
  - `memberMapping` — seznam mapování: planner Person → ADO identity email
- Konfigurace se uloží přes command `{ type: "ado_save_config", config: ADOConfig }`
- Pro Dev uživatele je celá sekce konfigurace skryta

### FR-ADO-02: PAT Management (PM only)
- Samostatné pole pro PAT (oddělené od ostatní konfigurace)
- PAT se pošle přes command `{ type: "ado_save_pat", pat: "..." }` → server uloží encrypted
- Klient nikdy nedostane PAT zpět — při načtení konfigurace server vrátí pouze `{ patSet: true, patUpdatedAt: "..." }`
- Tlačítko "Smazat PAT" vymaže PAT z DB
- PAT je per-user per-projekt — každý PM má vlastní PAT

### FR-ADO-03: Ověření připojení
- Tlačítko "Ověřit připojení" — server zkusí jednoduchý API call na ADO s uloženým PAT
- Výsledek: "Připojení úspěšné — připojeno jako [jméno uživatele v ADO]" nebo chybová zpráva
- Výsledek se zobrazí inline, nikoli jako popup

### FR-ADO-04: Spuštění synchronizace
- Tlačítko "Synchronizovat" spustí sync přes command `{ type: "ado_run_sync" }`
- Server provede:
  1. Načtení PAT z DB
  2. Fetch všech WI z ADO (podle mapovaných ID z task links)
  3. Porovnání se snapshotu (baseline z posledního syncu)
  4. Detekce změn
  5. Uložení nového snapshotu
  6. Broadcast výsledků přes SignalR diff
- UI zobrazuje průběh: "Stahuji work items… (42/87)", "Porovnávám změny…", "Hotovo"

### FR-ADO-05: Detekované změny (ADO → Planner)
Server detekuje tyto typy změn:

| Typ změny | Popis | Závažnost |
|---|---|---|
| `state_regression` | WI přešel zpět do In Progress nebo New | high |
| `new_bug_child` | WI má nového child Bug | high |
| `remaining_increase` | Remaining Work se zvýšilo | medium |
| `remaining_decrease` | Remaining Work se snížilo | info |
| `state_resolved` | WI byl uzavřen/resolved | info |
| `assignee_change` | Přiřazená osoba v ADO se změnila | medium |
| `description_change` | Popis WI se změnil v ADO | sync |

Pro každou změnu UI zobrazuje: WI ID + název, typ změny, starou a novou hodnotu, dostupné akce.

### FR-ADO-06: Akce na detekované změny (ADO → Planner)
- **Přijmout state z ADO** — aktualizuje progress úkolu dle stavu WI
- **Přijmout assignee z ADO** — aktualizuje přiřazenou osobu úkolu
- **Přijmout popis z ADO** — přepíše popis úkolu popisem z WI (po potvrzení diffu)
- **Potvrdit (Acknowledge)** — zaznamená změnu jako "viděno", skryje ze seznamu
- **Ignorovat** — označí změnu jako ignorovanou (nezobrazuje se znovu do další sync)

### FR-ADO-07: Detekované změny (Planner → ADO)
- `planner_assignment_differs` — osoba na úkolu v plánovači se liší od AssignedTo v ADO
- `planner_completed_not_ado` — úkol je na 100%, ale WI není resolved

Akce:
- **Push state do ADO** — změní stav WI na resolved
- **Push assignee do ADO** — změní AssignedTo v ADO dle plánovače
- **Push popis do ADO** — přepíše popis WI popisem úkolu
- **Merge popisů (obousměrně)** — zobrazí diff editor, uživatel může upravit výsledný text

### FR-ADO-08: Push úkolu do ADO (Planner → ADO)
- Pro úkoly bez ADO linku: tlačítko "Přidat do ADO"
- Dialog s předvyplněnými poli: WI typ, název, popis, Area Path, Iterace, Assignee, Remaining Work (MD × koeficient)
- Server vytvoří nový WI v ADO, vrátí WI ID
- Server přidá link do úkolu: `{ label: "WI #1234", url: "https://dev.azure.com/..." }`

### FR-ADO-09: Coverage Gap
- Přehled WI v ADO (dle `areaPath` + `trackedWiTypes`) které nemají odpovídající link v žádném úkolu plánovače
- Akce na každý gap WI:
  - **Přidat do plánu** — dialog pro vytvoření nového úkolu z WI dat
  - **Ignorovat** — WI se nezobrazí znovu (persistováno v snapshotu)

### FR-ADO-10: Sync Log
- Každá sync akce vytvoří záznam v `adoSyncLog`:
  - `timestamp`, `action` (typ akce), `taskId`, `taskName`, `wiId`, `wiTitle`, `details`
- Log je viditelný všem členům projektu (PM i Dev)
- Log je seřazen sestupně dle data; zobrazuje posledních 100 záznamů
- Log je exportovatelný jako CSV (PM only)

## Non-funkcionální požadavky

- PAT šifrování: ASP.NET Core Data Protection API (AES-256)
- Fetch work items: max 200 WI per sync (stránkování pro větší projekty)
- Timeout ADO API volání: 30 sekund
- ADO Sync je spouštěn asynchronně — neblokuje ProjectActor mailbox
- Sync progress je broadcastován průběžně přes SignalR

## Out of scope

- Automatická synchronizace (cron job)
- Synchronizace hierarchie (Epic, Feature)
- Více ADO organizací per projekt
- ADO Boards integrace (sprint planning)
