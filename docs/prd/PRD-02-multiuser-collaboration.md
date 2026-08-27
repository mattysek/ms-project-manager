# PRD-02: Multi-user real-time kolaborace

## Přehled

Více uživatelů může mít otevřený stejný projekt zároveň. Změna provedená jedním uživatelem je okamžitě viditelná všem ostatním bez nutnosti ručního obnovení stránky. Autoritativní stav projektu je uložen na serveru v `ProjectActor`.

## Cíle

- Změny se propagují k ostatním uživatelům do 200ms (lokální síť)
- Žádné ztracené změny při souběžném přístupu
- Uživatelé vidí, kdo jiný je v projektu a na jakém view
- Klient zachovává svižné UX (optimistická aplikace)

## Non-goals

- Google Docs-style kurzory a real-time text editing
- Globální undo (odvolání změn jiných uživatelů)
- Notifikace při změnách (push notifications, email)

## Uživatelé a role

| Aktér | Popis |
|---|---|
| **Každý přihlášený člen projektu** | Posílá commandy, přijímá diffy |
| **ProjectActor (server)** | Přijímá commandy, aplikuje jako reducer, broadcastuje diffy |

## Funkcionální požadavky

### FR-COLLAB-01: Připojení k projektu
- Při otevření projektu klient naváže SignalR připojení na Hub `/hubs/project`
- Klient se přihlásí do skupiny `project:{projectId}`
- Server okamžitě pošle `{ op: "full_state", state: AppState }` jako první zprávu
- Klient nahradí lokální stav plným stavem ze serveru

### FR-COLLAB-02: Odesílání commandů
- Klient posílá command přes `connection.invoke("SendCommand", { projectId, command })`
- Každý command obsahuje `projectId` a typed payload (viz ADR-004)
- Klient okamžitě aplikuje command lokálně (optimistická aplikace) před potvrzením serveru
- Server validuje command (auth, business rules), aplikuje na stav actora, broadcastuje diff

### FR-COLLAB-03: Přijímání diffů
- Klient registruje handler `connection.on("ReceiveDiff", applyDiff)`
- `applyDiff` je čistá funkce: `(AppState, ProjectDiff) => AppState`
- Diffy od jiných uživatelů aktualizují lokální stav bez konfliktu s optimisticky aplikovanými vlastními commandy (vlastní command diff přeskočí, pokud je lokálně identický)
- Chybová odpověď serveru (`{ op: "error" }`) triggery rollback lokálního stavu na poslední potvrzený stav

### FR-COLLAB-04: Presence — kdo je online
- Server udržuje přehled připojených uživatelů per projekt a per view
- Při změně view klient pošle `{ type: "update_presence", view: "gantt" }`
- Server broadcastuje `{ op: "presence", users: [{ userId, displayName, view, color }] }` všem v projektu
- Klient zobrazí avatary aktivních uživatelů v Header (max 5 avatarů, pak "+N")
- Avatar zobrazuje initials uživatele, barvu a aktuální view jako tooltip

### FR-COLLAB-05: Zpracování commandů v ProjectActor
- `ProjectActor` zpracovává commandy sekvenčně z mailboxu (FIFO)
- Každý command prochází: (1) auth check (userId má přístup), (2) permission check (role), (3) business validation, (4) state mutation, (5) diff broadcast, (6) persist schedule
- Diff je broadcastován **všem** uživatelům ve skupině včetně odesílatele (odesílatel ignoruje diff pro svůj optimisticky aplikovaný command)

### FR-COLLAB-06: Reconnect
- SignalR automaticky reconnectuje při přerušení spojení (konfigurace: exponential backoff, max 3 pokusy)
- Po reconnectu klient vyžádá `full_state` a přepíše lokální stav
- Pending offline commandy jsou přehrány (viz PRD-05)
- Presence se automaticky aktualizuje po reconnectu

### FR-COLLAB-07: Conflict při simultánní editaci stejného pole
- Konflikt nastane, pokud dva uživatelé pošlou command na stejné pole téměř současně
- Konflikt se řeší jako **last-write-wins na serveru** (actor je sekvenční, první command vyhraje)
- Poražený uživatel dostane diff se správnou hodnotou, jeho optimisticky aplikovaná změna je přepsána
- UI zobrazí diskrétní notifikaci: "Hodnota pole X byla změněna jiným uživatelem"

### FR-COLLAB-08: Uzavření projektu
- Při zavření projektu (klik na "← Zpět") klient opustí SignalR skupinu
- Server odstraní uživatele z presence pro daný projekt
- Pokud je uživatel posledním v projektu a actor je idle > 15 minut, actor persistuje a zastaví se

## Non-funkcionální požadavky

- Latence command → broadcast: < 200ms (lokální síť)
- SignalR skupiny: max 15 klientů per projekt
- `ProjectActor` mailbox: max 1000 zpráv ve frontě (ochrana před přetížením)
- Idle timeout: actor se zastaví po 15 minutách bez activity (persist + shutdown)
- Restart serveru: všechny aktory se restartují čistě; klienti reconnectují a dostanou fresh `full_state`

## Out of scope

- Tracking kurzoru (která buňka/úkol má kdo focus)
- Blokování editace entity při jejím otevření jiným uživatelem (pessimistic locking)
- Notification sound nebo vizuální alert při každé změně jiného uživatele
