// Testy useOfflineSync — reconnect replay a conflict resolution (ADR-009, PRD-05).
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useOfflineSync } from './useOfflineSync';
import { enqueuePendingCommand, getPendingCommands } from '../storage/offlineQueue';
import { makeAppState, makeTask } from '../state/testFixtures';
import { uid } from '../utils';
import type { UseProjectChannelResult } from './useProjectChannel';
import type { AppState } from '../state/appState';

function freshProjectId(): string {
  return `proj-${uid()}`;
}

function fakeChannel(state: AppState | null): UseProjectChannelResult {
  return {
    state,
    fullStateVersion: 0,
    presence: [],
    connectionStatus: 'connected',
    lastError: null,
    sendCommand: vi.fn(),
    // Přehrávání fronty jde přes awaitable variantu — command se z fronty
    // maže až po potvrzení, aby se při dalším výpadku neztratil.
    sendCommandAwaitable: vi.fn().mockResolvedValue(undefined),
    getLastConfirmedState: vi.fn().mockReturnValue(null),
    applyLocal: vi.fn(),
    seedFromCache: vi.fn(),
    requestFullState: vi.fn(),
  };
}

interface Props {
  isOffline: boolean;
  fullStateVersion: number;
  channel: UseProjectChannelResult;
}

function renderOfflineSync(projectId: string, initial: Props) {
  return renderHook(
    (props: Props) =>
      useOfflineSync({
        projectId,
        isOffline: props.isOffline,
        fullStateVersion: props.fullStateVersion,
        channel: props.channel,
      }),
    { initialProps: initial }
  );
}

/** Simuluje: klient offline (zachytí `before` jako stateBeforeOffline) → reconnect s `serverState`. */
async function goOfflineThenReconnect(projectId: string, before: AppState, serverState: AppState) {
  const rendered = renderOfflineSync(projectId, {
    isOffline: true,
    fullStateVersion: 0,
    channel: fakeChannel(before),
  });
  await waitFor(() => expect(rendered.result.current.pendingCount).toBeGreaterThan(0));

  const channelAfter = fakeChannel(serverState);
  rendered.rerender({ isOffline: false, fullStateVersion: 1, channel: channelAfter });
  return { ...rendered, channelAfter };
}

describe('useOfflineSync — reconnect replay bez konfliktu (FR-OFFLINE-05)', () => {
  // @scenario: offline.feature > Seamless synchronizace při reconnectu bez konfliktů
  // @scenario: real-time-collaboration.feature > Offline change replay po reconnectu bez konfliktu
  it('bezkonfliktní pending command se přehraje a fronta se vyprázdní', async () => {
    const projectId = freshProjectId();
    const before = makeAppState({ tasks: [makeTask({ id: 't1', s: 0, e: 3 })] });
    await enqueuePendingCommand(projectId, { type: 'move_task', taskId: 't1', s: 2, e: 5 });
    const serverState = makeAppState({ tasks: [makeTask({ id: 't1', s: 0, e: 3 })] });

    const { result, channelAfter } = await goOfflineThenReconnect(projectId, before, serverState);

    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(channelAfter.sendCommandAwaitable).toHaveBeenCalledWith(
      { type: 'move_task', taskId: 't1', s: 2, e: 5 },
      expect.any(Function)
    );
    await waitFor(() => expect(result.current.syncMessage).toContain('Synchronizováno'));
    expect(await getPendingCommands(projectId)).toHaveLength(0);
  });
});

describe('useOfflineSync — conflict resolution (FR-OFFLINE-06)', () => {
  // @scenario: offline.feature > Conflict resolution dialog při reconnectu
  // @scenario: real-time-collaboration.feature > Conflict resolution dialog po offline
  it('konfliktní pending command se objeví v conflicts a NEPŘEHRAJE se automaticky', async () => {
    const projectId = freshProjectId();
    const before = makeAppState({ tasks: [makeTask({ id: 't1', s: 5, e: 8 })] });
    await enqueuePendingCommand(projectId, { type: 'move_task', taskId: 't1', s: 5, e: 8 });
    // Server má jinou pozici, než na jaké klient offline pracoval → konflikt.
    const serverState = makeAppState({ tasks: [makeTask({ id: 't1', s: 2, e: 3 })] });

    const { result } = await goOfflineThenReconnect(projectId, before, serverState);

    await waitFor(() => expect(result.current.conflicts).toHaveLength(1));
    expect(result.current.conflicts[0]).toMatchObject({
      entityLabel: 'Testovací úkol',
      fieldLabel: 'Pozice úkolu (start a konec týdne)',
    });
    expect(await getPendingCommands(projectId)).toHaveLength(1);
  });

  // @scenario: offline.feature > Conflict resolution — uživatel vybere serverovou verzi
  it('resolveConflict("server") zahodí pending command bez přehrání', async () => {
    const projectId = freshProjectId();
    const before = makeAppState({ tasks: [makeTask({ id: 't1', s: 5, e: 8 })] });
    await enqueuePendingCommand(projectId, { type: 'move_task', taskId: 't1', s: 5, e: 8 });
    const serverState = makeAppState({ tasks: [makeTask({ id: 't1', s: 2, e: 3 })] });

    const { result } = await goOfflineThenReconnect(projectId, before, serverState);
    await waitFor(() => expect(result.current.conflicts).toHaveLength(1));

    act(() => result.current.resolveConflict(result.current.conflicts[0], 'server'));

    await waitFor(() => expect(result.current.conflicts).toHaveLength(0));
    expect(await getPendingCommands(projectId)).toHaveLength(0);
  });

  // @scenario: offline.feature > Conflict resolution — uživatel vybere svoji verzi
  it('resolveConflict("mine") přehraje pending command přes stav ze serveru', async () => {
    const projectId = freshProjectId();
    const before = makeAppState({ tasks: [makeTask({ id: 't1', s: 5, e: 8 })] });
    await enqueuePendingCommand(projectId, { type: 'move_task', taskId: 't1', s: 5, e: 8 });
    const serverState = makeAppState({ tasks: [makeTask({ id: 't1', s: 2, e: 3 })] });

    const { result, channelAfter } = await goOfflineThenReconnect(projectId, before, serverState);
    await waitFor(() => expect(result.current.conflicts).toHaveLength(1));

    act(() => result.current.resolveConflict(result.current.conflicts[0], 'mine'));

    await waitFor(() => expect(result.current.conflicts).toHaveLength(0));
    expect(channelAfter.sendCommandAwaitable).toHaveBeenCalledWith(
      { type: 'move_task', taskId: 't1', s: 5, e: 8 },
      expect.any(Function)
    );
    expect(await getPendingCommands(projectId)).toHaveLength(0);
  });

  // @scenario: offline.feature > Hromadné řešení konfliktů
  it('resolveAllConflicts("server") zahodí všechny konflikty najednou', async () => {
    const projectId = freshProjectId();
    const before = makeAppState({
      tasks: [makeTask({ id: 't1', s: 5, e: 8 }), makeTask({ id: 't2', s: 1, e: 2 })],
    });
    await enqueuePendingCommand(projectId, { type: 'move_task', taskId: 't1', s: 5, e: 8 });
    await enqueuePendingCommand(projectId, { type: 'move_task', taskId: 't2', s: 1, e: 2 });
    const serverState = makeAppState({
      tasks: [makeTask({ id: 't1', s: 2, e: 3 }), makeTask({ id: 't2', s: 4, e: 6 })],
    });

    const { result } = await goOfflineThenReconnect(projectId, before, serverState);
    await waitFor(() => expect(result.current.conflicts).toHaveLength(2));

    act(() => result.current.resolveAllConflicts('server'));

    await waitFor(() => expect(result.current.conflicts).toHaveLength(0));
    expect(await getPendingCommands(projectId)).toHaveLength(0);
  });
});

describe('useOfflineSync — návrat online bez rozpadlého spojení (FR-OFFLINE-05)', () => {
  // @scenario: offline.feature > Seamless synchronizace při reconnectu bez konfliktů
  it('po návratu konektivity si vyžádá full_state, i když se spojení nerozpadlo', async () => {
    // Krátký výpadek na úrovni prohlížeče (uspaný stroj, přepnutá Wi-Fi) pošle
    // appku do offline režimu, aniž by hub spojení vůbec zaznamenalo — žádný
    // reconnect, tedy ani nový `full_state`. Replay vázaný jen na
    // `fullStateVersion` proto nesepnul a fronta zůstala ležet, přestože banner
    // zmizel a uživatel měl změnu za odeslanou.
    const projectId = freshProjectId();
    const state = makeAppState({ tasks: [makeTask({ id: 't1', s: 0, e: 3 })] });
    await enqueuePendingCommand(projectId, { type: 'move_task', taskId: 't1', s: 2, e: 5 });

    const channel = fakeChannel(state);
    const rendered = renderOfflineSync(projectId, {
      isOffline: true,
      fullStateVersion: 0,
      channel,
    });
    await waitFor(() => expect(rendered.result.current.pendingCount).toBe(1));

    // `fullStateVersion` se ZÁMĚRNĚ nemění — spojení se nikdy nerozpadlo.
    rendered.rerender({ isOffline: false, fullStateVersion: 0, channel });

    // Nepřehrává rovnou proti stavu, který má po ruce: vyžádá si autoritativní
    // serverový stav, aby detekce konfliktů viděla i cizí změny z doby výpadku.
    await waitFor(() => expect(channel.requestFullState).toHaveBeenCalled());
    expect(channel.sendCommandAwaitable).not.toHaveBeenCalled();

    // Odpověď serveru dorazí jako `full_state` → teprve tím se fronta přehraje.
    rendered.rerender({ isOffline: false, fullStateVersion: 1, channel });

    await waitFor(() => expect(rendered.result.current.pendingCount).toBe(0));
    expect(channel.sendCommandAwaitable).toHaveBeenCalledWith(
      { type: 'move_task', taskId: 't1', s: 2, e: 5 },
      expect.any(Function)
    );
    expect(await getPendingCommands(projectId)).toHaveLength(0);
  });
});

describe('useOfflineSync — expirace starých commandů (FR-OFFLINE-08)', () => {
  it('nová fronta nemá co zahazovat — purgedNotice zůstává null', async () => {
    const projectId = freshProjectId();
    await enqueuePendingCommand(projectId, { type: 'update_progress', taskId: 't1', progress: 5 });

    const { result } = renderOfflineSync(projectId, {
      isOffline: false,
      fullStateVersion: 0,
      channel: fakeChannel(makeAppState()),
    });

    await waitFor(() => expect(result.current.pendingCount).toBe(1));
    expect(result.current.purgedNotice).toBeNull();
  });
});
