// Testy useUndoRedo — per-session zásobník commandů (ADR-007).
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useUndoRedo } from './useUndoRedo';
import { makeAppState } from '../state/testFixtures';
import type { ProjectCommand } from '../types/protocol';

const CMD: ProjectCommand = { type: 'update_progress', taskId: 't1', progress: 50 };

describe('useUndoRedo — zaznamenání a undo/redo (ADR-007)', () => {
  it('nová historie nemá co odvolat ani co vrátit', () => {
    const { result } = renderHook(() => useUndoRedo());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('record přidá command a povolí undo', () => {
    const { result } = renderHook(() => useUndoRedo());
    const prevState = makeAppState();

    act(() => result.current.record(CMD, prevState));

    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('undo vrátí naposledy zaznamenaný command a jeho prevState', () => {
    const { result } = renderHook(() => useUndoRedo());
    const prevState = makeAppState();
    act(() => result.current.record(CMD, prevState));

    let entry: ReturnType<typeof result.current.undo> = null;
    act(() => {
      entry = result.current.undo();
    });

    expect(entry).toEqual({ command: CMD, prevState });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it('redo vrátí zpět command odvolaný přes undo', () => {
    const { result } = renderHook(() => useUndoRedo());
    const prevState = makeAppState();
    act(() => result.current.record(CMD, prevState));
    act(() => result.current.undo());

    let entry: ReturnType<typeof result.current.redo> = null;
    act(() => {
      entry = result.current.redo();
    });

    expect(entry).toEqual({ command: CMD, prevState });
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('undo na prázdné historii vrátí null a nic nemění', () => {
    const { result } = renderHook(() => useUndoRedo());
    let entry: ReturnType<typeof result.current.undo> = null;
    act(() => {
      entry = result.current.undo();
    });
    expect(entry).toBeNull();
  });

  it('nový record po undu zahodí redo historii (standardní undo/redo chování)', () => {
    const { result } = renderHook(() => useUndoRedo());
    const prevState = makeAppState();
    act(() => result.current.record(CMD, prevState));
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);

    act(() =>
      result.current.record({ type: 'update_progress', taskId: 't1', progress: 70 }, prevState)
    );

    expect(result.current.canRedo).toBe(false);
  });
});

describe('useUndoRedo — reset a limit historie (ADR-007)', () => {
  // @scenario: offline.feature > Undo při offline
  it('reset vyprázdní obě historie (ADR-007: undo se resetuje při reconnectu)', () => {
    const { result } = renderHook(() => useUndoRedo());
    const prevState = makeAppState();
    act(() => result.current.record(CMD, prevState));
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.reset());

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('historie je omezena na 50 kroků', () => {
    const { result } = renderHook(() => useUndoRedo());
    const prevState = makeAppState();

    act(() => {
      for (let i = 0; i < 60; i++) {
        result.current.record({ type: 'update_progress', taskId: 't1', progress: i }, prevState);
      }
    });

    // 60 undo volání by mělo vrátit přesně 50 platných záznamů, dalších 10 už nic.
    let successfulUndos = 0;
    act(() => {
      for (let i = 0; i < 60; i++) {
        if (result.current.undo()) successfulUndos++;
      }
    });
    expect(successfulUndos).toBe(50);
  });
});
