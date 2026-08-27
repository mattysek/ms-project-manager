// Dialog historie verzí a obnovení starší verze (knowledge-base.feature).
//
// Vytaženo z `useKnowledgeBase`, aby zůstal pod rozpočtem ADR-012 na délku
// funkce.
import { useState } from 'react';
import type { KBPage } from '../../../types';

export function useKbHistory(
  selectedId: string | null,
  setKbPages: React.Dispatch<React.SetStateAction<KBPage[]>>
) {
  const [historyOpen, setHistoryOpen] = useState(false);

  return {
    historyOpen,
    openHistory: () => setHistoryOpen(true),
    closeHistory: () => setHistoryOpen(false),
    /**
     * Obnovení verze jde stejnou cestou jako běžná editace — proto se jen
     * přepíše obsah stránky. Původní znění tím spadne do historie taky,
     * takže je i obnovení vratné.
     */
    restoreRevision: (revision: { title: string; content: string }) => {
      if (!selectedId) return;
      setKbPages((pages) =>
        pages.map((page) =>
          page.id === selectedId
            ? {
                ...page,
                title: revision.title,
                content: revision.content,
                updatedAt: new Date().toISOString(),
              }
            : page
        )
      );
      setHistoryOpen(false);
    },
  };
}
