// Seznam výkazů za zvolené období a zápisy nad ním (PRD-10).
//
// Období se posílá na server jako rozsah instantů; filtrování podle projektu,
// tagu a textu běží až tady nad staženými daty (ADR-017) — server o výkazech
// nic neagreguje a nic v nich nehledá.
import { useCallback, useEffect, useState } from 'react';
import * as worklogApi from '../api/worklogApi';
import type { WorkLogEntry, WorkLogEntryInput } from '../api/worklogApi';
import { periodRange, type Period } from '../components/worklog/period';

export interface WorkLogData {
  entries: WorkLogEntry[];
  /** Tagy z historie pro našeptávač (FR-WL-05). */
  knownTags: string[];
  loading: boolean;
  error: string | null;
  dismissError: () => void;
  reload: () => Promise<void>;
  save: (input: WorkLogEntryInput) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
}

export function useWorkLog(period: Period): WorkLogData {
  const [entries, setEntries] = useState<WorkLogEntry[]>([]);
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [loaded, tags] = await Promise.all([
        worklogApi.listEntries(periodRange(period)),
        worklogApi.listTags(),
      ]);
      setEntries(loaded);
      setKnownTags(tags);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** `true` = uloženo; formulář se podle toho zavře, nebo zůstane s chybou. */
  const save = useCallback(
    async (input: WorkLogEntryInput) => {
      try {
        if (input.id) await worklogApi.updateEntry(input.id, input);
        else await worklogApi.createEntry(input);
        await reload();
        return true;
      } catch (err) {
        setError((err as Error).message);
        return false;
      }
    },
    [reload]
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await worklogApi.deleteEntry(id);
        await reload();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [reload]
  );

  return {
    entries,
    knownTags,
    loading,
    error,
    dismissError: () => setError(null),
    reload,
    save,
    remove,
  };
}
