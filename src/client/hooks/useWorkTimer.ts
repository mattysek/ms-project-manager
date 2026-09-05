// Běžící stopky (PRD-10, FR-WL-02, FR-WL-03).
//
// Vlastní jen jednu věc: co právě běží. Seznam záznamů si drží `useWorkLog`,
// protože panel v liště ho nepotřebuje a stahovat kvůli tlačítku „Stop" celý
// měsíc by bylo nepoměrné.
//
// Invariantu „nejvýš jedny stopky" drží server, ne tenhle hook — start nové
// činnosti vrátí v `stoppedPrevious` tu, kterou ukončil, a UI to jen ohlásí.
import { useCallback, useEffect, useState } from 'react';
import * as worklogApi from '../api/worklogApi';
import type { WorkLogEntry } from '../api/worklogApi';

/** Jak často se překresluje narostlý čas. Vteřinu člověk na stopkách čeká. */
const TICK_MS = 1000;

export interface StartDraft {
  title: string;
  projectId: string | null;
  tags: string[];
}

export interface WorkTimer {
  running: WorkLogEntry | null;
  /** Roste každou vteřinu, aby šlo přepočítat trvání běžící činnosti. */
  now: number;
  loading: boolean;
  error: string | null;
  /** Hláška „ukončil jsem ti předchozí činnost" (FR-WL-03). */
  notice: string | null;
  dismissNotice: () => void;
  start: (draft: StartDraft) => Promise<void>;
  stop: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * @param onChanged Zavolá se po každém zápisu — obrazovka výkazů si podle
 * něj přenačte seznam, panel v liště nic nepotřebuje.
 */
export function useWorkTimer(onChanged?: () => void): WorkTimer {
  const [running, setRunning] = useState<WorkLogEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      setRunning(await worklogApi.fetchRunning());
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Tiká pořád, ne jen když něco běží: `now` používá i přehled, aby se
  // rozdělaná činnost počítala k okamžiku zobrazení (FR-WL-08).
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const start = useCallback(
    async (draft: StartDraft) => {
      try {
        const result = await worklogApi.createEntry({
          title: draft.title,
          projectId: draft.projectId,
          tags: draft.tags,
          // Čas kliknutí, ne čas doručení požadavku (ADR-017).
          startedAt: new Date().toISOString(),
        });
        setRunning(result.entry);
        setError(null);
        setNotice(
          result.stoppedPrevious
            ? `Ukončena předchozí činnost: ${result.stoppedPrevious.title}`
            : null
        );
        onChanged?.();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [onChanged]
  );

  const stop = useCallback(async () => {
    // Okamžik se sebere hned. Když požadavek selže, činnost zůstane běžet
    // a opakovaný pokus zapíše pořád tenhle čas, ne ten, kdy se síť vrátila.
    const endedAt = new Date().toISOString();
    try {
      await worklogApi.stopRunning(endedAt);
      setRunning(null);
      setError(null);
      onChanged?.();
    } catch (err) {
      setError((err as Error).message);
    }
  }, [onChanged]);

  return {
    running,
    now,
    loading,
    error,
    notice,
    dismissNotice: () => setNotice(null),
    start,
    stop,
    refresh,
  };
}
