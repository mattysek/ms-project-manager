// Diskrétní notifikace „Hodnota pole X byla změněna jiným uživatelem" — FR-COLLAB-07.
//
// Sleduje pole, která klient sám nedávno zapsal (`noteOwnCommand`, volané z
// `useCommandDispatch` po každém odeslaném commandu), a porovnává je s poli,
// která mění příchozí diffy (`handleDiff`, napojené na `useProjectChannel`
// `options.onDiff`). Server broadcastuje diff i odesílateli jeho vlastního
// commandu (FR-COLLAB-05) — pokud commandu "vyhrál", diff nese STEJNOU hodnotu,
// jakou jsem si už nastavil (žádná notifikace). Pokud prohrál (last-write-wins,
// FR-COLLAB-07), diff nese hodnotu vítěze, která se liší → notifikace.
//
// Záznamy o vlastních zápisech mají krátkou platnost (`OWN_WRITE_TTL_MS`) — po
// pár sekundách přestávají být relevantní (diff, který dorazí o minutu později,
// nejspíš patří k úplně jiné, nesouvisející změně stejného pole).
import { useCallback, useRef, useState } from 'react';
import { fieldLabel, fieldWritesFromCommand, fieldWritesFromDiff } from '../state/fieldWrites';
import type { ProjectCommand, ProjectDiff } from '../types/protocol';

const OWN_WRITE_TTL_MS = 8000;

interface OwnWrite {
  value: unknown;
  at: number;
}

export interface UseCollabNotificationsResult {
  message: string | null;
  dismiss: () => void;
  noteOwnCommand: (command: ProjectCommand) => void;
  handleDiff: (diff: ProjectDiff) => void;
}

function writeKey(entityId: string, field: string): string {
  return `${entityId}:${field}`;
}

export function useCollabNotifications(): UseCollabNotificationsResult {
  const [message, setMessage] = useState<string | null>(null);
  const ownWrites = useRef(new Map<string, OwnWrite>());

  const noteOwnCommand = useCallback((command: ProjectCommand) => {
    const now = Date.now();
    for (const write of fieldWritesFromCommand(command)) {
      ownWrites.current.set(writeKey(write.entityId, write.field), { value: write.value, at: now });
    }
  }, []);

  const handleDiff = useCallback((diff: ProjectDiff) => {
    const now = Date.now();
    for (const change of fieldWritesFromDiff(diff)) {
      const key = writeKey(change.entityId, change.field);
      const own = ownWrites.current.get(key);
      if (!own) continue;
      ownWrites.current.delete(key);
      const expired = now - own.at > OWN_WRITE_TTL_MS;
      if (!expired && JSON.stringify(own.value) !== JSON.stringify(change.value)) {
        setMessage(`Hodnota pole ${fieldLabel(change.field)} byla změněna jiným uživatelem`);
      }
    }
  }, []);

  const dismiss = useCallback(() => setMessage(null), []);

  return { message, dismiss, noteOwnCommand, handleDiff };
}
