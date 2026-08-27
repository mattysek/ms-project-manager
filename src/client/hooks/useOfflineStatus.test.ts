// Testy useOfflineStatus — kombinace navigator.onLine + stavu SignalR spojení (FR-OFFLINE-01).
import { describe, expect, it, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOfflineStatus } from './useOfflineStatus';

function setBrowserOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true, writable: true });
}

describe('useOfflineStatus', () => {
  afterEach(() => {
    setBrowserOnline(true);
  });

  it('online prohlížeč + connected spojení → isOffline false', () => {
    setBrowserOnline(true);
    const { result } = renderHook(() => useOfflineStatus('connected'));

    expect(result.current.isOffline).toBe(false);
    expect(result.current.browserOnline).toBe(true);
  });

  // @scenario: offline.feature > Zobrazení offline indikátoru při výpadku sítě
  it('SignalR spojení disconnected → isOffline true, i když je navigator.onLine', () => {
    setBrowserOnline(true);
    const { result } = renderHook(() => useOfflineStatus('disconnected'));

    expect(result.current.isOffline).toBe(true);
  });

  it('reconnecting spojení je považováno za offline (ADR-009 onreconnecting)', () => {
    setBrowserOnline(true);
    const { result } = renderHook(() => useOfflineStatus('reconnecting'));

    expect(result.current.isOffline).toBe(true);
  });

  it('prvotní connecting stav NENÍ offline signál (ne ztráta spojení, jen ještě nenavázané)', () => {
    setBrowserOnline(true);
    const { result } = renderHook(() => useOfflineStatus('connecting'));

    expect(result.current.isOffline).toBe(false);
  });

  it('navigator.onLine false → isOffline true bez ohledu na connectionStatus', () => {
    setBrowserOnline(false);
    const { result } = renderHook(() => useOfflineStatus('connected'));

    expect(result.current.isOffline).toBe(true);
    expect(result.current.browserOnline).toBe(false);
  });

  it('reaguje na "offline"/"online" window eventy za běhu', () => {
    setBrowserOnline(true);
    const { result } = renderHook(() => useOfflineStatus('connected'));
    expect(result.current.isOffline).toBe(false);

    act(() => {
      setBrowserOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.isOffline).toBe(true);

    act(() => {
      setBrowserOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current.isOffline).toBe(false);
  });
});
