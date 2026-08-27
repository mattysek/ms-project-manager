import { useMemo, useState } from 'react';
import type { KBPage } from '../../../types';
import { markdownToHtml } from '../../../utils/htmlMarkdownConverter';
import { kbPageMatches } from './kbSearch';
import { useKbConflict } from './useKbConflict';
import { useKbCrud } from './useKbCrud';
import { useKbDraft } from './useKbDraft';
import { useKbEditingActions } from './useKbEditingActions';
import { useKbHistory } from './useKbHistory';

interface UseKnowledgeBaseArgs {
  kbPages: KBPage[];
  setKbPages: React.Dispatch<React.SetStateAction<KBPage[]>>;
}

function sortByUpdatedDesc(pages: KBPage[]): KBPage[] {
  return [...pages].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/** Stav a handlery KB view (dokumentace) — komponenta jen skládá JSX kolem tohohle hooku. */
export function useKnowledgeBase({ kbPages, setKbPages }: UseKnowledgeBaseArgs) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const draft = useKbDraft();

  const selectedPage = useMemo(
    () => kbPages.find((p) => p.id === selectedId) || null,
    [kbPages, selectedId]
  );
  const conflict = useKbConflict(selectedPage, isEditing, draft.editBaseUpdatedAt);

  // Filter + sort (Scenario: Vyhledávání hledá v názvech i obsahu).
  // Štítek a fulltext se kombinují — nejdřív zúžení na štítek, pak hledání.
  const sortedPages = useMemo(
    () =>
      sortByUpdatedDesc(
        kbPages
          .filter((p) => !activeTag || (p.tags ?? []).includes(activeTag))
          .filter((p) => kbPageMatches(p.title, p.content, searchQuery))
      ),
    [kbPages, searchQuery, activeTag]
  );

  // Sanitizováno v markdownToHtml — KB stránku mohl napsat jiný uživatel.
  const renderedContent = useMemo(
    () => (selectedPage ? markdownToHtml(selectedPage.content) : ''),
    [selectedPage]
  );

  const history = useKbHistory(selectedId, setKbPages);
  const crud = useKbCrud({ kbPages, setKbPages, selectedId, setSelectedId, setIsEditing, draft });
  const editing = useKbEditingActions({
    setKbPages,
    selectedId,
    setSelectedId,
    isEditing,
    setIsEditing,
    selectedPage,
    conflict,
    draft,
  });

  return {
    selectedId,
    isEditing,
    searchQuery,
    setSearchQuery,
    activeTag,
    setActiveTag,
    allPages: kbPages,
    ...history,
    selectedPage,
    conflict,
    sortedPages,
    renderedContent,
    draft,
    ...crud,
    ...editing,
  };
}

export type KnowledgeBaseState = ReturnType<typeof useKnowledgeBase>;
