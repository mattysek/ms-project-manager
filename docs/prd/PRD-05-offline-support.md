# PRD-05: Offline podpora

## Přehled

Aplikace je použitelná při výpadku sítě nebo serveru. Uživatel může číst stav projektu a provádět změny; ty jsou uloženy lokálně a synchronizovány při obnovení spojení. Konflikty (server změnil entitu, na které uživatel pracoval offline) jsou řešeny přes dialog.

## Cíle

- Uživatel neztrácí práci při výpadku sítě
- Jasná komunikace offline stavu v UI
- Seamless synchronizace při reconnectu pro nejčastější případy (žádné konflikty)

## Non-goals

- CRDT-based conflict-free sync (overkill pro 15 uživatelů)
- Offline ADO Sync operace (vyžadují síť na dev.azure.com)
- Offline přístup k souborům (binary blobs — příliš velké pro IndexedDB cache)
- Offline přístup bez předchozího přihlášení (cookie session musí existovat)

## Uživatelé a role

Offline podpora platí pro všechny přihlášené uživatele (PM i Dev) stejně.

## Funkcionální požadavky

### FR-OFFLINE-01: Detekce offline stavu
- Offline detekce kombinuje dva signály:
  1. `window.addEventListener("offline")` — browser event (hrubá detekce)
  2. SignalR `onclose` / `onreconnecting` event — přesná detekce ztráty serveru
- Pokud jeden z signálů indikuje offline → UI přejde do offline módu
- Pokud oba signály indikují online → UI přejde do online módu

### FR-OFFLINE-02: Offline UI indikátor
- Při offline stavu se zobrazí barevný banner v horní části obrazovky: "⚠ Offline — pracujete bez připojení. Změny budou uloženy při obnovení spojení. N čekajících změn."
- Header zobrazí ikonu signálu "⚡ Offline" místo indikátoru posledního uložení
- Banner zmizí automaticky při obnovení připojení (po úspěšné synchronizaci)

### FR-OFFLINE-03: Command Queue — ukládání změn při offline
- Každý command před odesláním na server je zapisován do IndexedDB tabulky `pending_commands` s: `id` (UUID), `projectId`, `command` (JSON), `timestamp`, `locallyApplied: true`
- Online: command je z queue odebrán ihned po potvrzení serveru (diff received)
- Offline: command zůstane v queue; klient ho aplikuje lokálně (optimisticky)
- Queue přežije reload stránky — IndexedDB je persistentní
- Maximální velikost queue: 500 commandů per projekt (ochrana); při překročení: varování "Příliš mnoho čekajících změn — zvažte ruční export projektu"

### FR-OFFLINE-04: Offline State Cache
- Při úspěšném načtení projektu (full_state ze serveru) se celý `AppState` uloží do IndexedDB: `project_cache/{projectId}`
- Cache se používá jako výchozí stav při offline startu (uživatel otevře app, server není dostupný)
- Cache je invalidována při každém úspěšném reconnectu (nahrazena čerstvým stavem ze serveru)

### FR-OFFLINE-05: Reconnect Replay
- Při obnovení SignalR spojení:
  1. Server pošle čerstvý `full_state`
  2. Klient načte `pending_commands` queue z IndexedDB
  3. Klient detekuje konflikty (viz FR-OFFLINE-06)
  4. Nekonfliktní commandy jsou replay-ovány na server sekvenčně
  5. Úspěšně přehrané commandy jsou odebrány z queue
  6. UI banner se zaktualizuje: "Synchronizováno — N změn přeneseno"

### FR-OFFLINE-06: Conflict Detection a Resolution
- Konflikt nastane pokud server změnil stejnou entitu/pole jako pending command (jiným uživatelem)
- Detekce: porovnání stavu entity v `full_state` (po reconnect) vs. stavu entity v `stateBeforeOffline` (cache před odpojením)
- Pokud se liší a zároveň existuje pending command na tuto entitu → konflikt

**Conflict Resolution Dialog:**
- Zobrazí se modal se seznamem konfliktů
- Každý konflikt: jméno entity, pole, "Server má: X", "Vaše změna: Y", volba [Ponechat serverovou | Použít moji]
- Tlačítko "Ponechat vše serverové" a "Použít vše moje" pro hromadné řešení
- Po potvrzení jsou vybrané commandy přehrány nebo discardovány

### FR-OFFLINE-07: Specifické omezení při offline
- ADO Sync tlačítko je disabled s tooltipem "Synchronizace s ADO vyžaduje připojení"
- Upload souborů je disabled s tooltipem "Upload souborů vyžaduje připojení"
- Export projektu (JSON) funguje offline — exportuje lokální cache stav (se watermarkem "Exportováno v offline režimu — stav nemusí být aktuální")
- Import projektu je disabled při offline

### FR-OFFLINE-08: Expiry čekajících změn
- Commandy starší než 48 hodin jsou automaticky discardovány při příštím startu aplikace
- Uživatel je notifikován: "N starých čekajících změn bylo odstraněno (starší než 48h)"

## Non-funkcionální požadavky

- Detekce offline: < 5 sekund od reálné ztráty spojení
- Reconnect replay: < 10 sekund pro 100 pending commandů (lokální síť)
- IndexedDB zápis pending command: < 50ms
- State cache v IndexedDB: max 10 MB per projekt (velké projekty se zalogují varování)

## Out of scope

- Service Worker (PWA installable app)
- Background sync (synchronizace když je tab zavřen)
- Offline přístup k souborovým přílohám
- Offline přihlášení (cookie musí být válídní)
