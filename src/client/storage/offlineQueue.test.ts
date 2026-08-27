// Testy offlineQueue — IndexedDB fronta čekajících commandů (PRD-05, ADR-009).
// IndexedDB v jsdom neexistuje — `fake-indexeddb/auto` je zapojený globálně
// v `src/test/setup.ts`.
import { describe, expect, it } from 'vitest';
import {
  MAX_PENDING_COMMANDS,
  PendingQueueFullError,
  clearPendingCommands,
  enqueuePendingCommand,
  getPendingCommands,
  purgeExpiredCommands,
  removePendingCommand,
} from './offlineQueue';
import type { ProjectCommand } from '../types/protocol';
import { uid } from '../utils';

// Unikátní projectId per test — testy sdílí jednu fake-indexeddb instanci
// v rámci souboru, takhle se navzájem neovlivní.
function freshProjectId(): string {
  return `proj-${uid()}`;
}

const moveCommand: ProjectCommand = { type: 'move_task', taskId: 't1', s: 3, e: 6 };

describe('offlineQueue — základní CRUD', () => {
  // @scenario: offline.feature > Změny jsou ukládány lokálně při offline
  it('enqueuePendingCommand uloží command a vrátí entry s id/timestamp/locallyApplied', async () => {
    const projectId = freshProjectId();

    const entry = await enqueuePendingCommand(projectId, moveCommand);

    expect(entry.projectId).toBe(projectId);
    expect(entry.command).toEqual(moveCommand);
    expect(entry.locallyApplied).toBe(true);
    expect(entry.id).toBeTruthy();
    expect(entry.timestamp).toBeTruthy();
    expect(await getPendingCommands(projectId)).toHaveLength(1);
  });

  // @scenario: offline.feature > Více změn se kumuluje v pending queue
  it('5 různých commandů se nakumuluje ve frontě jednoho projektu', async () => {
    const projectId = freshProjectId();
    const commands: ProjectCommand[] = [
      { type: 'move_task', taskId: 't1', s: 0, e: 2 },
      { type: 'move_task', taskId: 't2', s: 1, e: 3 },
      { type: 'update_progress', taskId: 't1', progress: 30 },
      { type: 'update_task', taskId: 't3', fields: { md: 8 } },
      { type: 'update_alloc', personId: 'p1', weekIdx: 2, pct: 50 },
    ];

    for (const command of commands) {
      await enqueuePendingCommand(projectId, command);
    }

    const pending = await getPendingCommands(projectId);
    expect(pending).toHaveLength(5);
    expect(pending.map((p) => p.command)).toEqual(commands);
  });

  // @scenario: offline.feature > Pending commandy přežijí reload stránky při offline
  it('fronta přežije "reload" — data jsou v IndexedDB, ne jen v JS paměti', async () => {
    const projectId = freshProjectId();
    await enqueuePendingCommand(projectId, { type: 'move_task', taskId: 't1', s: 0, e: 1 });
    await enqueuePendingCommand(projectId, { type: 'move_task', taskId: 't2', s: 1, e: 2 });
    await enqueuePendingCommand(projectId, { type: 'move_task', taskId: 't3', s: 2, e: 3 });

    // Simulace reloadu stránky: nové, nezávislé volání čte přímo z IndexedDB
    // (žádný modul si mezi enqueue voláními nedrží kopii seznamu v paměti).
    const pendingAfterReload = await getPendingCommands(projectId);

    expect(pendingAfterReload).toHaveLength(3);
  });

  it('getPendingCommands vrátí commandy jen pro daný projekt, seřazené od nejstaršího', async () => {
    const projectA = freshProjectId();
    const projectB = freshProjectId();

    const first = await enqueuePendingCommand(projectA, {
      type: 'update_progress',
      taskId: 't1',
      progress: 10,
    });
    const second = await enqueuePendingCommand(projectA, {
      type: 'update_progress',
      taskId: 't1',
      progress: 20,
    });
    await enqueuePendingCommand(projectB, moveCommand);

    const pending = await getPendingCommands(projectA);

    expect(pending.map((p) => p.id)).toEqual([first.id, second.id]);
  });

  it('removePendingCommand odstraní jen zadanou položku', async () => {
    const projectId = freshProjectId();
    const first = await enqueuePendingCommand(projectId, moveCommand);
    const second = await enqueuePendingCommand(projectId, {
      type: 'update_progress',
      taskId: 't1',
      progress: 50,
    });

    await removePendingCommand(first.id);

    const pending = await getPendingCommands(projectId);
    expect(pending.map((p) => p.id)).toEqual([second.id]);
  });

  it('clearPendingCommands vyprázdní frontu celého projektu', async () => {
    const projectId = freshProjectId();
    await enqueuePendingCommand(projectId, moveCommand);
    await enqueuePendingCommand(projectId, { type: 'update_progress', taskId: 't1', progress: 50 });

    await clearPendingCommands(projectId);

    expect(await getPendingCommands(projectId)).toEqual([]);
  });
});

describe('offlineQueue — limity a expirace (FR-OFFLINE-03, FR-OFFLINE-08)', () => {
  it('enqueuePendingCommand vyhodí PendingQueueFullError nad MAX_PENDING_COMMANDS', async () => {
    const projectId = freshProjectId();
    for (let i = 0; i < MAX_PENDING_COMMANDS; i++) {
      await enqueuePendingCommand(projectId, {
        type: 'update_progress',
        taskId: 't1',
        progress: i % 100,
      });
    }

    await expect(enqueuePendingCommand(projectId, moveCommand)).rejects.toBeInstanceOf(
      PendingQueueFullError
    );
    expect(await getPendingCommands(projectId)).toHaveLength(MAX_PENDING_COMMANDS);
  }, 20000);

  // @scenario: offline.feature > Automatické zahození starých pending commandů
  it('purgeExpiredCommands smaže commandy starší než 48 hodin a vrátí jejich počet', async () => {
    const projectId = freshProjectId();
    await enqueuePendingCommand(projectId, moveCommand);
    const in49Hours = new Date(Date.now() + 49 * 60 * 60 * 1000);

    const purgedCount = await purgeExpiredCommands(projectId, in49Hours);

    expect(purgedCount).toBe(1);
    expect(await getPendingCommands(projectId)).toEqual([]);
  });

  it('purgeExpiredCommands nechá čerstvé commandy beze změny', async () => {
    const projectId = freshProjectId();
    await enqueuePendingCommand(projectId, moveCommand);

    const purgedCount = await purgeExpiredCommands(projectId, new Date());

    expect(purgedCount).toBe(0);
    expect(await getPendingCommands(projectId)).toHaveLength(1);
  });
});
