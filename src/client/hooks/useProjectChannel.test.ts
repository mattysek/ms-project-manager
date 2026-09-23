// Testy useProjectChannel — SignalR spojení bez běžícího serveru (ADR-004, PRD-02).
//
// Transport je injektovaný přes `options.createTransport`, takže tu nikdy
// neběží skutečný `@microsoft/signalr` — `FakeTransport` simuluje hub
// eventy i lifecycle přesně podle rozhraní `ProjectChannelTransport`.

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeAppState, makeTask } from '../state/testFixtures';
import type { ProjectDiff } from '../types/protocol';
import type { ProjectChannelTransport } from './useProjectChannel';
import { useProjectChannel } from './useProjectChannel';

// Stejná signatura jako `ProjectChannelTransport.on`/`off` — heterogenní event bus.
// biome-ignore lint/suspicious/noExplicitAny: viz komentář výše
type Handler = (...args: any[]) => void;

class FakeTransport implements ProjectChannelTransport {
  handlers = new Map<string, Set<Handler>>();
  invokeCalls: { method: string; args: unknown[] }[] = [];
  invokeImpl: (method: string, args: unknown[]) => Promise<unknown> = async () => undefined;
  startCalls = 0;
  stopCalls = 0;

  async start() {
    this.startCalls++;
  }

  async stop() {
    this.stopCalls++;
  }

  invoke(methodName: string, ...args: unknown[]) {
    this.invokeCalls.push({ method: methodName, args });
    return this.invokeImpl(methodName, args) as Promise<never>;
  }

  on(event: string, handler: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)?.add(handler);
  }

  off(event: string, handler: Handler) {
    this.handlers.get(event)?.delete(handler);
  }

  emit(event: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }
}

function renderChannel(transport: FakeTransport, projectId: string | null = 'proj1') {
  return renderHook(({ id }) => useProjectChannel(id, { createTransport: () => transport }), {
    initialProps: { id: projectId },
  });
}

describe('useProjectChannel — připojení a full_state (FR-COLLAB-01)', () => {
  it('po startu spojení přejde connectionStatus na "connected"', async () => {
    const transport = new FakeTransport();
    const { result } = renderChannel(transport);

    expect(transport.startCalls).toBe(1);
    await waitFor(() => expect(result.current.connectionStatus).toBe('connected'));
  });

  it('ReceiveFullState nahradí lokální stav stavem ze serveru', async () => {
    const transport = new FakeTransport();
    const { result } = renderChannel(transport);
    await waitFor(() => expect(result.current.connectionStatus).toBe('connected'));

    const serverState = makeAppState({ tasks: [makeTask({ id: 'server-task' })] });
    act(() => transport.emit('ReceiveFullState', serverState));

    expect(result.current.state).toEqual(serverState);
  });
});

describe('useProjectChannel — diffy (FR-COLLAB-03)', () => {
  // @scenario: real-time-collaboration.feature > Změna jednoho uživatele je viditelná druhému v reálném čase
  it('ReceiveDiff od jiného uživatele aktualizuje stav', async () => {
    const transport = new FakeTransport();
    const { result } = renderChannel(transport);
    const initialState = makeAppState({ tasks: [makeTask({ id: 't1', s: 0, e: 3 })] });
    act(() => transport.emit('ReceiveFullState', initialState));

    const diff: ProjectDiff = { op: 'task_updated', taskId: 't1', fields: { s: 2, e: 5 } };
    act(() => transport.emit('ReceiveDiff', diff));

    expect(result.current.state?.tasks[0]).toMatchObject({ s: 2, e: 5 });
  });

  it('presence diff aktualizuje presence, ne doménový stav', async () => {
    const transport = new FakeTransport();
    const { result } = renderChannel(transport);
    const initialState = makeAppState();
    act(() => transport.emit('ReceiveFullState', initialState));

    const diff: ProjectDiff = {
      op: 'presence',
      users: [{ userId: 'u1', displayName: 'Petra Kolářová', view: 'seznam', color: '#f00' }],
    };
    act(() => transport.emit('ReceiveDiff', diff));

    expect(result.current.presence).toEqual(diff.users);
    expect(result.current.state).toEqual(initialState);
  });

  it('error diff rollbackne stav na poslední potvrzený a nastaví lastError', async () => {
    const transport = new FakeTransport();
    const { result } = renderChannel(transport);
    const confirmedState = makeAppState({ tasks: [makeTask({ id: 't1', progress: 10 })] });
    act(() => transport.emit('ReceiveFullState', confirmedState));

    // Optimistická (neschválená) změna — bez odpovídajícího potvrzeného diffu.
    act(() =>
      result.current.sendCommand(
        { type: 'update_progress', taskId: 't1', progress: 90 },
        (state) => ({
          ...state,
          tasks: state.tasks.map((t) => (t.id === 't1' ? { ...t, progress: 90 } : t)),
        })
      )
    );
    expect(result.current.state?.tasks[0].progress).toBe(90);

    act(() =>
      transport.emit('ReceiveDiff', {
        op: 'error',
        message: 'Nevalidní progress',
        commandType: 'update_progress',
      })
    );

    expect(result.current.state?.tasks[0].progress).toBe(10);
    // `source` odlišuje odmítnutí serverem od selhání přenosu — banner ukazuje
    // jen to první, protože transportní hláška ze SignalR je surová a anglická.
    expect(result.current.lastError).toEqual({
      message: 'Nevalidní progress',
      commandType: 'update_progress',
      source: 'server',
    });
  });

  // @scenario: real-time-collaboration.feature > Conflict při simultánní editaci stejného pole — last-write-wins
  it('poražený uživatel dostane diff se skutečnou hodnotou a jeho optimistická změna je přepsána', async () => {
    const transport = new FakeTransport();
    const { result } = renderChannel(transport);
    const initialState = makeAppState({ tasks: [makeTask({ id: 't1', md: 5 })] });
    act(() => transport.emit('ReceiveFullState', initialState));

    // "petra.kolarova" (tenhle klient) optimisticky nastaví MD na 18…
    act(() =>
      result.current.sendCommand(
        { type: 'update_task', taskId: 't1', fields: { md: 18 } },
        (state) => ({
          ...state,
          tasks: state.tasks.map((t) => (t.id === 't1' ? { ...t, md: 18 } : t)),
        })
      )
    );
    expect(result.current.state?.tasks[0].md).toBe(18);

    // …ale "jan.novak" dorazil na server první — server broadcastuje skutečnou hodnotu 20.
    act(() =>
      transport.emit('ReceiveDiff', {
        op: 'task_updated',
        taskId: 't1',
        fields: { md: 20 },
      } satisfies ProjectDiff)
    );

    expect(result.current.state?.tasks[0].md).toBe(20);
  });
});

describe('useProjectChannel — odesílání commandů (optimistická aplikace, ADR-004)', () => {
  it('sendCommand aplikuje optimistickou změnu okamžitě a zavolá SendCommand', async () => {
    const transport = new FakeTransport();
    const { result } = renderChannel(transport);
    act(() =>
      transport.emit(
        'ReceiveFullState',
        makeAppState({ tasks: [makeTask({ id: 't1', s: 0, e: 1 })] })
      )
    );

    act(() => {
      result.current.sendCommand({ type: 'move_task', taskId: 't1', s: 3, e: 6 }, (state) => ({
        ...state,
        tasks: state.tasks.map((t) => (t.id === 't1' ? { ...t, s: 3, e: 6 } : t)),
      }));
    });

    expect(result.current.state?.tasks[0]).toMatchObject({ s: 3, e: 6 });
    // `projectId` MUSÍ jít jako první argument: hub má `SendCommand(projectId,
    // command)` a SignalR váže argumenty podle počtu, takže volání s jedním
    // argumentem skončí `InvalidDataException` a command se zahodí. Tenhle test
    // to dřív nechytil, protože očekával jen `[command]`.
    expect(transport.invokeCalls).toContainEqual({
      method: 'SendCommand',
      args: ['proj1', { type: 'move_task', taskId: 't1', s: 3, e: 6 }],
    });
  });
});

describe('useProjectChannel — reconnect (FR-COLLAB-06)', () => {
  // @scenario: real-time-collaboration.feature > Reconnect po výpadku sítě
  // @scenario: real-time-collaboration.feature > Restart serveru — automatický reconnect klientů
  it('reconnecting → connectionStatus "reconnecting", reconnected → vyžádá čerstvý full_state', async () => {
    const transport = new FakeTransport();
    const freshState = makeAppState({ tasks: [makeTask({ id: 'after-reconnect' })] });
    transport.invokeImpl = async (method) => (method === 'GetFullState' ? freshState : undefined);
    const { result } = renderChannel(transport);
    await waitFor(() => expect(result.current.connectionStatus).toBe('connected'));

    act(() => transport.emit('reconnecting'));
    expect(result.current.connectionStatus).toBe('reconnecting');

    await act(async () => {
      transport.emit('reconnected');
      await Promise.resolve();
    });

    expect(result.current.connectionStatus).toBe('connected');
    await waitFor(() => expect(result.current.state).toEqual(freshState));
  });

  it('close → connectionStatus "disconnected"', async () => {
    const transport = new FakeTransport();
    const { result } = renderChannel(transport);
    await waitFor(() => expect(result.current.connectionStatus).toBe('connected'));

    act(() => transport.emit('close'));

    expect(result.current.connectionStatus).toBe('disconnected');
  });
});

describe('useProjectChannel — odpojení projektu (FR-COLLAB-08)', () => {
  it('při zrušení projectId (zavření projektu) se transport zastaví', async () => {
    const transport = new FakeTransport();
    const { result, rerender } = renderChannel(transport, 'proj1');
    await waitFor(() => expect(result.current.connectionStatus).toBe('connected'));

    rerender({ id: null });

    expect(transport.stopCalls).toBe(1);
    expect(result.current.connectionStatus).toBe('disconnected');
  });

  it('při zrušení projectId zavolá LeaveProject s ID opouštěného projektu', async () => {
    const transport = new FakeTransport();
    const { result, rerender } = renderChannel(transport, 'proj1');
    await waitFor(() => expect(result.current.connectionStatus).toBe('connected'));

    rerender({ id: null });

    expect(transport.invokeCalls).toContainEqual({ method: 'LeaveProject', args: ['proj1'] });
  });
});

describe('useProjectChannel — připojení k projektu přes JoinProject (ADR-004 doplněk)', () => {
  it('po startu spojení zavolá JoinProject s ID projektu a odpověď nastaví jako stav', async () => {
    const transport = new FakeTransport();
    const joinedState = makeAppState({ tasks: [makeTask({ id: 'joined-task' })] });
    transport.invokeImpl = async (method) => (method === 'JoinProject' ? joinedState : undefined);
    const { result } = renderChannel(transport, 'proj1');

    await waitFor(() =>
      expect(transport.invokeCalls).toContainEqual({ method: 'JoinProject', args: ['proj1'] })
    );
    await waitFor(() => expect(result.current.state).toEqual(joinedState));
  });
});

describe('useProjectChannel — applyLocal (ADR-009, offline)', () => {
  it('aplikuje mutaci lokálně bez volání transportu', async () => {
    const transport = new FakeTransport();
    const { result } = renderChannel(transport);
    act(() =>
      transport.emit('ReceiveFullState', makeAppState({ tasks: [makeTask({ id: 't1' })] }))
    );
    const invokeCallsBefore = transport.invokeCalls.length;

    act(() => {
      result.current.applyLocal((state) => ({
        ...state,
        tasks: state.tasks.map((t) => (t.id === 't1' ? { ...t, progress: 42 } : t)),
      }));
    });

    expect(result.current.state?.tasks[0].progress).toBe(42);
    expect(transport.invokeCalls.length).toBe(invokeCallsBefore);
  });
});

describe('useProjectChannel — seedFromCache (FR-OFFLINE-04)', () => {
  it('seedFromCache nastaví stav, pokud ještě nedorazil žádný full_state', async () => {
    const transport = new FakeTransport();
    const { result } = renderChannel(transport);
    const cached = makeAppState({ tasks: [makeTask({ id: 'from-cache' })] });

    act(() => result.current.seedFromCache(cached));

    expect(result.current.state).toEqual(cached);
  });

  it('seedFromCache nepřepíše už přijatý skutečný full_state', async () => {
    const transport = new FakeTransport();
    const { result } = renderChannel(transport);
    const real = makeAppState({ tasks: [makeTask({ id: 'real' })] });
    act(() => transport.emit('ReceiveFullState', real));

    act(() =>
      result.current.seedFromCache(makeAppState({ tasks: [makeTask({ id: 'stale-cache' })] }))
    );

    expect(result.current.state).toEqual(real);
  });
});

describe('useProjectChannel — přepnutí projektu', () => {
  it('stav předchozího projektu se nepřenese do nového', async () => {
    const transport = new FakeTransport();
    const { result, rerender } = renderChannel(transport, 'proj1');
    act(() => transport.emit('ReceiveFullState', makeAppState({ tasks: [makeTask({ id: 'a' })] })));

    rerender({ id: 'proj2' });

    // Dokud nedorazí stav proj2, nesmí se zobrazovat (ani ukládat do jeho
    // cache) stav proj1 — a cache proj2 musí jít naseedovat.
    expect(result.current.state).toBeNull();
    expect(result.current.getLastConfirmedState()).toBeNull();
    const cached = makeAppState({ tasks: [makeTask({ id: 'b-cache' })] });
    act(() => result.current.seedFromCache(cached));
    expect(result.current.state).toEqual(cached);
  });
});
