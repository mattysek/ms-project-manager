// Testy useCollabNotifications — FR-COLLAB-07 (last-write-wins notifikace).
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCollabNotifications } from './useCollabNotifications';

describe('useCollabNotifications', () => {
  // @scenario: real-time-collaboration.feature > Conflict při simultánní editaci stejného pole — last-write-wins
  it('diff se stejnou hodnotou jako vlastní zápis (výhra) nezobrazí notifikaci', () => {
    const { result } = renderHook(() => useCollabNotifications());

    act(() =>
      result.current.noteOwnCommand({ type: 'update_task', taskId: 't1', fields: { md: 20 } })
    );
    act(() => result.current.handleDiff({ op: 'task_updated', taskId: 't1', fields: { md: 20 } }));

    expect(result.current.message).toBeNull();
  });

  it('diff s jinou hodnotou než vlastní zápis (prohra) zobrazí notifikaci s labelem pole', () => {
    const { result } = renderHook(() => useCollabNotifications());

    act(() =>
      result.current.noteOwnCommand({ type: 'update_task', taskId: 't1', fields: { md: 18 } })
    );
    act(() => result.current.handleDiff({ op: 'task_updated', taskId: 't1', fields: { md: 20 } }));

    expect(result.current.message).toBe('Hodnota pole MD byla změněna jiným uživatelem');
  });

  it('diff na pole, které jsem sám nezapisoval, nevyvolá notifikaci', () => {
    const { result } = renderHook(() => useCollabNotifications());

    act(() =>
      result.current.handleDiff({
        op: 'task_updated',
        taskId: 't1',
        fields: { name: 'Nový název' },
      })
    );

    expect(result.current.message).toBeNull();
  });

  it('dismiss vyčistí zprávu', () => {
    const { result } = renderHook(() => useCollabNotifications());
    act(() =>
      result.current.noteOwnCommand({ type: 'update_progress', taskId: 't1', progress: 10 })
    );
    act(() =>
      result.current.handleDiff({ op: 'task_updated', taskId: 't1', fields: { progress: 90 } })
    );
    expect(result.current.message).not.toBeNull();

    act(() => result.current.dismiss());

    expect(result.current.message).toBeNull();
  });
});
