# PRD-03: Role a řízení přístupu

## Přehled

Každý projekt má členy s přiřazenými rolemi. Dvě role: `pm` (Project Manager) a `dev` (Developer). Oprávnění jsou enforcovány na serveru v `ProjectActor`. UI skrývá nebo disabluje prvky, ke kterým uživatel nemá přístup.

## Cíle

- Zabránit vývojářům v nechtěném přepsání sdílených dat (projekt metadata, ADO konfigurace)
- Umožnit vývojářům plnou autonomii nad vlastními daty (úkoly, alokace, TODO)
- PM může plně spravovat projekt a tým

## Non-goals

- Granulárnost na úrovni jednotlivých entit (per-task ACL)
- Více než dvě role per projekt v první verzi
- Přenos oprávnění (delegate)

## Uživatelé a role

| Role | Kdo | Rozsah |
|---|---|---|
| **Admin** | Systémový administrátor | Správa uživatelských účtů; nemá automaticky PM na všech projektech |
| **PM** | Project Manager projektu | Plný R/W na vše v projektu |
| **Dev** | Vývojář projektu | R/W vlastní data; R sdílená data projektu |

## Funkcionální požadavky

### FR-ROLE-01: Permission matrix

Viz detailní tabulka níže. Enforcement je **vždy server-side**; UI je jen UX vrstva.

| Funkce | PM | Dev |
|---|---|---|
| Název, data, rozpočet projektu | R/W | R |
| Milníky (přidat, editovat, drag) | R/W | R |
| Milník checklist položky | R/W | R/W |
| Changelog / Meeting log | R/W | R |
| Poznámky k projektu (notes) | R/W | R |
| Správa osob (add/edit/delete) | R/W | — |
| Správa rolí (AR, BE, FE…) | R/W | R |
| Všechny úkoly (read) | R | R |
| Přidání úkolu (do backlogu) | R/W | R/W |
| Přidání úkolu (s přiřazením) | R/W | jen sebe |
| Editace cizího úkolu | R/W | — |
| Editace vlastního úkolu | R/W | R/W |
| Smazání úkolu | R/W | — |
| Přeřazení úkolu na jinou osobu | R/W | — |
| Progress vlastního úkolu | R/W | R/W |
| Správa kategorií | R/W | R |
| Kapacita — číst všechny | R | R |
| Kapacita — editovat vlastní alokaci | R/W | R/W |
| Kapacita — editovat cizí alokaci | R/W | — |
| Rizika (read) | R | R |
| Rizika (add/edit/delete) | R/W | — |
| Příležitosti (add/edit/delete) | R/W | — |
| ADO Sync konfigurace | R/W | — |
| ADO Sync spuštění | R/W | — |
| ADO Sync log (read) | R | R |
| Soubory (číst, stáhnout) | R | R |
| Soubory (uploadovat) | R/W | R/W |
| Soubory (smazat) | R/W | — |
| Editace poznámky k souboru | R/W | jen vlastní |
| TODO / Reminders (vlastní) | R/W | R/W |
| KB stránky (add/edit/delete) | R/W | R/W |
| Quick Notes (vlastní) | R/W | R/W |
| Správa členů projektu | R/W | — |
| Exportovat projekt (JSON/ZIP) | R/W | — |
| Importovat projekt | R/W | — |

### FR-ROLE-02: Správa členů projektu (PM only)
- PM vidí v Project view sekci "Členové projektu"
- PM může přidat existujícího uživatele systému do projektu (výběr z dropdown)
- PM může změnit roli člena (pm ↔ dev)
- PM může odebrat člena z projektu (odebrání neprovede smazání dat uživatele)
- PM nemůže odebrat sám sebe (musí přiřadit jiného PM nejdřív)
- Projekt musí mít vždy alespoň jednoho PM

### FR-ROLE-07: Přiřazení účtu k osobě v projektu (PM only)

Bez tohohle kroku je celá matice FR-ROLE-01 pro roli Dev nedosažitelná: „vlastní"
znamená `person.userId = ctx.userId` (ADR-006, doplněk), a dokud osobu nikdo
k účtu nepřiřadí, nemá Dev nic vlastního — nesmí editovat žádný úkol, tahat
pruh v Ganttu ani měnit svou alokaci. Server tu vazbu uměl od začátku
(`PersonFields.UserId`), UI ji ale nikdy nenabídlo.

- V Kapacitě má každý řádek osoby volbu „Účet" se seznamem **členů projektu**
  (ne všech uživatelů systému — přiřadit účet, který k projektu nemá přístup,
  nedává smysl).
- Prázdná volba = osoba bez účtu: externista nebo neobsazená pozice. To zůstává
  výchozí stav nové osoby.
- Jeden účet smí být přiřazen **nejvýš jedné osobě v rámci projektu**; server
  pokus o druhé přiřazení odmítne. Bez toho by dva lidé „vlastnili" tytéž úkoly.
- Odebrání člena z projektu vazbu ruší — jinak by osoba zůstala navázaná na
  účet, který už do projektu nesmí.
- Volbu vidí jen PM; Dev vidí přiřazený účet jen jako text.

### FR-ROLE-03: Server-side enforcement
- `ProjectActor` před aplikací každého commandu volá `authorizeCommand(userId, role, command)`
- Neautorizovaný command vrátí `Error "Nedostatečná oprávnění"` přes SignalR diff
- Klient zobrazí toast notifikaci s chybou
- Logování neautorizovaných pokusů: do konzole serveru (bez alertu uživatelům)

### FR-ROLE-04: UI Permission Gate
- React komponenta `<PermissionGate require="pm">...</PermissionGate>` obalí prvky vyžadující PM roli
- Při `dev` roli: tlačítka jsou `disabled` (ne `hidden`) s tooltipem "Tato akce vyžaduje roli Project Manager"
- Inputy a formuláře jsou `readonly` pro data bez write oprávnění
- Sekce ADO Sync konfigurace je pro Dev uživatele **skryta** (ne jen disablována) — PAT info nesmí být viditelné

### FR-ROLE-05: Viditelnost role v UI
- Header zobrazuje roli uživatele na aktuálním projektu (např. "[PM]" nebo "[Dev]" za jménem)
- Při přepnutí na jiný projekt se role UI aktualizuje

### FR-ROLE-06: Změna role — efekt na aktivní session
- Pokud PM změní roli jiného uživatele který je právě přihlášen, server pošle `{ op: "role_changed", newRole: "pm" | "dev" }` diff danému uživateli
- Klient aktualizuje kontext role bez nutnosti reloadu

## Non-funkcionální požadavky

- Permission check v actoru: < 1ms (synchronní operace bez DB lookup)
- Role je cachována v `UserSessionActor` — aktualizována při načtení projektu a při `role_changed` diffu
- Změna role se projeví okamžitě (bez nutnosti reloadu nebo opětovného přihlášení)

## Out of scope

- Per-task oprávnění (kdo může editovat konkrétní úkol mimo přiřazení)
- Read-only přístup k projektu bez členství (sdílení přes link)
- Dočasné oprávnění (time-limited access)
