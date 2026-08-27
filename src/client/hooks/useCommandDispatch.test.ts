// Testy useCommandDispatch — online/offline dispatch, undo/redo, reconnect reset.
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useCommandDispatch } from './useCommandDispatch';
import { getPendingCommands } from '../storage/offlineQueue';
import { makeAppState, makeTask } from '../state/testFixtures';
import { uid } from '../utils';
import type { UseProjectChannelResult } from './useProjectChannel';
import type { AppState } from '../state/appState';

function freshProjectId(): string {
  return `proj-${uid()}`;
}

function fakeChannel(state: AppState | null): UseProjectChannelResult {
  let current = state;
  return {
    get state() {
      return current;
    },
    fullStateVersion: 0,
    presence: [],
    connectionStatus: 'connected',
    lastError: null,
    sendCommand: vi.fn((_command, applyOptimistic) => {
      if (applyOptimistic && current) current = applyOptimistic(current);
    }),
    applyLocal: vi.fn((mutate) => {
      if (current) current = mutate(current);
    }),
    seedFromCache: vi.fn(),
  } as unknown as UseProjectChannelResult;
}

describe('useCommandDispatch — online (ADR-004)', () => {
  it('dispatch aplikuje optimisticky a pošle command přes channel.sendCommand', () => {
    const channel = fakeChannel(makeAppState({ tasks: [makeTask({ id: 't1', progress: 0 })] }));
    const { result } = renderHook(() =>
      useCommandDispatch({
        projectId: 'p1',
        channel,
        connectionStatus: 'connected',
        isOffline: false,
      })
    );

    act(() => result.current.dispatch({ type: 'update_progress', taskId: 't1', progress: 60 }));

    expect(channel.state?.tasks[0].progress).toBe(60);
    expect(channel.sendCommand).toHaveBeenCalledOnce();
  });

  it('canUndo je true po dispatch a undo pošle inverzní command', () => {
    const channel = fakeChannel(makeAppState({ tasks: [makeTask({ id: 't1', progress: 0 })] }));
    const { result } = renderHook(() =>
      useCommandDispatch({
        projectId: 'p1',
        channel,
        connectionStatus: 'connected',
        isOffline: false,
      })
    );

    act(() => result.current.dispatch({ type: 'update_progress', taskId: 't1', progress: 60 }));
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());

    expect(channel.state?.tasks[0].progress).toBe(0);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it('redo po undu obnoví hodnotu', () => {
    const channel = fakeChannel(makeAppState({ tasks: [makeTask({ id: 't1', progress: 0 })] }));
    const { result } = renderHook(() =>
      useCommandDispatch({
        projectId: 'p1',
        channel,
        connectionStatus: 'connected',
        isOffline: false,
      })
    );
    act(() => result.current.dispatch({ type: 'update_progress', taskId: 't1', progress: 60 }));
    act(() => result.current.undo());

    act(() => result.current.redo());

    expect(channel.state?.tasks[0].progress).toBe(60);
  });
});

describe('useCommandDispatch — offline (ADR-009)', () => {
  // @scenario: offline.feature > Změny jsou ukládány lokálně při offline
  it('dispatch při offline aplikuje lokálně a uloží command do fronty místo odeslání', async () => {
    const projectId = freshProjectId();
    const channel = fakeChannel(makeAppState({ tasks: [makeTask({ id: 't1', s: 0, e: 3 })] }));
    const { result } = renderHook(() =>
      useCommandDispatch({ projectId, channel, connectionStatus: 'connected', isOffline: true })
    );

    act(() => result.current.dispatch({ type: 'move_task', taskId: 't1', s: 2, e: 5 }));

    expect(channel.state?.tasks[0]).toMatchObject({ s: 2, e: 5 });
    expect(channel.sendCommand).not.toHaveBeenCalled();
    await waitFor(async () => expect(await getPendingCommands(projectId)).toHaveLength(1));
  });

  // @scenario: offline.feature > Undo při offline
  it('undo při offline se také uloží do fronty jako druhý command', async () => {
    const projectId = freshProjectId();
    const channel = fakeChannel(makeAppState({ tasks: [makeTask({ id: 't1', s: 0, e: 3 })] }));
    const { result } = renderHook(() =>
      useCommandDispatch({ projectId, channel, connectionStatus: 'connected', isOffline: true })
    );

    act(() => result.current.dispatch({ type: 'move_task', taskId: 't1', s: 2, e: 5 }));
    act(() => result.current.undo());

    expect(channel.state?.tasks[0]).toMatchObject({ s: 0, e: 3 });
    await waitFor(async () => expect(await getPendingCommands(projectId)).toHaveLength(2));
  });

  // @scenario: offline.feature > Více změn se kumuluje v pending queue
  it('každé zařazení do fronty ohlásí volajícímu, aby přepočítal počítadlo', async () => {
    // Banner ukazuje počet čekajících změn, ale `usePendingQueue` ho načítá jen
    // při připojení a po reconnectu. Bez tohohle hlášení zůstal při práci
    // offline viset na nule, takže uživatel nevěděl, kolik toho má nepřenesené.
    const projectId = freshProjectId();
    const channel = fakeChannel(makeAppState({ tasks: [makeTask({ id: 't1', s: 0, e: 3 })] }));
    const onQueued = vi.fn();
    const { result } = renderHook(() =>
      useCommandDispatch({
        projectId,
        channel,
        connectionStatus: 'connected',
        isOffline: true,
        onQueued,
      })
    );

    act(() => result.current.dispatch({ type: 'move_task', taskId: 't1', s: 2, e: 5 }));
    act(() => result.current.dispatch({ type: 'move_task', taskId: 't1', s: 3, e: 6 }));

    await waitFor(() => expect(onQueued).toHaveBeenCalledTimes(2));
  });

  it('online dispatch frontu neplní, takže ani nic nehlásí', async () => {
    const projectId = freshProjectId();
    const channel = fakeChannel(makeAppState({ tasks: [makeTask({ id: 't1', s: 0, e: 3 })] }));
    const onQueued = vi.fn();
    const { result } = renderHook(() =>
      useCommandDispatch({
        projectId,
        channel,
        connectionStatus: 'connected',
        isOffline: false,
        onQueued,
      })
    );

    act(() => result.current.dispatch({ type: 'move_task', taskId: 't1', s: 2, e: 5 }));

    await waitFor(async () => expect(await getPendingCommands(projectId)).toHaveLength(0));
    expect(onQueued).not.toHaveBeenCalled();
  });
});

describe('useCommandDispatch — reset historie při reconnectu (ADR-007)', () => {
  it('undo historie se vyprázdní, když connectionStatus přejde reconnecting → connected', () => {
    const channel = fakeChannel(makeAppState({ tasks: [makeTask({ id: 't1', progress: 0 })] }));
    const { result, rerender } = renderHook(
      (status: 'connected' | 'reconnecting') =>
        useCommandDispatch({
          projectId: 'p1',
          channel,
          connectionStatus: status,
          isOffline: false,
        }),
      { initialProps: 'connected' }
    );
    act(() => result.current.dispatch({ type: 'update_progress', taskId: 't1', progress: 60 }));
    expect(result.current.canUndo).toBe(true);

    rerender('reconnecting');
    rerender('connected');

    expect(result.current.canUndo).toBe(false);
  });
});
