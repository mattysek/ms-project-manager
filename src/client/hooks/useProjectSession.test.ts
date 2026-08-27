// Smoke test useProjectSession — ověřuje, že skládané hooky (channel, offline,
// dispatch) fungují dohromady na fake transportu (ADR-004/005/007/009).
import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useProjectSession } from './useProjectSession';
import type { ProjectChannelTransport } from './useProjectChannel';
import { makeAppState, makeTask } from '../state/testFixtures';
import { saveProjectCache } from '../storage/projectCache';
import { uid } from '../utils';

type Handler = (...args: unknown[]) => void;

class FakeTransport implements ProjectChannelTransport {
  handlers = new Map<string, Set<Handler>>();
  invokeImpl: (method: string) => Promise<unknown> = async () => undefined;

  async start() {}
  async stop() {}
  invoke(methodName: string) {
    return this.invokeImpl(methodName) as Promise<never>;
  }
  on(event: string, handler: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)?.add(handler);
  }
  off(event: string, handler: Handler) {
    this.handlers.get(event)?.delete(handler);
  }
}

describe('useProjectSession — end-to-end přes fake transport', () => {
  it('po JoinProject dostane stav a dispatch aplikuje command optimisticky', async () => {
    const transport = new FakeTransport();
    const joined = makeAppState({ tasks: [makeTask({ id: 't1', progress: 0 })] });
    transport.invokeImpl = async (method) => (method === 'JoinProject' ? joined : undefined);

    const { result } = renderHook(() =>
      useProjectSession('proj1', { createTransport: () => transport })
    );

    await waitFor(() => expect(result.current.state).toEqual(joined));

    act(() => result.current.dispatch({ type: 'update_progress', taskId: 't1', progress: 77 }));

    expect(result.current.state?.tasks[0].progress).toBe(77);
    expect(result.current.canUndo).toBe(true);
  });

  it('projectId null → state zůstává null, žádné připojení', () => {
    const { result } = renderHook(() => useProjectSession(null));
    expect(result.current.state).toBeNull();
    expect(result.current.connectionStatus).toBe('disconnected');
  });

  // @scenario: offline.feature > Pending commandy přežijí reload stránky při offline
  it('appka startující offline (server nedostupný) nahradí prázdný stav poslední cache', async () => {
    const projectId = `proj-${uid()}`;
    const cached = makeAppState({ tasks: [makeTask({ id: 'from-cache' })] });
    await saveProjectCache(projectId, cached);

    const transport = new FakeTransport();
    // Server se nikdy neozve — connectionStatus zůstane "connecting" navždy.
    transport.invokeImpl = () => new Promise(() => {});

    const { result } = renderHook(() =>
      useProjectSession(projectId, { createTransport: () => transport })
    );

    await waitFor(() => expect(result.current.state).toEqual(cached));
  });
});
