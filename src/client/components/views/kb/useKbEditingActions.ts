import type { Dispatch, SetStateAction } from 'react';
import type { KBPage } from '../../../types';
import type { KbConflict } from './useKbConflict';
import type { KbDraft } from './useKbDraft';

interface UseKbEditingActionsArgs {
  setKbPages: Dispatch<SetStateAction<KBPage[]>>;
  selectedId: string | null;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  isEditing: boolean;
  setIsEditing: Dispatch<SetStateAction<boolean>>;
  selectedPage: KBPage | null;
  conflict: KbConflict | null;
  draft: KbDraft;
}

/** Vstup/uložení/zrušení editace a řešení konfliktu — vytažené z `useKnowledgeBase`. */
/** „provoz, docker" → `['provoz', 'docker']`; prázdné a duplicitní vypadnou. */
export function parseTags(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    ),
  ];
}

export function useKbEditingActions({
  setKbPages,
  selectedId,
  setSelectedId,
  isEditing,
  setIsEditing,
  selectedPage,
  conflict,
  draft,
}: UseKbEditingActionsArgs) {
  const startEdit = () => {
    if (!selectedPage) return;
    draft.setEditTitle(selectedPage.title);
    draft.setEditContent(selectedPage.content);
    draft.setEditTags((selectedPage.tags ?? []).join(', '));
    draft.setEditorTab('edit');
    draft.setEditBaseUpdatedAt(selectedPage.updatedAt);
    setIsEditing(true);
  };

  const saveEdit = () => {
    if (!selectedId) return;
    setKbPages((p) =>
      p.map((page) =>
        page.id === selectedId
          ? {
              ...page,
              title: draft.editTitle.trim() || page.title,
              content: draft.editContent,
              tags: parseTags(draft.editTags),
              updatedAt: new Date().toISOString(),
            }
          : page
      )
    );
    setIsEditing(false);
  };

  // U rozepsaných (neuložených) změn se nejdřív potvrzuje (Scenario: Zrušení editace bez uložení).
  const cancelEdit = () => {
    const dirty =
      !!selectedPage &&
      (draft.editTitle !== selectedPage.title || draft.editContent !== selectedPage.content);
    if (dirty && !confirm('Máte neuložené změny. Opravdu chcete zrušit?')) return;
    setIsEditing(false);
    draft.reset();
  };

  // Konflikt: „Obnovit" přebere serverovou verzi do draftu, „Zachovat mé
  // změny" jen posune baseline, aby se banner znovu neukázal na stejný diff.
  const restoreFromConflict = () => {
    if (!conflict) return;
    draft.setEditTitle(conflict.serverTitle);
    draft.setEditContent(conflict.serverContent);
    draft.setEditBaseUpdatedAt(selectedPage?.updatedAt ?? null);
  };
  const keepMineOverConflict = () => draft.setEditBaseUpdatedAt(selectedPage?.updatedAt ?? null);

  const selectPage = (id: string) => {
    if (isEditing && selectedId !== id) {
      if (confirm('Zahodit neuložené změny?')) {
        setIsEditing(false);
        setSelectedId(id);
      }
    } else {
      setSelectedId(id);
      setIsEditing(false);
    }
  };

  return { startEdit, saveEdit, cancelEdit, restoreFromConflict, keepMineOverConflict, selectPage };
}
