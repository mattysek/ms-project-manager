// Offline detekce — PRD-05, FR-OFFLINE-01.
//
// Kombinuje dva signály přesně podle PRD:
//   1. `navigator.onLine` / `window` eventy `online`/`offline` — hrubá detekce
//   2. stav SignalR spojení (`useProjectChannel`) — přesná detekce ztráty
//      serveru (`onclose`/`onreconnecting`)
// Pokud kterýkoliv ze signálů indikuje offline, je výsledný stav offline;
// online je jen tehdy, když jsou OBA signály online.
//
// `connectionStatus === 'connecting'` (čerstvé připojení, ne ztráta spojení)
// se offline signálem NEPOVAŽUJE — odpovídá SignalR eventům `onclose`/
// `onreconnecting`, kterých se tenhle bod PRD týká.
import { useEffect, useState } from 'react';
import type { ChannelConnectionStatus } from './useProjectChannel';

export interface OfflineStatus {
  isOffline: boolean;
  browserOnline: boolean;
  connectionStatus: ChannelConnectionStatus;
}

function readBrowserOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

const CONNECTION_OFFLINE_STATUSES: readonly ChannelConnectionStatus[] = [
  'disconnected',
  'reconnecting',
];

export function useOfflineStatus(connectionStatus: ChannelConnectionStatus): OfflineStatus {
  const [browserOnline, setBrowserOnline] = useState(readBrowserOnline);

  useEffect(() => {
    const goOnline = () => setBrowserOnline(true);
    const goOffline = () => setBrowserOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const connectionOffline = CONNECTION_OFFLINE_STATUSES.includes(connectionStatus);
  return { isOffline: !browserOnline || connectionOffline, browserOnline, connectionStatus };
}
