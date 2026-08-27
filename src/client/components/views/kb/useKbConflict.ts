import { useEffect, useState } from 'react';
import type { KBPage } from '../../../types';

export interface KbConflict {
  serverTitle: string;
  serverContent: string;
}

/**
 * Detekuje, že stránku editovanou lokálně mezitím uložil jiný uživatel —
 * `page.updatedAt` se liší od hodnoty zaznamenané při vstupu do editace
 * (Scenario: Simultánní editace stejné KB stránky, knowledge-base.feature).
 * `kbPages` prop se aktualizuje diffem ze serveru (ADR-004), stačí tedy
 * sledovat, jestli se stránka editovaná POD RUKAMA nezměnila.
 */
export function useKbConflict(
  page: KBPage | null,
  isEditing: boolean,
  baseUpdatedAt: string | null
): KbConflict | null {
  const [conflict, setConflict] = useState<KbConflict | null>(null);

  useEffect(() => {
    if (!isEditing || !page || !baseUpdatedAt || page.updatedAt === baseUpdatedAt) {
      setConflict(null);
      return;
    }
    setConflict({ serverTitle: page.title, serverContent: page.content });
  }, [isEditing, page, baseUpdatedAt]);

  return conflict;
}
