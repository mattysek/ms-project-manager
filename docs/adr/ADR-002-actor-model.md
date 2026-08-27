# ADR-002: Actor model pro správu stavu projektů

## Status
Přijato

## Kontext

V multi-user prostředí může N klientů souběžně modifikovat stav jednoho projektu (úkoly, alokace, rizika, KB stránky…). Bez koordinace nastávají race conditions — např. dva uživatelé přesunou stejný úkol najednou a výsledný stav závisí na pořadí zápisů do DB.

Současná architektura drží veškerý stav v paměti prohlížeče (React `useState` + `useUndoRedo`). Na serveru potřebujeme ekvivalentní mechanismus, který:
1. Drží autoritativní stav projektu v RAM (rychlý přístup, žádný DB round-trip per operaci)
2. Zpracovává příkazy **sekvenčně** — žádné souběžné mutace
3. Broadcastuje diffy všem připojeným klientům
4. Periodicky persistuje stav do SQLite
5. Uvolní paměť, když projekt nikdo nepoužívá

## Rozhodnutí

**`MailboxProcessor<ProjectMessage>` (F# agent) per otevřený projekt, spravovaný v `ProjectActorRegistry`**

```fsharp
type ProjectMessage =
    | Command of ProjectCommand * AsyncReplyChannel<Result<Diff, string>>
    | Persist
    | Shutdown

// Jeden actor per projekt, životní cyklus:
// GetOrCreate(projectId) → load from SQLite → start loop
// Idle timeout (15 min bez commandů) → Persist → stop
```

`ProjectActorRegistry` je singleton (`IHostedService`), drží `ConcurrentDictionary<string, MailboxProcessor<ProjectMessage>>`. Při příchodu commandu přes SignalR Hub registry vytáhne nebo vytvoří actor pro daný projekt.

Actor zpracovává zprávy z mailboxu **jednu po druhé** — F# runtime garantuje sekvenční dispatch bez nutnosti explicitních zámků nebo transakcí.

## Alternativy

### Akka.NET
- **Pro:** battle-tested distributed actor framework, supervision trees, clustering
- **Proti:** masivní overhead pro 15 uživatelů, složitá konfigurace, přináší komplexitu distribuovaných systémů tam, kde není potřeba; `MailboxProcessor` pokryje stejný use case s desetinou kódu

### Žádný actor model — `lock` + `Dictionary`
- **Pro:** jednoduché, žádná nová abstrakce
- **Proti:** ruční správa zámků je náchylná k deadlockům, není přirozené mapování na command/reducer pattern, idle eviction komplikovaná

### Jeden globální lock pro všechny projekty
- **Pro:** triviální implementace
- **Proti:** jeden projekt blokuje všechny ostatní, nevhodné i pro 15 uživatelů

### Database-level locking (SELECT FOR UPDATE)
- **Pro:** persistence je automaticky konzistentní
- **Proti:** SQLite nepodporuje `SELECT FOR UPDATE`, každá operace vyžaduje round-trip do DB, výkon zcela nevhodný pro drag-and-drop interakce

## Důsledky

**Pozitivní:**
- Nulové race conditions per projekt — mailbox je FIFO fronta, zpracování je sekvenční
- Přirozené mapování na MVU: `applyCommand : AppState → Command → (AppState × Diff)` je čistý reducer
- Projekty bez aktivních uživatelů jsou automaticky unloadovány z RAM po idle timeoutu
- Crash actora (neočekávaná výjimka) = reload z SQLite, klienti dostanou `reconnect` event přes SignalR

**Negativní:**
- Jeden pomalý command (např. ADO API call) blokuje mailbox — ADO operace musí být prováděny asynchronně nebo delegovány separátnímu actoru (`AdoBridgeActor`)
- Stav projektu je v RAM — při havárii serveru se ztrácí změny od posledního persist; zmírněno debounced persist (každých 5 sekund pokud jsou změny) + persist při každém `Shutdown`

**Neutrální:**
- `ProjectActorRegistry` musí být thread-safe při GetOrCreate — `ConcurrentDictionary.GetOrAdd` s lazy inicializací
- Persist timer běží jako `handle_info :persist` ekvivalent — v F# jako rekurzivní `async { do! Async.Sleep persistInterval; inbox.Post Persist; ... }` v separátním vlákně
