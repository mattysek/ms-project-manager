// Per-session command history — ADR-007.
//
// Single-user verze bufferovala 50 snapshotů celého `AppState`. V multi-user
// prostředí to nejde: undo uživatele A by odvolalo i změny uživatele B, které
// mezitím proběhly. ADR-007 proto místo snapshotů drží zásobník COMMANDŮ — undo
// pošle inverzní command (`invertCommand`, `src/state/invertCommand.ts`), který
// projde normální cestou (optimistická aplikace → server → diff broadcast), ne
// nějaký speciální "undo" protokol.
//
// Tenhle hook je jen bookkeeping dvou zásobníků (undo/redo) commandů + jejich
// `prevState` (stav TĚSNĚ PŘED aplikací commandu — `invertCommand` ho potřebuje,
// viz jeho hlavička). Samotné odeslání/aplikaci inverzního commandu dělá volající
// (`useCommandDispatch`) — tenhle hook o síti ani o `AppState` mutacích nic neví.
//
// Zásobníky jsou v `useRef`, ne `useState` — nepotřebují vlastní re-render mimo
// `canUndo`/`canRedo`, které signalizuje samostatný čítač (`useReducer`
// force-update). Vyhýbáme se tím spoléhání na to, že React updater funkce ve
// `setState` běží synchronně (implementační detail, ne API kontrakt).
import { useCallback, useReducer, useRef } from 'react';
import type { ProjectCommand } from '../types/protocol';
import type { AppState } from '../state/appState';

const MAX_HISTORY = 50;

export interface CommandHistoryEntry {
  command: ProjectCommand;
  /** Stav TĚSNĚ PŘED aplikací `command` — vstup pro `invertCommand`. */
  prevState: AppState;
}

export interface UndoRedoState {
  canUndo: boolean;
  canRedo: boolean;
  /** Zaznamená nově odeslaný command do historie; zahodí redo zásobník (nová akce). */
  record: (command: ProjectCommand, prevState: AppState) => void;
  /** Sundá poslední command z undo zásobníku a přesune ho na redo — nebo `null`. */
  undo: () => CommandHistoryEntry | null;
  /** Sundá poslední command z redo zásobníku a přesune ho zpět na undo — nebo `null`. */
  redo: () => CommandHistoryEntry | null;
  /** Vyprázdní obě historie — voláno při reconnectu (ADR-007: „undo se resetuje"). */
  reset: () => void;
}

function bounded<T>(list: T[]): T[] {
  return list.length > MAX_HISTORY ? list.slice(list.length - MAX_HISTORY) : list;
}

export function useUndoRedo(): UndoRedoState {
  const undoStack = useRef<CommandHistoryEntry[]>([]);
  const redoStack = useRef<CommandHistoryEntry[]>([]);
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  const record = useCallback((command: ProjectCommand, prevState: AppState) => {
    undoStack.current = bounded([...undoStack.current, { command, prevState }]);
    redoStack.current = [];
    forceRender();
  }, []);

  const undo = useCallback((): CommandHistoryEntry | null => {
    const stack = undoStack.current;
    if (stack.length === 0) return null;
    const entry = stack[stack.length - 1];
    undoStack.current = stack.slice(0, -1);
    redoStack.current = bounded([...redoStack.current, entry]);
    forceRender();
    return entry;
  }, []);

  const redo = useCallback((): CommandHistoryEntry | null => {
    const stack = redoStack.current;
    if (stack.length === 0) return null;
    const entry = stack[stack.length - 1];
    redoStack.current = stack.slice(0, -1);
    undoStack.current = bounded([...undoStack.current, entry]);
    forceRender();
    return entry;
  }, []);

  const reset = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    forceRender();
  }, []);

  return {
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    record,
    undo,
    redo,
    reset,
  };
}
