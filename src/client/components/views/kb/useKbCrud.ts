import type { Dispatch, SetStateAction } from 'react';
import type { KBPage } from '../../../types';
import { uid } from '../../../utils';
import type { KbDraft } from './useKbDraft';

interface UseKbCrudArgs {
  kbPages: KBPage[];
  setKbPages: Dispatch<SetStateAction<KBPage[]>>;
  selectedId: string | null;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  setIsEditing: Dispatch<SetStateAction<boolean>>;
  draft: KbDraft;
}

/** Vytvoření a smazání KB stránky — vytažené z `useKnowledgeBase`, ať zůstane krátký. */
export function useKbCrud({
  kbPages,
  setKbPages,
  selectedId,
  setSelectedId,
  setIsEditing,
  draft,
}: UseKbCrudArgs) {
  const addPage = () => {
    const now = new Date().toISOString();
    const newPage: KBPage = {
      id: uid(),
      title: 'Nová stránka',
      content: '# Nová stránka\n\nZde začněte psát...',
      createdAt: now,
      updatedAt: now,
    };
    setKbPages((p) => [newPage, ...p]);
    setSelectedId(newPage.id);
    setIsEditing(true);
    draft.setEditorTab('edit');
    draft.setEditTitle(newPage.title);
    draft.setEditContent(newPage.content);
    draft.setEditBaseUpdatedAt(newPage.updatedAt);
  };

  // Potvrzovací dialog jmenuje stránku (Scenario: Smazání KB stránky).
  const deletePage = (id: string) => {
    const target = kbPages.find((p) => p.id === id);
    if (!confirm(`Opravdu smazat stránku ${target?.title ?? ''}?`)) return;
    setKbPages((p) => p.filter((page) => page.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setIsEditing(false);
    }
  };

  return { addPage, deletePage };
}
