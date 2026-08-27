# ADR-007: Undo/Redo — per-session buffer na klientovi

## Status
Přijato

## Kontext

Současná single-user verze implementuje undo/redo jako 50-položkový kruhový buffer celého `AppState` na klientovi (`useUndoRedo` hook). V multi-user prostředí nastává problém: pokud uživatel A odvolá změnu, vrátí se i změny uživatele B, které proběhly mezitím?

## Rozhodnutí

**Per-session undo/redo buffer na klientovi; každý uživatel odvolá pouze vlastní commandy.**

- `useUndoRedo` hook zůstane na klientovi, ale místo celého `AppState` bufferuje **commandy** (ne snapshoty stavu)
- Při `undo`: klient pošle `{ type: "undo" }` command; server má per-connection seznam posledních N commandů daného uživatele a aplikuje reverzní operaci
- Alternativně: klient trackuje vlastní commandy lokálně a při `undo` posílá reverzní command přímo
- Maximálně 50 kroků zpět per session
- Undo/redo se resetuje při reconnectu (čistý stav)

### Implementace per-session command history

```typescript
// Klient drží per-session stack vlastních commandů
const myCommandHistory: ProjectCommand[] = []

function sendCommand(cmd: ProjectCommand) {
  // Optimistická aplikace
  applyCommandLocally(cmd)
  myCommandHistory.push(cmd)
  channel.push("cmd", cmd)
}

function undo() {
  const lastCmd = myCommandHistory.pop()
  if (!lastCmd) return
  const reverseCmd = invertCommand(lastCmd)  // move_task s, e → move_task původní s, e
  applyCommandLocally(reverseCmd)
  channel.push("cmd", reverseCmd)
}
```

### Reverzní operace pro klíčové commandy

| Command | Reverzní command |
|---|---|
| `add_task(task)` | `delete_task(task.id)` |
| `delete_task(id)` | `add_task(deletedTask)` (klient si uloží snapshot) |
| `move_task(id, s, e)` | `move_task(id, prevS, prevE)` |
| `update_progress(id, p)` | `update_progress(id, prevP)` |
| `update_alloc(personId, week, pct)` | `update_alloc(personId, week, prevPct)` |
| `add_risk(risk)` | `delete_risk(risk.id)` |
| `update_risk(id, fields)` | `update_risk(id, prevFields)` |

## Alternativy

### Globální undo (server-side event sourcing)
- **Pro:** konzistentní undo pro všechny; undo A neovlivní B
- **Proti:** extrémně složité v multi-user — "co přesně odvolat?" při prokládaných commandech od více uživatelů; Google Docs to neimplementuje; pro interní PM nástroj je to overkill

### Žádné undo
- **Pro:** triviální implementace
- **Proti:** undo je pro uživatele klíčová funkce (zvláště při Gantt drag), jeho ztráta by byla signifikantní regrese oproti single-user verzi

### Server-side per-session undo buffer
- **Pro:** server drží historii, klient je tenký
- **Proti:** zbytečný network round-trip pro undo; server musí udržovat velké množství session state; klient stejně potřebuje znát předchozí hodnoty pro invertCommand

## Důsledky

**Pozitivní:**
- Jednoduché na implementaci — `useUndoRedo` logika se zachová, jen se přidá `invertCommand`
- Undo jednoho uživatele neovlivní viditelný stav ostatních uživatelů — pouze posílá reverzní command který projde standardní cestou (actor → broadcast)
- Ostatní uživatelé uvidí "undo" jako normální změnu (pruh se vrátí na předchozí pozici)

**Negativní:**
- Undo po reconnectu není možné (history se ztratí) — toto je akceptovatelné omezení
- Při konfliktu (server odmítne command jako nevalidní) klient musí rollbacknout i undo historii — přidává komplexitu error handling logiky
- `delete_task` vyžaduje uložení celého snapshotu smazaného úkolu v undo historii — může být paměťově náročné pro velké úkoly s dlouhými popisky a mnoha ADO notes

**Implementační poznámky:**
- `Ctrl+Z` / `Ctrl+Y` keyboard shortcuts zůstávají v `Header.tsx`
- `canUndo` / `canRedo` flags se počítají z délky lokálního command history stacku
- `AppState` snapshot buffer (`useUndoRedo`) se nahradí command history stackem — přechod na invertCommand pattern vyžaduje přepis hooku
