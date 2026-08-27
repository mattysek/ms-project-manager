# ADR-009: Offline strategie — Command Queue s Replay

## Status
Přijato

## Kontext

Požadavek na offline schopnost: uživatelé mohou pracovat i bez připojení k serveru a změny se synchronizují při obnovení spojení. Síťové výpadky jsou reálné (Windows VM v korporátní síti, VPN výpadky).

Klíčové otázky:
- Jak detekovat offline stav?
- Jak ukládat změny při offline?
- Jak synchronizovat při reconnectu?
- Jak řešit konflikty?

## Rozhodnutí

**Command Queue v IndexedDB + optimistická lokální aplikace + replay při reconnectu**

### Offline detekce

```typescript
// Dvě úrovně detekce:
// 1. navigator.onLine (hrubá detekce — browser API)
// 2. SignalR connection state (přesnější — skutečná ztráta serveru)

const [isOffline, setIsOffline] = useState(!navigator.onLine)

useEffect(() => {
  const goOffline = () => setIsOffline(true)
  const goOnline = () => setIsOffline(false)
  window.addEventListener("offline", goOffline)
  window.addEventListener("online", goOnline)
  return () => { ... }
}, [])

// SignalR disconnect event také nastaví isOffline = true
connection.onclose(() => setIsOffline(true))
connection.onreconnecting(() => setIsOffline(true))
connection.onreconnected(() => syncPendingQueue())
```

### Offline Command Queue

```typescript
interface PendingCommand {
  id: string           // UUID
  projectId: string
  command: ProjectCommand
  timestamp: string    // ISO
  applied: boolean     // lokálně aplikováno
}

// Uloženo v IndexedDB, tabulka "pending_commands"
// Přežije reload stránky
```

Při offline stavu:
1. Command je přidán do `pending_commands` v IndexedDB
2. Command je **okamžitě aplikován lokálně** (optimisticky) na cached stav
3. UI zobrazí banner "Offline — N změn čeká na synchronizaci"

### Offline State Cache

Při připojení k projektu se stáhne kompletní `AppState` a uloží do IndexedDB:
- `project_cache/{projectId}` — celý AppState jako JSON
- Při offline: klient pracuje s tímto cache + aplikuje pending commandy

### Reconnect Replay

```typescript
async function syncPendingQueue(projectId: string) {
  const pending = await getPendingCommands(projectId)
  if (pending.length === 0) return

  // 1. Načíst aktuální stav ze serveru
  const serverState = await channel.invoke("GetFullState")

  // 2. Detekovat konflikty (commandy na entity které server změnil)
  const conflicts = detectConflicts(pending, serverState, localStateBeforeOffline)

  if (conflicts.length > 0) {
    // Zobrazit conflict resolution dialog
    showConflictDialog(conflicts, pending, serverState)
  } else {
    // Replay všechny pending commandy
    for (const cmd of pending) {
      await channel.invoke("SendCommand", cmd.command)
    }
    await clearPendingCommands(projectId)
  }
}
```

### Conflict Detection

Konflikt nastane pokud:
- Server změnil stejnou entitu/pole jako pending command

```typescript
function detectConflicts(
  pendingCmds: PendingCommand[],
  serverState: AppState,
  stateBeforeOffline: AppState
): Conflict[] {
  return pendingCmds.flatMap(cmd => {
    switch (cmd.command.type) {
      case "move_task": {
        const servTask = serverState.tasks.find(t => t.id === cmd.command.taskId)
        const origTask = stateBeforeOffline.tasks.find(t => t.id === cmd.command.taskId)
        if (servTask && origTask && (servTask.s !== origTask.s || servTask.e !== origTask.e)) {
          return [{ type: "task_position", taskId: cmd.command.taskId, serverValue: servTask, pendingCmd: cmd }]
        }
        return []
      }
      // ... další typy
    }
  })
}
```

## Alternativy

### Žádná offline podpora
- **Pro:** eliminuje veškerou komplexitu
- **Proti:** nevyhovuje požadavku; síťové výpadky jsou reálné; uztráta práce je frustrující

### CRDT-based sync (Conflict-free Replicated Data Types)
- **Pro:** matematicky garantovaná konvergence bez konfliktů, nejrobustnější offline podpora
- **Proti:** implementace CRDT pro ordered lists (tasks), maps (alloc), text (popis) je extrémně složitá; pro 15 uživatelů interního nástroje je to masivní overengineering; dostupné CRDT knihovny (Yjs, Automerge) jsou JS-only a neumí se integrovat s F# server state

### Pessimistická UI (blokovat akce při offline)
- **Pro:** žádné konflikty, jednoduché
- **Proti:** špatný UX — uživatel nemůže nic dělat při výpadku sítě

## Důsledky

**Pozitivní:**
- 95% offline scénářů (uživatel pracuje sám nebo na jiných entitách) nevygeneruje konflikty → seamless replay
- Command queue přežije reload stránky (IndexedDB) → i při neúmyslném zavření tabu se práce neztrácí
- Optimistická aplikace = žádný perceptní výpadek UI při offline

**Negativní:**
- Conflict resolution dialog je komplexní UI komponent — musí zobrazit "server má X, ty chceš Y, co udělat?"
- State cache v IndexedDB může být stale — musí se invalidovat při každém úspěšném reconnectu
- ADO Sync operace nelze provést offline (vyžadují síť na ADO) — zobrazit jasnou chybovou zprávu

**Implementační poznámky:**
- Service Worker pro offline není nutný v první verzi — IndexedDB command queue + `navigator.onLine` + SignalR events pokryje základní offline potřeby
- Maximální počet pending commandů: 500 (ochrana před nekontrolovaným růstem)
- Pending commandy starší než 48 hodin jsou automaticky discardovány s notifikací uživateli


---

## Doplněk: offline i pro Quick Notes

**Status:** přijato 2026-08-17

Původní rozhodnutí postavilo offline frontu nad **commandy projektu**. Quick
Notes ale jdou přes REST (PRD-04, per-user data mimo actor), takže do té fronty
nepatřily — a offline prostě nefungovaly. Poznámka naťukaná bez připojení se
ztratila, což je u obsahu, který člověk píše na cestách, ta nejhorší možná
vlastnost.

### Rozhodnutí

Druhá fronta ve **stejné IndexedDB databázi**, vlastní store `pending_notes`
(`storage/noteQueue.ts`). Stejný princip: ulož, přežij reload, přehraj po
reconnectu v původním pořadí.

Obě fronty proto musí deklarovat **stejnou `DB_VERSION` a v `onupgradeneeded`
zakládat oba store** — upgrade spustí ten modul, který databázi otevře první.

### Co to umožnilo

Poznámka dostane **id na klientovi** a server ho respektuje
(`CreateNoteRequest.Id`). Bez toho by offline editace nešla: úprava ani smazání
by neměly čeho se chytit, dokud `create` nedorazí na server a nevrátí id.

Z toho plyne požadavek na idempotenci: `POST /api/quick-notes` se stejným id
vrátí existující poznámku místo chyby, takže přehrání fronty smí doručit stejnou
operaci dvakrát.

Pořadí operací se zachovává a nekoalescuje. „Vytvoř, uprav, uprav" se přehraje
jako tři volání a skončí jednou poznámkou s posledním textem — což je přesně to,
co uživatel čeká.

### Co offline zůstat nemůže

**Přílohy.** Až 25 MB binárních dat na soubor se nedá rozumně držet ve frontě
vedle stavu projektu; upload zůstává vypnutý a UI to říká. Totéž import projektu.
