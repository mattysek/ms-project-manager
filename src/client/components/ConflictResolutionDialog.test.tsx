// Testy ConflictResolutionDialog — FR-OFFLINE-06.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConflictResolutionDialog } from './ConflictResolutionDialog';
import type { Conflict } from '../state/detectConflicts';
import type { PendingCommand } from '../storage/offlineQueue';

function pending(command: PendingCommand['command']): PendingCommand {
  return {
    id: 'pc1',
    projectId: 'p1',
    command,
    timestamp: '2026-01-01T00:00:00.000Z',
    locallyApplied: true,
  };
}

function conflict(overrides: Partial<Conflict> = {}): Conflict {
  return {
    pending: pending({ type: 'move_task', taskId: 't1', s: 5, e: 8 }),
    entityId: 't1',
    entityLabel: 'API refaktoring',
    fieldLabel: 'Pozice úkolu (start a konec týdne)',
    serverValue: 'W3-W4',
    pendingValue: 'W6-W9',
    ...overrides,
  };
}

describe('ConflictResolutionDialog', () => {
  it('bez konfliktů se nic nevykreslí', () => {
    const { container } = render(
      <ConflictResolutionDialog conflicts={[]} onResolve={vi.fn()} onResolveAll={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  // @scenario: offline.feature > Conflict resolution dialog při reconnectu
  it('zobrazí entitu, typ konfliktu, hodnotu ze serveru i lokální hodnotu', () => {
    render(
      <ConflictResolutionDialog
        conflicts={[conflict()]}
        onResolve={vi.fn()}
        onResolveAll={vi.fn()}
      />
    );

    expect(screen.getByText('Conflict Resolution — 1 konflikt')).toBeInTheDocument();
    expect(screen.getByText('API refaktoring')).toBeInTheDocument();
    expect(screen.getByText('Pozice úkolu (start a konec týdne)')).toBeInTheDocument();
    expect(screen.getByText('W3-W4')).toBeInTheDocument();
    expect(screen.getByText('W6-W9')).toBeInTheDocument();
  });

  // @scenario: offline.feature > Conflict resolution — uživatel vybere serverovou verzi
  it('klik na "Ponechat serverovou" zavolá onResolve s resolution "server"', async () => {
    const onResolve = vi.fn();
    const c = conflict();
    render(
      <ConflictResolutionDialog conflicts={[c]} onResolve={onResolve} onResolveAll={vi.fn()} />
    );

    await userEvent.click(screen.getByText('Ponechat serverovou'));

    expect(onResolve).toHaveBeenCalledWith(c, 'server');
  });

  // @scenario: offline.feature > Conflict resolution — uživatel vybere svoji verzi
  it('klik na "Použít moji" zavolá onResolve s resolution "mine"', async () => {
    const onResolve = vi.fn();
    const c = conflict();
    render(
      <ConflictResolutionDialog conflicts={[c]} onResolve={onResolve} onResolveAll={vi.fn()} />
    );

    await userEvent.click(screen.getByText('Použít moji'));

    expect(onResolve).toHaveBeenCalledWith(c, 'mine');
  });

  // @scenario: offline.feature > Hromadné řešení konfliktů
  it('tlačítko "Ponechat vše serverové" zavolá onResolveAll("server")', async () => {
    const onResolveAll = vi.fn();
    render(
      <ConflictResolutionDialog
        conflicts={[conflict(), conflict({ entityId: 't2', entityLabel: 'Jiný úkol' })]}
        onResolve={vi.fn()}
        onResolveAll={onResolveAll}
      />
    );

    await userEvent.click(screen.getByText('Ponechat vše serverové'));

    expect(onResolveAll).toHaveBeenCalledWith('server');
  });
});
